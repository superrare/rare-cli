import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EligibilityClaim, EligibilityRule } from '@rareprotocol/rare-sdk';
import { cleanupLiveFixture, createCartLiveFixture, jsonCommand } from './helpers/live-harness.js';
import { deployErc721Collection, mintToken } from './helpers/live-erc721.js';
import { createCreatorVariantSkus } from './helpers/cart-creator-variants.js';

describe('eligibility through the built CLI and deployed Rare API', () => {
  it('creates a creator-owned rule using a fresh SKU, lists claims and disables the rule', async () => {
    if (!process.env.RARE_API_BASE_URL) throw new Error('Set RARE_API_BASE_URL to a deployed eligibility API.');
    const fixture = await createCartLiveFixture();
    try {
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
        'eligibility', 'rules', 'create', '--input', file, '--chain', fixture.chain,
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
        const rules = await jsonCommand<EligibilityRule[]>(fixture.sellerHome, ['eligibility', 'rules', 'list']);
        expect(rules.some(candidate => candidate.id === rule.id)).toBe(true);
        const claims = await jsonCommand<EligibilityClaim[]>(fixture.sellerHome, [
          'eligibility', 'claims', 'list', '--rule-id', rule.id,
        ]);
        expect(claims).toEqual([]);
      } finally {
        expect(await jsonCommand(fixture.sellerHome, ['eligibility', 'rules', 'disable', '--rule-id', rule.id]))
          .toEqual({ ruleId: rule.id, disabled: true });
      }
    } finally {
      await cleanupLiveFixture(fixture);
    }
  }, 420_000);
});
