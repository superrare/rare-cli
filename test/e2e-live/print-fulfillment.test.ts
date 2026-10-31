import { downloadTestImage } from './helpers/test-image.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { CartCheckoutPreparation, CartCheckoutReceipt, CartOrder, EligibilityClaim, EligibilityRule } from '@rareprotocol/rare-sdk';
import { erc20Abi, erc721Abi, getAddress, parseEventLogs, parseUnits, type Address, type Hex } from 'viem';
import { cartAbi, resolveCurrency } from '@rareprotocol/rare-sdk/contracts';
import { deployErc721Collection, mintToken } from './helpers/live-erc721.js';
import { createCreatorVariantClient } from './helpers/cart-creator-variants.js';
import { cleanupLiveFixture, createCartLiveFixture, jsonCommand } from './helpers/live-harness.js';

// Verify against the provider independently of our persisted status. Never target the live API.
const sandboxOrderSchema = z.object({ outcome: z.literal('Ok'), order: z.object({
  id: z.string(), lastUpdated: z.string(), shipments: z.array(z.object({ id: z.string() })).default([]), merchantReference: z.string(), metadata: z.object({ fulfillmentId: z.string() }),
  items: z.array(z.object({ sku: z.string(), copies: z.number() })),
}) });

describe('Cart payment through Prodigi sandbox fulfillment', () => {
  it.each(['print-only', 'mixed', 'claim'])('purchases %s through Cart and verifies fees and Prodigi acceptance', async (journey) => {
    const sandboxKey = process.env.PRODIGI_SANDBOX_API_KEY;
    if (!sandboxKey?.startsWith('test_')) throw new Error('Set PRODIGI_SANDBOX_API_KEY to a v4 sandbox key. Deploy Rare API and Pipelines with the same sandbox configuration.');
    const fixture = await createCartLiveFixture({ buyer: true,
      buyerWalletFilter: async (wallet, { chain, publicClient }) => {
        const currency = resolveCurrency('usdc', chain);
        const [balance, decimals] = await Promise.all([
          publicClient.readContract({ address: currency, abi: erc20Abi, functionName: 'balanceOf', args: [wallet.address] }),
          publicClient.readContract({ address: currency, abi: erc20Abi, functionName: 'decimals' }),
        ]);
        return balance >= parseUnits('50', decimals);
      },
    });
    let dropId: string | undefined;
    let productId: string | undefined;
    let ruleId: string | undefined;
    try {
      if (fixture.chain !== 'sepolia' || !fixture.buyerHome) throw new Error('Print fulfillment E2E requires Sepolia and a registered buyer.');
      const buyerHome = fixture.buyerHome;
      const creator = createCreatorVariantClient(fixture);
      const source = journey === 'print-only' ? undefined : await (async (): Promise<{ contract: Address; tokenId: string; sku: Hex; listingDigest: Hex; productId: string }> => {
        const collection = await deployErc721Collection(fixture, '1');
        const token = await mintToken(fixture, collection.contract);
        const product = await creator.cart.catalog.products.create({ metadata: { title: `NFT and print ${randomUUID()}` } });
        productId = product.id;
        const configured = await creator.cart.catalog.variants.add(product.id, { variants: [{ metadata: {
          type: 'ERC721', chainId: String(fixture.chainId), tokenContract: token.contract, tokenId: token.tokenId,
        } }] });
        const variant = configured.variants[0];
        if (!variant) throw new Error('NFT variant was not created.');
        const terms = join(fixture.tempDir, 'nft-listing.json');
        await writeFile(terms, JSON.stringify({ deadline: String(Math.floor(Date.now() / 1000) + 3600),
          listings: [{ sku: variant.sku, settlementCurrency: 'usdc', unitPrice: '1', quantity: '1', fulfillmentKind: 'ERC721_TRANSFER' }] }));
        const published = await jsonCommand<{ listingDigests: Hex[] }>(fixture.sellerHome, ['cart', 'listing', 'create', '--input', terms, '--chain', fixture.chain, '--yes']);
        const digest = published.listingDigests[0];
        if (!digest) throw new Error('NFT Listing was not published.');
        return { ...token, sku: variant.sku, listingDigest: digest, productId: product.id };
      })();
      const products = await jsonCommand<{ id: string }[]>(fixture.sellerHome, ['prints', 'products', 'list']);
      const product = products.find(item => item.id === 'GLOBAL-FAP-8X12');
      if (!product) throw new Error('No supported print specification.');
      const image = join(fixture.tempDir, 'sandbox-print.jpg');
      await writeFile(image, await downloadTestImage());
      const master = await jsonCommand<{ key: string }>(fixture.sellerHome, ['uploads', 'upload', image, '--access', 'private', '--content-type', 'image/jpeg']);
      const photo = await jsonCommand<{ url: string }>(fixture.sellerHome, ['uploads', 'upload', image, '--access', 'public', '--content-type', 'image/jpeg']);
      const input = join(fixture.tempDir, 'print.json');
      const name = `Cart sandbox fulfillment ${randomUUID()}`;
      await writeFile(input, JSON.stringify({ idempotencyKey: randomUUID(), chainId: '11155111', name,
        print: { name, description: 'Sandbox fulfillment test', tags: ['test'], productionUploadKey: master.key, images: [photo.url], specificationId: product.id } }));
      const drop = await jsonCommand<{ id: string }>(fixture.sellerHome, ['prints', 'drops', 'create', '--input', input]);
      dropId = drop.id;
      const option = await jsonCommand<{ id: string; sku: Hex }>(fixture.sellerHome, ['prints', 'drops', 'configure', '--id', drop.id, '--price-usd-cents', '100']);
      if (source) {
        await creator.cart.catalog.products.attachSku(source.productId, { sku: option.sku, position: 1, metadata: {} });
        await creator.cart.catalog.products.publish(source.productId);
        const grouped = await creator.cart.catalog.products.get(source.productId);
        expect(grouped.variants.map(variant => variant.sku).sort()).toEqual([source.sku, option.sku].sort());
      }
      if (journey === 'claim' && source) {
        const file = join(fixture.tempDir, 'eligibility.json');
        await writeFile(file, JSON.stringify({ definition: { kind: 'PRIMARY_SALE',
          source: { chainId: String(fixture.chainId), tokenContract: source.contract, tokenIds: [source.tokenId] }, targets: [{ sku: option.sku }] } }));
        const rule = await jsonCommand<EligibilityRule>(fixture.sellerHome, ['cart', 'purchase-eligibility', 'rules', 'create', '--input', file]);
        ruleId = rule.id;
      }
      const terms = join(fixture.tempDir, 'listing.json');
      await writeFile(terms, JSON.stringify({ optionId: option.id, seller: fixture.sellerAddress,
        listingSalt: `0x${randomBytes(32).toString('hex')}`, deadline: String(Math.floor(Date.now() / 1000) + 3600), availableQuantity: '2', ...(ruleId ? { eligibilityRuleId: ruleId } : {}) }));
      const published = await jsonCommand<{ signedArtifact: { entries: { listingDigest: string }[] } }>(fixture.sellerHome, ['prints', 'listing', 'publish', '--input', terms, '--chain', fixture.chain, '--yes']);
      const entry = published.signedArtifact.entries[0];
      if (!entry) throw new Error('Print publication returned no Listing.');
      const shipping = join(fixture.tempDir, 'shipping.json');
      await writeFile(shipping, JSON.stringify({ name: 'Sandbox Cart Test', email: 'print-e2e@example.test', phoneNumber: '+12025550123',
        addressLine1: '123 Test Street', townOrCity: 'New York', stateOrCounty: 'NY', postalOrZipCode: '10001', countryCode: 'US' }));
      if (ruleId) {
        const publicPrint = await jsonCommand<{ options: { listingDigest: string; eligibilityRuleId: string | null }[] }>(fixture.sellerHome, ['prints', 'get', '--id', drop.id]);
        expect(publicPrint.options).toContainEqual(expect.objectContaining({ listingDigest: entry.listingDigest, eligibilityRuleId: ruleId }));
      }
      const printCheckout = ['cart', 'checkout', '--listing', entry.listingDigest, '--payment-currency', 'usdc', '--shipping-input', shipping, '--chain', fixture.chain];
      const claims = (): Promise<EligibilityClaim[]> => jsonCommand<{ data: EligibilityClaim[] }>(buyerHome, ['cart', 'purchase-eligibility', 'claims', 'list', '--rule-id', ruleId ?? '', '--per-page', '100']).then(page => page.data);
      if (journey === 'claim' && source) {
        expect(await claims()).toEqual([]);
        await expect(jsonCommand(buyerHome, [...printCheckout, '--authorize-only', '--yes'])).rejects.toThrow(/Status: 409/u);
        const nftCheckout = ['cart', 'checkout', '--listing', source.listingDigest, '--payment-currency', 'usdc', '--chain', fixture.chain];
        const nftPreview = await jsonCommand<{ preparation: CartCheckoutPreparation }>(buyerHome, [...nftCheckout, '--preview']);
        const nftPurchase = await jsonCommand<{ txHash: Hex; orderId: Hex }>(buyerHome, [...nftCheckout, '--yes'], 300_000);
        await verifySettlement(fixture, creator, nftPurchase, nftPreview.preparation, false);
        await expect.poll(claims, { timeout: 180_000, interval: 2_000 }).toMatchObject([{ status: 'AVAILABLE' }]);
      }
      const checkout = ['cart', 'checkout', ...(journey === 'mixed' && source ? ['--listing', source.listingDigest] : []), '--listing', entry.listingDigest, '--payment-currency', 'usdc', '--shipping-input', shipping, '--chain', fixture.chain];
      const preview = await jsonCommand<{ preparation: CartCheckoutPreparation }>(buyerHome, [...checkout, '--preview']);
      if (journey !== 'mixed') {
        expect(BigInt(preview.preparation.breakdown?.production ?? '-1')).toBeGreaterThan(0n);
        expect(BigInt(preview.preparation.breakdown?.shipping ?? '-1')).toBeGreaterThanOrEqual(0n);
      }
      // Bound the test-wallet spend before requesting any approval or payment.
      expect(BigInt(preview.preparation.paymentAmount)).toBeLessThanOrEqual(50_000_000n);
      const sellerBefore = await fixture.publicClient.readContract({ address: fixture.usdcAddress, abi: erc20Abi, functionName: 'balanceOf', args: [fixture.sellerAddress] });
      const purchase = await jsonCommand<{ txHash: Hex; orderId: Hex }>(buyerHome, [...checkout, '--yes'], 300_000);
      expect(await fixture.publicClient.getTransactionReceipt({ hash: purchase.txHash })).toMatchObject({ status: 'success' });
      console.info('Cart print payment confirmed', { transactionHash: purchase.txHash, orderId: purchase.orderId });
      const indexed = await verifySettlement(fixture, creator, purchase, preview.preparation, true);
      const sellerProceeds = indexed.lines.filter(line => line.paymentRecipient.toLowerCase() === fixture.sellerAddress.toLowerCase()).reduce((total, line) => total + BigInt(line.amount), 0n);
      const sellerAfter = await fixture.publicClient.readContract({ address: fixture.usdcAddress, abi: erc20Abi, functionName: 'balanceOf', args: [fixture.sellerAddress] });
      expect(sellerAfter - sellerBefore).toBe(sellerProceeds);
      if (source) expect(await fixture.publicClient.readContract({ address: source.contract, abi: erc721Abi, functionName: 'ownerOf', args: [BigInt(source.tokenId)] })).toBe(getAddress(fixture.buyerAddress ?? ''));
      if (journey === 'claim') {
        await expect.poll(claims, { timeout: 180_000, interval: 2_000 }).toMatchObject([{ status: 'CONSUMED' }]);
        expect(await claims()).toHaveLength(1);
        await expect(jsonCommand(buyerHome, [...printCheckout, '--authorize-only', '--yes'])).rejects.toThrow(/Status: 409/u);
      }
      const readOrder = (): Promise<CartOrder> => jsonCommand<CartOrder>(buyerHome, ['cart', 'orders', 'get', '--id', purchase.orderId]);
      await expect.poll(async () => (await readOrder()).fulfillments[0]?.providerOrderId, { timeout: 240_000, interval: 3_000 }).toMatch(/^ord_/u);
      await expect.poll(async () => (await readOrder()).fulfillments[0]?.progress ?? null, { timeout: 240_000, interval: 5_000 }).not.toBeNull();
      const order = await readOrder();
      const fulfillment = order.fulfillments[0];
      if (!fulfillment?.providerOrderId) throw new Error('Provider order ID is missing after submission.');
      expect(order.status).toBe('CONFIRMED');
      expect(order.items).toHaveLength(journey === 'mixed' ? 2 : 1);
      expect(order.fulfillments).toHaveLength(1);
      const response = await fetch(`https://api.sandbox.prodigi.com/v4.0/orders/${encodeURIComponent(fulfillment.providerOrderId)}`, {
        headers: { 'X-API-Key': sandboxKey }, signal: AbortSignal.timeout(30_000), redirect: 'error',
      });
      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      const provider = sandboxOrderSchema.parse(body).order;
      expect(provider.id).toBe(fulfillment.providerOrderId);
      const progress = fulfillment.progress;
      if (!progress) throw new Error('Backend did not reconcile provider progress.');
      expect(['SUBMITTED', 'IN_PRODUCTION', 'PARTIALLY_SHIPPED', 'SHIPPED', 'CANCELLED']).toContain(progress.stage);
      expect(Date.parse(progress.providerUpdatedAt)).toBeLessThanOrEqual(Date.parse(provider.lastUpdated));
      expect(progress).not.toHaveProperty('recipient');
      expect(progress).not.toHaveProperty('items');
      for (const shipment of progress.shipments) {
        expect(provider.shipments.some(candidate => candidate.id === shipment.id)).toBe(true);
        if (shipment.trackingUrl !== null) expect(new URL(shipment.trackingUrl).protocol).toBe('https:');
        expect(shipment).not.toHaveProperty('deliveredAt');
      }

      expect(provider.metadata.fulfillmentId).toBe(fulfillment.id);
      expect(provider.merchantReference).toBe(createHash('sha256').update(`superrare:cart:fulfillment:${fulfillment.id}`).digest('hex'));
      expect(provider.items).toEqual([{ sku: product.id, copies: 1 }]);
      // Only public identifiers, never recipient details, private URLs or credentials.
      console.info('Prodigi sandbox order verified', { transactionHash: purchase.txHash, orderId: purchase.orderId, providerOrderId: provider.id });
    } finally {
      if (ruleId) await jsonCommand(fixture.sellerHome, ['cart', 'purchase-eligibility', 'rules', 'disable', '--rule-id', ruleId]);
      if (productId) await createCreatorVariantClient(fixture).cart.catalog.products.archive(productId);
      if (dropId) await jsonCommand(fixture.sellerHome, ['prints', 'drops', 'archive', '--id', dropId]);
      await cleanupLiveFixture(fixture);
    }
  }, 600_000);
});

async function verifySettlement(
  fixture: Awaited<ReturnType<typeof createCartLiveFixture>>,
  rare: ReturnType<typeof createCreatorVariantClient>,
  purchase: { txHash: Hex; orderId: Hex },
  preview: CartCheckoutPreparation,
  physical: boolean,
): Promise<CartCheckoutReceipt> {
  await expect.poll(async () => (await rare.cart.checkout.receipt(purchase.orderId)).status,
    { timeout: 180_000, interval: 2_000 }).toBe('indexed');
  const receipt = await rare.cart.checkout.receipt(purchase.orderId);
  expect(BigInt(receipt.paymentAmount ?? '-1')).toBe(BigInt(preview.paymentAmount));
  expect(receipt.lines.reduce((sum, line) => sum + BigInt(line.amount), 0n)).toBe(BigInt(preview.paymentAmount));
  const transaction = await fixture.publicClient.getTransactionReceipt({ hash: purchase.txHash });
  const events = parseEventLogs({ abi: cartAbi, logs: transaction.logs, eventName: 'OrderLineSettled' });
  expect(events).toHaveLength(receipt.lines.length);
  for (const line of receipt.lines) expect(events.find(event => event.args.lineIndex === BigInt(line.lineIndex))?.args).toMatchObject({
    orderId: purchase.orderId, sku: line.sku, listingDigest: line.listingDigest, amount: BigInt(line.amount),
    paymentRecipient: getAddress(line.paymentRecipient), settlementCurrency: getAddress(line.settlementCurrency), quantity: BigInt(line.quantity),
  });
  expect(receipt.issues).toEqual([]);
  const transfers = parseEventLogs({ abi: erc20Abi,
    logs: transaction.logs.filter(log => log.address.toLowerCase() === fixture.usdcAddress.toLowerCase()), eventName: 'Transfer' });
  for (const recipient of new Set(receipt.lines.map(line => line.paymentRecipient.toLowerCase()))) {
    const entitlement = receipt.lines.filter(line => line.paymentRecipient.toLowerCase() === recipient).reduce((sum, line) => sum + BigInt(line.amount), 0n);
    const received = transfers.filter(event => event.args.to.toLowerCase() === recipient).reduce((sum, event) => sum + event.args.value, 0n);
    expect(received).toBe(entitlement);
  }
  const fees = receipt.feeAllocations?.allocations;
  if (!fees) throw new Error('Indexed receipt lost item-level fee allocations.');
  expect(fees).toEqual(expect.arrayContaining([
    expect.objectContaining({ purpose: 'GALLERY_COMMISSION', bearer: 'SELLER' }),
    expect.objectContaining({ purpose: 'NETWORK_FEE', bearer: 'BUYER' }),
    ...(physical ? [expect.objectContaining({ purpose: 'PRODUCTION', bearer: 'BUYER' }), expect.objectContaining({ purpose: 'SHIPPING', bearer: 'BUYER' })] : []),
  ]));
  for (const fee of fees) {
    if (fee.calculation?.type === 'PERCENTAGE') expect(BigInt(fee.amount)).toBe(BigInt(fee.grossAmount) * BigInt(fee.calculation.basisPoints) / 10_000n);
    if (fee.finalLineIndex !== null) expect(receipt.lines[fee.finalLineIndex]).toMatchObject({ sku: fee.feeSku, paymentRecipient: fee.recipient, settlementCurrency: fee.currency });
  }
  return receipt;
}
