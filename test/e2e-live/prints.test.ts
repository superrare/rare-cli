import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EligibilityRule } from '@rareprotocol/rare-sdk';
import type { Address, Hex } from 'viem';
import { cleanupLiveFixture, createCartLiveFixture, E2E_TOKEN_URI, jsonCommand } from './helpers/live-harness.js';
import { deployErc721Collection, mintToken } from './helpers/live-erc721.js';
import { createCreatorVariantSkus } from './helpers/cart-creator-variants.js';

describe('print tooling through the built CLI and deployed Rare API', () => {
  it('uploads a private master, publishes a print and quotes generic checkout with saved shipping', async () => {
    const fixture = await createCartLiveFixture();
    const addressId = randomUUID();
    try {
      if (fixture.chain !== 'sepolia') throw new Error('Print tooling live E2E requires Sepolia.');
      const specifications = await jsonCommand<{ id: string }[]>(fixture.sellerHome, ['prints', 'specifications']);
      const specification = specifications[0];
      if (specification === undefined) throw new Error('Print tooling requires at least one supported specification.');
      const image = join(fixture.tempDir, 'print.png');
      await writeFile(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9uQAAAAASUVORK5CYII=', 'base64'));
      const master = await jsonCommand<{ access: string; key: string; url?: string }>(fixture.sellerHome, ['uploads', 'upload', image, '--access', 'private', '--content-type', 'image/png']);
      expect(master.access).toBe('private');
      expect(master.url).toBeUndefined();
      const media = await jsonCommand<{ access: string; url: string }>(fixture.sellerHome, ['uploads', 'upload', image, '--access', 'public', '--content-type', 'image/png']);
      expect(media.access).toBe('public');
      const name = `CLI print ${randomUUID()}`;
      const file = join(fixture.tempDir, 'print.json');
      await writeFile(file, JSON.stringify({ idempotencyKey: randomUUID(), chainId: '11155111', name,
        print: { name, description: 'CLI live draft', tags: ['test'], productionUploadKey: master.key,
          images: [media.url], specificationId: specification.id } }));
      const drop = await jsonCommand<{ id: string }>(fixture.sellerHome, ['prints', 'drops', 'create', '--input', file]);
      try {
        expect(await jsonCommand(fixture.sellerHome, ['prints', 'drops', 'get', '--id', drop.id])).toMatchObject({ id: drop.id });
        const patch = join(fixture.tempDir, 'print-patch.json');
        await writeFile(patch, JSON.stringify({ name: `${name} updated`, tags: ['test', 'edited'] }));
        expect(await jsonCommand(fixture.sellerHome, ['prints', 'drops', 'update', '--id', drop.id, '--input', patch]))
          .toMatchObject({ metadata: { name: `${name} updated`, tags: ['test', 'edited'] } });
        expect(await jsonCommand(fixture.sellerHome, ['orders', 'list'])).toMatchObject({ data: expect.any(Array) });
        const option = await jsonCommand<{ id: string; sku: string }>(fixture.sellerHome, [
          'prints', 'drops', 'configure', '--id', drop.id, '--price-usd-cents', '10000',
        ]);
        const terms = join(fixture.tempDir, 'listing.json');
        await writeFile(terms, JSON.stringify({ optionId: option.id, seller: fixture.sellerAddress,
          listingSalt: `0x${randomBytes(32).toString('hex')}`, deadline: String(Math.floor(Date.now() / 1000) + 3600),
          availableQuantity: '10', fulfillmentKind: 1, maxQuantityPerCheckout: '3' }));
        const publication = await jsonCommand<{ signedArtifact: { entries: { listingDigest: string }[] } }>(fixture.sellerHome, [
          'prints', 'listing', 'publish', '--input', terms, '--chain', fixture.chain, '--yes',
        ]);
        const listing = publication.signedArtifact.entries[0];
        if (listing === undefined) throw new Error('Print publication returned no Listing entry.');
        const publicDrop = await jsonCommand<{ metadata: Record<string, unknown>; options: { listingDigest: string; maxQuantityPerCheckout: string; eligibilityRuleId: string | null }[] }>(fixture.sellerHome, ['prints', 'get', '--id', drop.id]);
        expect(publicDrop.options).toEqual(expect.arrayContaining([
          expect.objectContaining({ listingDigest: listing.listingDigest, maxQuantityPerCheckout: '3', eligibilityRuleId: null }),
        ]));
        expect(publicDrop.metadata).not.toHaveProperty('productionUploadKey');
        expect(await jsonCommand(fixture.sellerHome, ['prints', 'activity', '--id', drop.id])).toMatchObject({ events: [] });
        const address = join(fixture.tempDir, 'shipping.json');
        await writeFile(address, JSON.stringify({ id: addressId, label: 'CLI test', makeDefault: false,
          details: { name: 'CLI test', email: 'cli-test@example.com', phoneNumber: '+12025550123',
            addressLine1: '123 Test Street', townOrCity: 'New York', stateOrCounty: 'NY', postalOrZipCode: '10001', countryCode: 'US' } }));
        const saved = await jsonCommand<{ id: string }[]>(fixture.sellerHome, ['shipping', 'save', '--input', address]);
        try {
          expect(saved.some(item => item.id === addressId)).toBe(true);
          const loaded = await jsonCommand<{ id: string }[]>(fixture.sellerHome, ['shipping', 'list']);
          expect(loaded.some(item => item.id === addressId)).toBe(true);
          const checkout = await jsonCommand<{ preparation: { paymentAmount: string; intent: { items: { quantity: string }[] }; breakdown: { displayPrice: string; shipping: string; total: string } }; preparedPurchase: { executePurchase: { lines: { listingDigest: string; quantity: string }[]; platformSignature: string } } }>(fixture.sellerHome, [
            'cart', 'checkout', '--listing', `${listing.listingDigest}=2`, '--payment-currency', 'usdc',
            '--saved-address-id', addressId, '--chain', fixture.chain, '--prepare-only', '--yes',
          ]);
          expect(checkout.preparation.intent.items[0]?.quantity).toBe('2');
          expect(checkout.preparation.breakdown.displayPrice).toBe('200000000');
          expect(BigInt(checkout.preparation.breakdown.shipping)).toBeGreaterThanOrEqual(0n);
          expect(checkout.preparation.breakdown.total).toBe(checkout.preparation.paymentAmount);
          expect(checkout.preparedPurchase.executePurchase.lines.find(line => line.listingDigest === listing.listingDigest)?.quantity).toBe('2');
          expect(checkout.preparedPurchase.executePurchase.platformSignature).not.toBe('0x');
          const mixedNft = await deployErc721Collection(fixture, '1');
          const nft = await mintToken(fixture, mixedNft.contract);
          const mixedEdition = await jsonCommand<{ contract: Address }>(fixture.sellerHome, [
            'collection', 'deploy', 'erc1155', `Mixed print ${randomUUID()}`, 'MIX', '--base-uri', E2E_TOKEN_URI, '--chain', fixture.chain,
          ], 240_000);
          const edition = await jsonCommand<{ tokenId: string }>(fixture.sellerHome, [
            'collection', 'erc1155', 'create-token', '--contract', mixedEdition.contract, '--max-supply', '10',
            '--token-uri', E2E_TOKEN_URI, '--chain', fixture.chain,
          ], 240_000);
          await jsonCommand(fixture.sellerHome, ['collection', 'erc1155', 'mint', '--contract', mixedEdition.contract,
            '--token-id', edition.tokenId, '--quantity', '2', '--chain', fixture.chain], 240_000);
          const skus = await createCreatorVariantSkus(fixture, [nft,
            { contract: mixedEdition.contract, tokenId: edition.tokenId, fulfillmentKind: 3 }]);
          const mixedTerms = join(fixture.tempDir, 'mixed-listings.json');
          await writeFile(mixedTerms, JSON.stringify({ deadline: String(Math.floor(Date.now() / 1000) + 3600),
            listings: skus.map((sku, index) => ({ sku, settlementCurrency: 'eth', unitPrice: '0.000001',
              quantity: index === 0 ? '1' : '2', fulfillmentKind: index === 0 ? 'ERC721_TRANSFER' : 'ERC1155_TRANSFER' })) }));
          const mixedListings = await jsonCommand<{ listingDigests: Hex[] }>(fixture.sellerHome, [
            'cart', 'listing', 'create', '--input', mixedTerms, '--chain', fixture.chain, '--yes',
          ], 300_000);
          const [nftDigest, editionDigest] = mixedListings.listingDigests;
          if (!nftDigest || !editionDigest) throw new Error('Mixed delivery requires both NFT Listings.');
          const mixed = await jsonCommand<{ preparation: { intent: { items: unknown[] }; idempotencyKey: string };
            preparedPurchase: { executePurchase: { order: { orderId: string }; lines: { listingDigest: string; quantity: string; fulfillmentKind: number; amount: string }[];
              actions: { lineIndex: string; quantity: string }[] } } }>(fixture.sellerHome, [
            'cart', 'checkout', '--listing', nftDigest, '--listing', `${listing.listingDigest}=2`, '--listing', `${editionDigest}=2`,
            '--output-currency', 'rare', '--output-amount', '0.01', '--payment-currency', 'usdc',
            '--saved-address-id', addressId, '--chain', fixture.chain, '--prepare-only', '--yes',
          ], 300_000);
          expect(mixed.preparation.intent.items).toHaveLength(4);
          const mixedLines = mixed.preparedPurchase.executePurchase.lines;
          expect(mixedLines.find(line => line.listingDigest === nftDigest)).toMatchObject({ quantity: '1', fulfillmentKind: 2 });
          expect(mixedLines.find(line => line.listingDigest === editionDigest)).toMatchObject({ quantity: '2', fulfillmentKind: 3 });
          expect(mixedLines.find(line => line.listingDigest === listing.listingDigest)).toMatchObject({ quantity: '2', fulfillmentKind: 1 });
          expect(mixedLines.find(line => line.fulfillmentKind === 6)).toMatchObject({ amount: '10000000000000000' });
          expect(mixed.preparedPurchase.executePurchase.actions.map(action => ({ quantity: action.quantity,
            kind: mixedLines[Number(action.lineIndex)]?.fulfillmentKind }))).toEqual(expect.arrayContaining([
            { quantity: '1', kind: 2 }, { quantity: '2', kind: 3 },
          ]));
          const mixedOrder = await jsonCommand<{ fulfillments: { orderLineIndex: number }[] }>(fixture.sellerHome, [
            'orders', 'get', '--id', mixed.preparedPurchase.executePurchase.order.orderId,
          ]);
          expect(mixedOrder.fulfillments).toHaveLength(1);
          expect(mixedOrder.fulfillments[0]?.orderLineIndex).toBe(mixedLines.findIndex(line => line.listingDigest === listing.listingDigest));
          await expect(jsonCommand(fixture.sellerHome, [
            'cart', 'checkout', '--listing', `${listing.listingDigest}=4`, '--payment-currency', 'usdc',
            '--saved-address-id', addressId, '--chain', fixture.chain, '--preview',
          ])).rejects.toThrow(/"Status: 422"/u);
          const collection = await deployErc721Collection(fixture, '1');
          const ruleFile = join(fixture.tempDir, 'print-rule.json');
          await writeFile(ruleFile, JSON.stringify({ definition: { kind: 'EVERY_SALE',
            source: { chainId: String(fixture.chainId), tokenContract: collection.contract }, targets: [{ sku: option.sku }] } }));
          const rule = await jsonCommand<EligibilityRule>(fixture.sellerHome, ['eligibility', 'rules', 'create', '--input', ruleFile]);
          try {
            const gatedTerms = join(fixture.tempDir, 'gated-print-listing.json');
            await writeFile(gatedTerms, JSON.stringify({ optionId: option.id, seller: fixture.sellerAddress,
              listingSalt: `0x${randomBytes(32).toString('hex')}`, deadline: String(Math.floor(Date.now() / 1000) + 3600),
              availableQuantity: '10', fulfillmentKind: 1, eligibilityRuleId: rule.id }));
            const gated = await jsonCommand<{ signedArtifact: { entries: { listingDigest: string }[] } }>(fixture.sellerHome, [
              'prints', 'listing', 'publish', '--input', gatedTerms, '--chain', fixture.chain, '--yes',
            ]);
            const gatedListing = gated.signedArtifact.entries[0];
            if (gatedListing === undefined) throw new Error('Gated print publication returned no Listing entry.');
            const gatedDrop = await jsonCommand<{ options: { listingDigest: string; maxQuantityPerCheckout: string; eligibilityRuleId: string | null }[] }>(fixture.sellerHome, ['prints', 'get', '--id', drop.id]);
            expect(gatedDrop.options).toEqual(expect.arrayContaining([
              expect.objectContaining({ listingDigest: gatedListing.listingDigest, maxQuantityPerCheckout: '1', eligibilityRuleId: rule.id }),
            ]));
            await expect(jsonCommand(fixture.sellerHome, [
              'cart', 'checkout', '--listing', gatedListing.listingDigest, '--payment-currency', 'usdc',
              '--saved-address-id', addressId, '--chain', fixture.chain, '--prepare-only', '--yes',
            ])).rejects.toThrow(/"Status: 409"/u);
          } finally {
            await jsonCommand(fixture.sellerHome, ['eligibility', 'rules', 'disable', '--rule-id', rule.id]);
          }
          // Authorization only. Never approve tokens, pay or submit a physical fulfillment order.
        } finally {
          const remaining = await jsonCommand<{ id: string }[]>(fixture.sellerHome, ['shipping', 'delete', '--id', addressId]);
          expect(remaining.some(item => item.id === addressId)).toBe(false);
        }
      } finally {
        await jsonCommand(fixture.sellerHome, ['prints', 'drops', 'archive', '--id', drop.id]);
      }
    } finally {
      await cleanupLiveFixture(fixture);
    }
  }, 900_000);
});
