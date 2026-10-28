import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWalletClient, erc1155Abi, erc721Abi, http, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import type { EligibilityClaim, EligibilityRule, EligibilityRuleDefinition } from '@rareprotocol/rare-sdk';
import { cleanupLiveFixture, createCartLiveFixture, E2E_TOKEN_URI, expectTx, jsonCommand, requireBuyerFixture, type BuyerLiveFixture, type TxResult } from './helpers/live-harness.js';
import { deployErc721Collection, mintToken } from './helpers/live-erc721.js';
import { createCreatorVariantSkus } from './helpers/cart-creator-variants.js';

type Source = { contract: Address; tokenId: string; quantity: number; fulfillmentKind: 2 | 3 };
const kinds: EligibilityRuleDefinition['kind'][] = ['PRIMARY_SALE', 'EVERY_SALE', 'CURRENT_HOLDER'];
const standards = ['ERC721', 'ERC1155'] as const;
const available = (claims: EligibilityClaim[]): EligibilityClaim[] => claims.filter(claim => claim.status === 'AVAILABLE');
const consumed = (claims: EligibilityClaim[]): EligibilityClaim[] => claims.filter(claim => claim.status === 'CONSUMED');

describe.sequential('CLI per-copy eligibility for both NFT standards', () => {
  let fixture: BuyerLiveFixture;
  let reward: Source;
  let fileSequence = 0;
  const file = async (body: unknown): Promise<string> => {
    const path = join(fixture.tempDir, `eligibility-${fileSequence++}.json`);
    await writeFile(path, JSON.stringify(body));
    return path;
  };
  const edition = async (quantity: number): Promise<Source> => {
    const deployed = await jsonCommand<TxResult & { contract: Address }>(fixture.sellerHome, [
      'collection', 'deploy', 'erc1155', `Eligibility ${Date.now()}`, 'CLAIM', '--base-uri', E2E_TOKEN_URI, '--chain', fixture.chain,
    ], 240_000);
    expectTx(deployed);
    const token = await jsonCommand<TxResult & { tokenId: string }>(fixture.sellerHome, [
      'collection', 'erc1155', 'create-token', '--contract', deployed.contract, '--max-supply', String(quantity),
      '--token-uri', E2E_TOKEN_URI, '--chain', fixture.chain,
    ], 240_000);
    expectTx(token);
    expectTx(await jsonCommand<TxResult>(fixture.sellerHome, ['collection', 'erc1155', 'mint', '--contract', deployed.contract,
      '--token-id', token.tokenId, '--quantity', String(quantity), '--chain', fixture.chain], 240_000));
    return { contract: deployed.contract, tokenId: token.tokenId, quantity, fulfillmentKind: 3 };
  };
  const publish = async (source: Source): Promise<{ digest: Hex; sku: Hex }> => {
    const [sku] = await createCreatorVariantSkus(fixture, [source]);
    if (!sku) throw new Error('Creator variant flow returned no SKU.');
    const input = await file({ deadline: String(Math.floor(Date.now() / 1000) + 3600), listings: [{ sku,
      settlementCurrency: 'eth', unitPrice: '0.000001', quantity: String(source.quantity),
      fulfillmentKind: source.fulfillmentKind === 3 ? 'ERC1155_TRANSFER' : 'ERC721_TRANSFER' }] });
    const published = await jsonCommand<{ listingDigests: Hex[] }>(fixture.sellerHome, [
      'cart', 'listing', 'create', '--input', input, '--chain', fixture.chain,
    ], 300_000);
    const digest = published.listingDigests[0];
    if (!digest) throw new Error('Published Listing has no digest.');
    return { digest, sku };
  };
  const checkout = async (digest: Hex, quantity: number): Promise<void> => {
    const args = ['cart', 'checkout', '--listing', `${digest}=${quantity}`, '--payment-currency', 'eth', '--chain', fixture.chain];
    const quote = await jsonCommand<{ preparation: { paymentAmount: string } }>(fixture.buyerHome, [...args, '--preview']);
    expect(BigInt(quote.preparation.paymentAmount)).toBeLessThanOrEqual(1_000_000_000_000_000n);
    const purchase = await jsonCommand<TxResult>(fixture.buyerHome, args, 300_000);
    expectTx(purchase);
  };
  const transfer = async (source: Source, quantity: number, back: boolean): Promise<void> => {
    const lease = back ? fixture.sellerWallet : fixture.buyerWallet;
    if (!lease) throw new Error('Eligibility transfers require the reserved buyer wallet.');
    const account = privateKeyToAccount(lease.privateKey);
    const wallet = createWalletClient({ account, chain: sepolia, transport: http(process.env.TEST_RPC_URL) });
    const from = back ? fixture.sellerAddress : fixture.buyerAddress;
    const to = back ? fixture.buyerAddress : fixture.sellerAddress;
    const hash = source.fulfillmentKind === 3
      ? await wallet.writeContract({ address: source.contract, abi: erc1155Abi, functionName: 'safeTransferFrom',
        args: [from, to, BigInt(source.tokenId), BigInt(quantity), '0x'] })
      : await wallet.writeContract({ address: source.contract, abi: erc721Abi, functionName: 'transferFrom', args: [from, to, BigInt(source.tokenId)] });
    expect((await fixture.publicClient.waitForTransactionReceipt({ hash })).status).toBe('success');
  };

  beforeAll(async () => {
    fixture = requireBuyerFixture(await createCartLiveFixture({ buyer: true }));
    if (fixture.chain !== 'sepolia') throw new Error('Eligibility standards E2E requires Sepolia.');
    await jsonCommand(fixture.sellerHome, ['cart', 'purchase-eligibility', 'rules', 'list']);
    await jsonCommand(fixture.buyerHome, ['cart', 'purchase-eligibility', 'claims', 'list']);
    reward = await edition(100);
  }, 600_000);
  afterAll(async () => cleanupLiveFixture(fixture));

  it.each(standards.flatMap(standard => kinds.map(kind => ({ standard, kind }))))(
    '$standard $kind grants per copy and preserves consumed rights across transfers', async ({ standard, kind }) => {
        const source: Source = standard === 'ERC1155' ? await edition(5) : await (async (): Promise<Source> => {
          const collection = await deployErc721Collection(fixture, '1');
          const token = await mintToken(fixture, collection.contract);
          return { contract: collection.contract, tokenId: token.tokenId, quantity: 1, fulfillmentKind: 2 };
        })();
        const target = await publish({ ...reward, quantity: 20 });
        const input = await file({ definition: { kind, source: { chainId: String(fixture.chainId),
          tokenContract: source.contract, tokenIds: [source.tokenId] }, targets: [{ sku: target.sku }] } });
        const rule = await jsonCommand<EligibilityRule>(fixture.sellerHome, ['cart', 'purchase-eligibility', 'rules', 'create', '--input', input, '--chain', fixture.chain]);
        try {
          await jsonCommand(fixture.sellerHome, ['cart', 'purchase-eligibility', 'listing-requirements', 'set', '--listing-digest', target.digest, '--rule-id', rule.id, '--chain', fixture.chain]);
          const claims = (home = fixture.buyerHome): Promise<EligibilityClaim[]> => jsonCommand<{ data: EligibilityClaim[] }>(home, ['cart', 'purchase-eligibility', 'claims', 'list', '--rule-id', rule.id]).then(page => page.data);
          const listing = await publish(source);
          await checkout(listing.digest, source.quantity);
          await expect.poll(async () => available(await claims()).length, { timeout: 180_000, interval: 2_000 }).toBe(source.quantity);
          const redeem = standard === 'ERC1155' ? 2 : 1;
          await checkout(target.digest, redeem);
          await expect.poll(async () => consumed(await claims()).length, { timeout: 180_000, interval: 2_000 }).toBe(redeem);
          const consumedIds = consumed(await claims()).map(claim => claim.id).sort();
          const moved = standard === 'ERC1155' ? 2 : 1;
          await transfer(source, moved, false);
          if (kind === 'CURRENT_HOLDER') {
            await expect.poll(async () => available(await claims(fixture.sellerHome)).length, { timeout: 180_000, interval: 2_000 }).toBe(standard === 'ERC1155' ? 2 : 0);
            await expect.poll(async () => available(await claims()).length, { timeout: 180_000, interval: 2_000 }).toBe(standard === 'ERC1155' ? 1 : 0);
          } else {
            expect(available(await claims())).toHaveLength(source.quantity - redeem);
            expect(available(await claims(fixture.sellerHome))).toHaveLength(0);
          }
          await transfer(source, moved, true);
          await expect.poll(async () => available(await claims()).length, { timeout: 180_000, interval: 2_000 }).toBe(source.quantity - redeem);
          expect(consumed(await claims()).map(claim => claim.id).sort()).toEqual(consumedIds);
          if (kind !== 'CURRENT_HOLDER') {
            await transfer(source, moved, false);
            const resale = await publish({ ...source, quantity: moved });
            await checkout(resale.digest, moved);
            await expect.poll(async () => available(await claims()).length, { timeout: 180_000, interval: 2_000 })
              .toBe(source.quantity - redeem + (kind === 'EVERY_SALE' ? moved : 0));
          }
        } finally {
          await jsonCommand(fixture.sellerHome, ['cart', 'purchase-eligibility', 'rules', 'disable', '--rule-id', rule.id]);
        }
    }, 900_000);
});
