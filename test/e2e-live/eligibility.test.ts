import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EligibilityClaim, EligibilityRule } from '@rareprotocol/rare-sdk';
import { cartAbi, getCartAddress } from '@rareprotocol/rare-sdk/contracts';
import { erc721Abi, type Hex } from 'viem';
import { cleanupLiveFixture, createCartLiveFixture, expectTx, jsonCommand, requireBuyerFixture, type TxResult } from './helpers/live-harness.js';
import { deployErc721Collection, mintToken } from './helpers/live-erc721.js';
import { createCreatorVariantSkus } from './helpers/cart-creator-variants.js';

describe('eligibility through the built CLI and deployed Rare API', () => {
  it('creates a creator-owned rule using a fresh SKU, lists claims and disables the rule', async () => {
    if (!process.env.RARE_API_BASE_URL) throw new Error('Set RARE_API_BASE_URL to a deployed eligibility API.');
    const fixture = await createCartLiveFixture();
    try {
      await jsonCommand<{ data: EligibilityRule[] }>(fixture.sellerHome, ['cart', 'purchase-eligibility', 'rules', 'list']).then(page => page.data);
      const collection = await deployErc721Collection(fixture, '1');
      const token = await mintToken(fixture, collection.contract);
      const [sku] = await createCreatorVariantSkus(fixture, [token]);
      if (sku === undefined) throw new Error('Eligibility fixture requires a SKU.');
      const file = join(fixture.tempDir, 'eligibility-rule.json');
      await writeFile(file, JSON.stringify({ definition: {
        kind: 'EVERY_SALE',
        source: { chainId: String(fixture.chainId), tokenContract: collection.contract },
        targets: [{ sku }],
      } }), 'utf8');
      const rule = await jsonCommand<EligibilityRule>(fixture.sellerHome, [
        'cart', 'purchase-eligibility', 'rules', 'create', '--input', file, '--chain', fixture.chain,
      ]);
      try {
        expect(rule.definition.kind).toBe('EVERY_SALE');
        const listingFile = join(fixture.tempDir, 'gated-listing.json');
        await writeFile(listingFile, JSON.stringify({ deadline: String(Math.floor(Date.now() / 1000) + 3600),
          listings: [{ sku, settlementCurrency: 'eth', unitPrice: '0.000001', quantity: '1' }] }), 'utf8');
        const published = await jsonCommand<{ listingDigests: string[] }>(fixture.sellerHome, [
          'cart', 'listing', 'create', '--input', listingFile, '--eligibility-rule-id', rule.id, '--chain', fixture.chain,
        ]);
        expect(published.listingDigests).toHaveLength(1);
        const rules = await jsonCommand<{ data: EligibilityRule[] }>(fixture.sellerHome, ['cart', 'purchase-eligibility', 'rules', 'list']).then(page => page.data);
        expect(rules.some(candidate => candidate.id === rule.id)).toBe(true);
        const claims = await jsonCommand<{ data: EligibilityClaim[] }>(fixture.sellerHome, [
          'cart', 'purchase-eligibility', 'claims', 'list', '--rule-id', rule.id,
        ]).then(page => page.data);
        expect(claims).toEqual([]);
      } finally {
        expect(await jsonCommand(fixture.sellerHome, ['cart', 'purchase-eligibility', 'rules', 'disable', '--rule-id', rule.id]))
          .toEqual({ ruleId: rule.id, disabled: true });
      }
    } finally {
      await cleanupLiveFixture(fixture);
    }
  }, 420_000);

  it('issues a claim from an NFT purchase and consumes it when the buyer redeems one gated reward', async () => {
    const fixture = requireBuyerFixture(await createCartLiveFixture({ buyer: true }));
    try {
      if (fixture.chain !== 'sepolia') throw new Error('Eligibility lifecycle E2E requires Sepolia.');
      // Fail before deploying assets when the eligibility API or buyer account is unavailable.
      await jsonCommand<{ data: EligibilityRule[] }>(fixture.sellerHome, ['cart', 'purchase-eligibility', 'rules', 'list']).then(page => page.data);
      await jsonCommand<{ data: EligibilityClaim[] }>(fixture.buyerHome, ['cart', 'purchase-eligibility', 'claims', 'list']).then(page => page.data);
      const collection = await deployErc721Collection(fixture, '3');
      const source = await mintToken(fixture, collection.contract);
      const reward = await mintToken(fixture, collection.contract);
      const alternative = await mintToken(fixture, collection.contract);
      const [sourceSku, rewardSku, alternativeSku] = await createCreatorVariantSkus(fixture, [source, reward, alternative]);
      if (!sourceSku || !rewardSku || !alternativeSku) throw new Error('Eligibility lifecycle requires three creator-owned SKUs.');
      const file = join(fixture.tempDir, 'purchase-claim-rule.json');
      await writeFile(file, JSON.stringify({ definition: {
        kind: 'EVERY_SALE',
        source: { chainId: String(fixture.chainId), tokenContract: collection.contract, tokenIds: [source.tokenId] },
        targets: [{ sku: rewardSku }, { sku: alternativeSku }],
      } }), 'utf8');
      const rule = await jsonCommand<EligibilityRule>(fixture.sellerHome, [
        'cart', 'purchase-eligibility', 'rules', 'create', '--input', file, '--chain', fixture.chain,
      ]);
      try {
        const publish = async (sku: Hex, gated: boolean): Promise<Hex> => {
          const listingFile = join(fixture.tempDir, `claim-listing-${sku}.json`);
          await writeFile(listingFile, JSON.stringify({ deadline: String(Math.floor(Date.now() / 1000) + 3600),
            listings: [{ sku, settlementCurrency: 'eth', unitPrice: '0.000001', quantity: '1' }] }), 'utf8');
          const result = await jsonCommand<{ listingDigests: Hex[] }>(fixture.sellerHome, [
            'cart', 'listing', 'create', '--input', listingFile,
            ...(gated ? ['--eligibility-rule-id', rule.id] : []), '--chain', fixture.chain,
          ]);
          expect(result.listingDigests).toHaveLength(1);
          const listingDigest = result.listingDigests[0];
          if (!listingDigest) throw new Error('Published eligibility Listing has no digest.');
          return listingDigest;
        };
        const sourceListing = await publish(sourceSku, false);
        const rewardListing = await publish(rewardSku, true);
        const alternativeListing = await publish(alternativeSku, true);
        const claims = (): Promise<EligibilityClaim[]> => jsonCommand<{ data: EligibilityClaim[] }>(fixture.buyerHome, [
          'cart', 'purchase-eligibility', 'claims', 'list', '--rule-id', rule.id,
        ]).then(page => page.data);
        const checkout = async (listingDigest: Hex): Promise<TxResult & { txHash: Hex; orderId: Hex }> => {
          const args = ['cart', 'checkout', '--listing', listingDigest, '--payment-currency', 'eth', '--chain', fixture.chain];
          const quote = await jsonCommand<{ preparation: { paymentAmount: string } }>(fixture.buyerHome, [...args, '--preview']);
          expect(BigInt(quote.preparation.paymentAmount)).toBeLessThanOrEqual(1_000_000_000_000_000n);
          return jsonCommand<TxResult & { txHash: Hex; orderId: Hex }>(fixture.buyerHome, args, 240_000);
        };
        expect(await claims()).toEqual([]);
        await expect(checkout(rewardListing)).rejects.toThrow(/Insufficient unreserved claims/u);
        const sourcePurchase = await checkout(sourceListing);
        expectTx(sourcePurchase);
        await expect(fixture.publicClient.readContract({ address: collection.contract, abi: erc721Abi,
          functionName: 'ownerOf', args: [BigInt(source.tokenId)] })).resolves.toBe(fixture.buyerAddress);
        await expect.poll(claims, { timeout: 180_000, interval: 2_000 }).toMatchObject([
          { ruleId: rule.id, status: 'AVAILABLE', allowedSkus: expect.arrayContaining([rewardSku.toLowerCase(), alternativeSku.toLowerCase()]) },
        ]);
        const [issued] = await claims();
        if (!issued) throw new Error('Indexed NFT purchase did not issue a claim.');
        const redemption = await checkout(rewardListing);
        expectTx(redemption);
        await expect(fixture.publicClient.readContract({ address: getCartAddress(fixture.chain), abi: cartAbi,
          functionName: 'executedOrderIds', args: [redemption.orderId] })).resolves.toBe(true);
        await expect.poll(claims, { timeout: 180_000, interval: 2_000 }).toMatchObject([{ id: issued.id, status: 'CONSUMED' }]);
        expect(await claims()).toHaveLength(1);
        await expect(fixture.publicClient.readContract({ address: collection.contract, abi: erc721Abi,
          functionName: 'ownerOf', args: [BigInt(reward.tokenId)] })).resolves.toBe(fixture.buyerAddress);
        // Inventory remains available, so this must fail for eligibility rather than stock.
        await expect(fixture.publicClient.readContract({ address: collection.contract, abi: erc721Abi,
          functionName: 'ownerOf', args: [BigInt(alternative.tokenId)] })).resolves.toBe(fixture.sellerAddress);
        await expect(checkout(alternativeListing)).rejects.toThrow(/Insufficient unreserved claims/u);
        expect(await claims()).toMatchObject([{ id: issued.id, status: 'CONSUMED' }]);
      } finally {
        await jsonCommand(fixture.sellerHome, ['cart', 'purchase-eligibility', 'rules', 'disable', '--rule-id', rule.id]);
      }
    } finally {
      await cleanupLiveFixture(fixture);
    }
  }, 900_000);
});
