import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { erc721Abi, type Hex } from 'viem';
import { cleanupLiveFixture, createCartLiveFixture, jsonCommand, readTokenBalance, requireBuyerFixture,
  type BuyerLiveFixture } from './helpers/live-harness.js';
import { deployErc721Collection, mintToken } from './helpers/live-erc721.js';
import { createCreatorVariantSkus } from './helpers/cart-creator-variants.js';

type Preview = { preparation: { paymentAmount: string; lines: Array<{ fulfillmentKind: number; amount: string }> } };
type Purchase = { txHash: Hex; paymentAmount: string; actionCount: number };

describe.sequential('live Cart routed swaps through the generic CLI checkout', () => {
  let fixture: BuyerLiveFixture | undefined;
  beforeAll(async () => {
    if (process.env.RARE_API_BASE_URL === undefined) throw new Error('Cart swap live tests require RARE_API_BASE_URL.');
    const created = requireBuyerFixture(await createCartLiveFixture({ buyer: true }));
    fixture = created;
    if (created.chain !== 'sepolia') throw new Error('Cart swap live writes require Sepolia.');
  }, 240_000);
  afterAll(async () => { await cleanupLiveFixture(fixture); });

  it.each([
    ['--input-amount', '0.00001'],
    ['--output-amount', '0.01'],
  ])('receives ERC20 tokens using %s', async (amountFlag, amount) => {
    if (fixture === undefined) throw new Error('Live Cart fixture was not initialized.');
    const live = fixture;
    const args = ['cart', 'swap', '--payment-currency', 'eth', '--output-currency', 'rare',
      amountFlag, amount, '--recipient', live.buyerAddress, '--chain', live.chain];
    const preview = await jsonCommand<Preview>(live.buyerHome, [...args, '--preview']);
    const swapLine = preview.preparation.lines.find(line => line.fulfillmentKind === 6);
    expect(swapLine).toBeDefined();
    if (swapLine === undefined) throw new Error('Swap quote did not contain a currency-swap line.');
    const before = await readTokenBalance(live, live.buyerAddress, live.rareAddress);
    const purchase = await jsonCommand<Purchase>(live.buyerHome, [...args, '--yes'], 240_000);
    expect(purchase.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(purchase.actionCount).toBe(0);
    expect(await readTokenBalance(live, live.buyerAddress, live.rareAddress)).toBeGreaterThan(before);
    if (amountFlag === '--output-amount') expect(await readTokenBalance(live, live.buyerAddress, live.rareAddress) - before).toBe(10_000_000_000_000_000n);
    if (amountFlag === '--input-amount') expect(BigInt(purchase.paymentAmount)).toBe(10_000_000_000_000n);
  }, 300_000);

  it('combines an NFT listing and token output in one checkout', async () => {
    if (fixture === undefined) throw new Error('Live Cart fixture was not initialized.');
    const live = fixture;
    const collection = await deployErc721Collection(live, '1');
    const token = await mintToken(live, collection.contract);
    const [sku] = await createCreatorVariantSkus(live, [token]);
    const listingInput = join(live.tempDir, 'swap-mixed-listing.json');
    await writeFile(listingInput, JSON.stringify({ deadline: String(Math.floor(Date.now() / 1000) + 3600),
      listings: [{ sku, settlementCurrency: 'eth', unitPrice: '0.000001', quantity: '1' }] }));
    const listing = await jsonCommand<{ listingDigests: Hex[] }>(live.sellerHome,
      ['cart', 'listing', 'create', '--input', listingInput, '--chain', live.chain, '--yes'], 240_000);
    const listingDigest = listing.listingDigests[0];
    if (listingDigest === undefined) throw new Error('Mixed checkout fixture did not publish a listing.');
    const input = join(live.tempDir, 'swap-mixed-checkout.json');
    await writeFile(input, JSON.stringify({ items: [
      { kind: 'listing', listingDigest, quantity: '1' },
      { kind: 'swap', mode: 'exact-output', outputCurrency: 'rare', outputAmount: '0.01' },
    ] }));
    const before = await readTokenBalance(live, live.buyerAddress, live.rareAddress);
    const purchase = await jsonCommand<Purchase>(live.buyerHome, ['cart', 'checkout', '--input', input,
      '--payment-currency', 'eth', '--recipient', live.buyerAddress, '--chain', live.chain, '--yes'], 240_000);
    expect(purchase.actionCount).toBe(1);
    expect(await readTokenBalance(live, live.buyerAddress, live.rareAddress) - before).toBe(10_000_000_000_000_000n);
    expect((await live.publicClient.readContract({ address: collection.contract, abi: erc721Abi,
      functionName: 'ownerOf', args: [BigInt(token.tokenId)] })).toLowerCase()).toBe(live.buyerAddress.toLowerCase());
  }, 600_000);
});
