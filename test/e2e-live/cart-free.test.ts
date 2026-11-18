import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CartCheckoutPreparation, CartOrder } from '@rareprotocol/rare-sdk';
import { cartAbi, getCartAddress } from '@rareprotocol/rare-sdk/contracts';
import { erc721Abi, parseEventLogs, type Address, type Hex } from 'viem';
import { cleanupLiveFixture, createCartLiveFixture, jsonCommand, requireBuyerFixture } from './helpers/live-harness.js';
import { createCreatorMintVariantSku, createCreatorVariantSkus } from './helpers/cart-creator-variants.js';
import { deployErc721Collection, mintToken } from './helpers/live-erc721.js';
import { nftFixtureManifest } from './helpers/nft-fixture-manifest.js';
import { verifyPrivateCartOrder } from './helpers/cart-order-history.js';
import { verifyCartPurchaseNotifications } from './helpers/cart-notifications.js';

describe('free Cart merchandise through the built CLI', () => {
  it('transfers an existing NFT and mints a new NFT at zero merchandise price', async () => {
    const fixture = requireBuyerFixture(await createCartLiveFixture({ buyer: true }));
    try {
      if (fixture.chain !== 'sepolia') throw new Error('Free Cart E2E requires Sepolia.');
      const existing = await deployErc721Collection(fixture, '1');
      const token = await mintToken(fixture, existing.contract);
      const [transferSku] = await createCreatorVariantSkus(fixture, [token]);
      if (!transferSku) throw new Error('Free transfer requires a creator SKU.');
      const lazy = await jsonCommand<{ contract: Address }>(fixture.sellerHome, [
        'collection', 'deploy', 'lazy-erc721', 'Free Cart mint', 'FREE', '--max-tokens', '1', '--chain', fixture.chain,
      ], 240_000);
      await jsonCommand(fixture.sellerHome, [
        'collection', 'prepare-lazy-mint', '--contract', lazy.contract, '--base-uri',
        `ipfs://${nftFixtureManifest.metadataCid}/lazy`, '--amount', '1', '--minter', getCartAddress(fixture.chain), '--chain', fixture.chain,
      ], 240_000);
      const mintSku = await createCreatorMintVariantSku(fixture, lazy.contract);
      const terms = join(fixture.tempDir, 'free-listings.json');
      await writeFile(terms, JSON.stringify({ deadline: String(Math.floor(Date.now() / 1000) + 3600), listings: [
        { sku: transferSku, settlementCurrency: 'eth', unitPrice: '0', quantity: '1', fulfillmentKind: 'ERC721_TRANSFER' },
        { sku: mintSku, settlementCurrency: 'eth', unitPrice: '0', quantity: '1', fulfillmentKind: 'ERC721_MINT_TO' },
      ] }));
      const publication = await jsonCommand<{ listingDigests: Hex[] }>(fixture.sellerHome, [
        'cart', 'listing', 'create', '--input', terms, '--chain', fixture.chain, '--yes',
      ], 300_000);
      expect(publication.listingDigests).toHaveLength(2);
      const args = ['cart', 'checkout', ...publication.listingDigests.flatMap(digest => ['--listing', digest]),
        '--payment-currency', 'eth', '--chain', fixture.chain];
      const preview = await jsonCommand<{ preparation: CartCheckoutPreparation }>(fixture.buyerHome, [...args, '--preview']);
      const merchandise = preview.preparation.lines.filter(line => line.fulfillmentKind === 2 || line.fulfillmentKind === 4);
      expect(merchandise).toHaveLength(2);
      expect(merchandise.map(line => BigInt(line.amount))).toEqual([0n, 0n]);
      // A free item does not waive separate platform charges, if configured.
      const fees = preview.preparation.lines.filter(line => line.fulfillmentKind === 0);
      expect(BigInt(preview.preparation.paymentAmount)).toBe(fees.reduce((total, line) => total + BigInt(line.amount), 0n));
      const purchase = await jsonCommand<{ txHash: Hex; orderId: Hex }>(fixture.buyerHome, [...args, '--yes'], 300_000);
      const receipt = await fixture.publicClient.getTransactionReceipt({ hash: purchase.txHash });
      expect(receipt.status).toBe('success');
      const settled = parseEventLogs({ abi: cartAbi, logs: receipt.logs, eventName: 'OrderLineSettled' });
      expect(settled.filter(event => event.args.fulfillmentKind === 2 || event.args.fulfillmentKind === 4)
        .map(event => event.args.amount)).toEqual([0n, 0n]);
      const minted = parseEventLogs({ abi: cartAbi, logs: receipt.logs, eventName: 'FulfillmentActionExecuted' })
        .find(event => event.args.fulfillmentKind === 4);
      if (!minted) throw new Error('Free Cart mint did not return a fulfillment event.');
      for (const item of [{ contract: existing.contract, tokenId: BigInt(token.tokenId) }, { contract: lazy.contract, tokenId: minted.args.tokenId }]) {
        expect((await fixture.publicClient.readContract({ address: item.contract, abi: erc721Abi,
          functionName: 'ownerOf', args: [item.tokenId] })).toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());
      }
      await expect.poll(async () => (await jsonCommand<CartOrder>(fixture.buyerHome,
        ['cart', 'orders', 'get', '--id', purchase.orderId])).status, { timeout: 180_000, interval: 2_000 }).toBe('FULFILLED');
      await verifyPrivateCartOrder(fixture, purchase.orderId);
      await verifyCartPurchaseNotifications(fixture, purchase, 2);
    } finally {
      await cleanupLiveFixture(fixture);
    }
  }, 900_000);
});
