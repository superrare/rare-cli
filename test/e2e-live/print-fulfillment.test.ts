import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { CartOrder } from '@rareprotocol/rare-sdk';
import type { Hex } from 'viem';
import { cleanupLiveFixture, createCartLiveFixture, jsonCommand } from './helpers/live-harness.js';

// Verify against the provider independently of our persisted status. Never target the live API.
const sandboxOrderSchema = z.object({ outcome: z.literal('Ok'), order: z.object({
  id: z.string(), merchantReference: z.string(), metadata: z.object({ fulfillmentId: z.string() }),
  items: z.array(z.object({ sku: z.string(), copies: z.number() })),
}) });

describe('Cart payment through Prodigi sandbox fulfillment', () => {
  it('pays for a physical variant and verifies the resulting order in Prodigi', async () => {
    const sandboxKey = process.env.PRODIGI_SANDBOX_API_KEY;
    if (!sandboxKey?.startsWith('test_')) throw new Error('Set PRODIGI_SANDBOX_API_KEY to a v4 sandbox key. Deploy Rare API and Pipelines with the same sandbox configuration.');
    const fixture = await createCartLiveFixture({ buyer: true });
    let dropId: string | undefined;
    try {
      if (fixture.chain !== 'sepolia' || !fixture.buyerHome) throw new Error('Print fulfillment E2E requires Sepolia and a registered buyer.');
      const buyerHome = fixture.buyerHome;
      const specifications = await jsonCommand<{ id: string }[]>(fixture.sellerHome, ['prints', 'specifications']);
      const specification = specifications[0];
      if (!specification) throw new Error('No supported print specification.');
      const image = join(fixture.tempDir, 'sandbox-print.png');
      await writeFile(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9uQAAAAASUVORK5CYII=', 'base64'));
      const master = await jsonCommand<{ key: string }>(fixture.sellerHome, ['uploads', 'upload', image, '--access', 'private', '--content-type', 'image/png']);
      const photo = await jsonCommand<{ url: string }>(fixture.sellerHome, ['uploads', 'upload', image, '--access', 'public', '--content-type', 'image/png']);
      const input = join(fixture.tempDir, 'print.json');
      const name = `Cart sandbox fulfillment ${randomUUID()}`;
      await writeFile(input, JSON.stringify({ idempotencyKey: randomUUID(), chainId: '11155111', name,
        print: { name, description: 'Sandbox fulfillment test', tags: ['test'], productionUploadKey: master.key, images: [photo.url], specificationId: specification.id } }));
      const drop = await jsonCommand<{ id: string }>(fixture.sellerHome, ['prints', 'drops', 'create', '--input', input]);
      dropId = drop.id;
      const option = await jsonCommand<{ id: string }>(fixture.sellerHome, ['prints', 'drops', 'configure', '--id', drop.id, '--price-usd-cents', '100']);
      const terms = join(fixture.tempDir, 'listing.json');
      await writeFile(terms, JSON.stringify({ optionId: option.id, seller: fixture.sellerAddress,
        listingSalt: `0x${randomBytes(32).toString('hex')}`, deadline: String(Math.floor(Date.now() / 1000) + 3600), availableQuantity: '1' }));
      const published = await jsonCommand<{ signedArtifact: { entries: { listingDigest: string }[] } }>(fixture.sellerHome, ['prints', 'listing', 'publish', '--input', terms, '--chain', fixture.chain, '--yes']);
      const entry = published.signedArtifact.entries[0];
      if (!entry) throw new Error('Print publication returned no Listing.');
      const shipping = join(fixture.tempDir, 'shipping.json');
      await writeFile(shipping, JSON.stringify({ name: 'Sandbox Cart Test', email: 'print-e2e@example.test', phoneNumber: '+12025550123',
        addressLine1: '123 Test Street', townOrCity: 'New York', stateOrCounty: 'NY', postalOrZipCode: '10001', countryCode: 'US' }));
      const checkout = ['cart', 'checkout', '--listing', entry.listingDigest, '--payment-currency', 'usdc', '--shipping-input', shipping, '--chain', fixture.chain];
      const preview = await jsonCommand<{ preparation: { paymentAmount: string; breakdown: { production: string; shipping: string } } }>(buyerHome, [...checkout, '--preview']);
      expect(BigInt(preview.preparation.breakdown.production)).toBeGreaterThan(0n);
      expect(BigInt(preview.preparation.breakdown.shipping)).toBeGreaterThanOrEqual(0n);
      // Bound the test-wallet spend before requesting any approval or payment.
      expect(BigInt(preview.preparation.paymentAmount)).toBeLessThanOrEqual(50_000_000n);
      const purchase = await jsonCommand<{ txHash: Hex; orderId: string }>(buyerHome, [...checkout, '--yes'], 300_000);
      expect(await fixture.publicClient.getTransactionReceipt({ hash: purchase.txHash })).toMatchObject({ status: 'success' });
      console.info('Cart print payment confirmed', { transactionHash: purchase.txHash, orderId: purchase.orderId });
      const readOrder = (): Promise<CartOrder> => jsonCommand<CartOrder>(buyerHome, ['cart', 'orders', 'get', '--id', purchase.orderId]);
      await expect.poll(async () => (await readOrder()).fulfillments[0], { timeout: 240_000, interval: 3_000 }).toMatchObject({
        status: 'SUBMITTED', providerOrderId: expect.stringMatching(/^ord_/u),
      });
      const order = await readOrder();
      const fulfillment = order.fulfillments[0];
      if (!fulfillment?.providerOrderId) throw new Error('Provider order ID is missing after submission.');
      expect(order.status).toBe('CONFIRMED');
      const response = await fetch(`https://api.sandbox.prodigi.com/v4.0/orders/${encodeURIComponent(fulfillment.providerOrderId)}`, {
        headers: { 'X-API-Key': sandboxKey }, signal: AbortSignal.timeout(30_000), redirect: 'error',
      });
      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      const provider = sandboxOrderSchema.parse(body).order;
      expect(provider.id).toBe(fulfillment.providerOrderId);
      expect(provider.metadata.fulfillmentId).toBe(fulfillment.id);
      expect(provider.merchantReference).toBe(createHash('sha256').update(`superrare:cart:fulfillment:${fulfillment.id}`).digest('hex'));
      expect(provider.items).toEqual([{ sku: specification.id, copies: 1 }]);
      // Only public identifiers, never recipient details, private URLs or credentials.
      console.info('Prodigi sandbox order verified', { transactionHash: purchase.txHash, orderId: purchase.orderId, providerOrderId: provider.id });
    } finally {
      if (dropId) await jsonCommand(fixture.sellerHome, ['prints', 'drops', 'archive', '--id', dropId]);
      await cleanupLiveFixture(fixture);
    }
  }, 600_000);
});
