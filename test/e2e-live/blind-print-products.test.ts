import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { readCollaboratorBalance, verifyPrintSplits } from './helpers/cart-print-splits.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { CartApiProduct, CartCheckoutReceipt, CartOrder, CartListingPublishResult, PrintListingPreparation } from '@rareprotocol/rare-sdk';
import { cartAbi, getCartAddress, resolveCurrency } from '@rareprotocol/rare-sdk/contracts';
import { erc20Abi, erc721Abi, getAddress, parseEventLogs, parseUnits, type Address, type Hex } from 'viem';
import { createCreatorVariantClient, createCreatorMintProduct } from './helpers/cart-creator-variants.js';
import { cleanupLiveFixture, createCartLiveFixture, jsonCommand, requireBuyerFixture, type BuyerLiveFixture } from './helpers/live-harness.js';
import { nftFixtureManifest } from './helpers/nft-fixture-manifest.js';
import { downloadTestImage } from './helpers/test-image.js';

const sandboxOrder = z.object({ outcome: z.literal('Ok'), order: z.object({
  id: z.string(), metadata: z.object({ fulfillmentId: z.string() }),
  items: z.array(z.object({ sku: z.string(), copies: z.number(), assets: z.array(z.object({ url: z.url() })) })),
}) });
type PreparedArtwork = { productId: string; dropId: string; nftSku: Hex; printSku: Hex; optionId: string; masterKey: string };
type Purchase = { txHash: Hex; orderId: Hex };

// Selected live suites fail when deployment, wallet or provider prerequisites are missing.
// This test deploys the same LazySovereign contract as release creation, not fixture bytecode.
describe('ordered blind mint and its physical Product variant', () => {
  it('prepares future artworks, buys through Cart, and prints the actually minted artwork', async () => {
    const sandboxKey = process.env.PRODIGI_SANDBOX_API_KEY;
    if (!sandboxKey?.startsWith('test_')) throw new Error('Set PRODIGI_SANDBOX_API_KEY and deploy Rare API/Pipelines against the Prodigi sandbox.');
    const live = requireBuyerFixture(await createCartLiveFixture({ buyer: true,
      buyerWalletFilter: async (wallet, { chain, publicClient }) => {
        const currency = resolveCurrency('usdc', chain);
        const [balance, decimals] = await Promise.all([
          publicClient.readContract({ address: currency, abi: erc20Abi, functionName: 'balanceOf', args: [wallet.address] }),
          publicClient.readContract({ address: currency, abi: erc20Abi, functionName: 'decimals' }),
        ]);
        return balance >= parseUnits('60', decimals);
      },
    }));
    let prepared: PreparedArtwork[] = [];
    let offeringProductId: string | undefined;
    try {
      if (live.chain !== 'sepolia') throw new Error('Blind print Product E2E requires Sepolia.');
      const collection = await jsonCommand<{ contract: Address }>(live.sellerHome, [
        'collection', 'deploy', 'lazy-erc721', `Blind print ${randomUUID()}`, 'BPRINT', '--max-tokens', '2', '--chain', live.chain,
      ], 240_000);
      const baseUri = `ipfs://${nftFixtureManifest.metadataCid}/lazy`;
      const mintConfiguration = await jsonCommand<{ tokenCount: string; baseUri: string }>(live.sellerHome, [
        'collection', 'prepare-lazy-mint', '--contract', collection.contract, '--base-uri', baseUri,
        '--amount', '2', '--minter', getCartAddress(live.chain), '--chain', live.chain,
      ], 240_000);
      expect(mintConfiguration).toMatchObject({ tokenCount: '2', baseUri });
      expect(await live.publicClient.readContract({ address: collection.contract, abi: erc721Abi, functionName: 'balanceOf', args: [live.buyerAddress] })).toBe(0n);

      // Both planned identities are created while neither NFT exists or is indexed.
      for (const tokenId of ['1', '2']) prepared = [...prepared, await prepareArtwork(live, collection.contract, tokenId)];
      const [first, second] = prepared;
      if (!first || !second) throw new Error('Both planned artwork Products must exist.');
      for (const artwork of prepared) {
        const visible = await jsonCommand<CartApiProduct>(live.sellerHome,
          ['cart', 'catalog', 'products', 'get', '--product-id', artwork.productId, '--chain', live.chain]);
        expect(visible.variants.find(variant => variant.sku === artwork.nftSku)).toMatchObject({ isHidden: true });
      }
      const mintProduct = await createCreatorMintProduct(live, collection.contract);
      offeringProductId = mintProduct.productId;
      const mintSku = mintProduct.sku;
      const collaborator = privateKeyToAccount(generatePrivateKey()).address;
      const splits = [{ recipient: live.sellerAddress, basisPoints: 7000 }, { recipient: collaborator, basisPoints: 3000 }];
      const mintTerms = await jsonFile(live, 'mint-listing', { deadline: deadline(), listings: [{
        sku: mintSku, settlementCurrency: 'usdc', unitPrice: '1', quantity: '2', fulfillmentKind: 'ERC721_MINT_TO', splits,
      }] });
      const mintPublication = await jsonCommand<{ listingDigests: Hex[] }>(live.sellerHome,
        ['cart', 'listing', 'create', '--input', mintTerms, '--chain', live.chain, '--yes']);
      const mintListing = mintPublication.listingDigests[0];
      if (!mintListing) throw new Error('Collection mint Listing is missing.');
      const printTerms = await jsonFile(live, 'print-listing', { optionId: first.optionId, seller: live.sellerAddress,
        listingSalt: `0x${randomBytes(32).toString('hex')}`, deadline: deadline(), availableQuantity: '2', splits,
        mintSource: { chainId: String(live.chainId), contract: collection.contract, productIds: prepared.map(item => item.productId) },
      });
      const printPreparation = await jsonCommand<PrintListingPreparation>(live.sellerHome,
        ['prints', 'listing', 'prepare', '--input', printTerms, '--chain', live.chain]);
      const printPublication = await jsonCommand<Pick<CartListingPublishResult, 'signedArtifact'>>(live.sellerHome,
        ['prints', 'listing', 'publish', '--input', printTerms, '--chain', live.chain, '--yes']);
      const printListing = printPublication.signedArtifact.entries[0]?.listingDigest;
      if (!printListing) throw new Error('Physical release Listing is missing.');
      const creator = createCreatorVariantClient(live);
      const companion = await jsonFile(live, 'companion-membership', {
        sku: first.printSku, position: 1, metadata: { printDropId: first.dropId },
      });
      await jsonCommand(live.sellerHome, ['cart', 'catalog', 'products', 'attach-sku',
        '--product-id', mintProduct.productId, '--input', companion, '--chain', live.chain]);
      const offering = await creator.cart.catalog.products.get(mintProduct.productId);
      expect(offering.variants.map(variant => variant.sku)).toEqual(expect.arrayContaining([mintSku, first.printSku]));
      expect(offering.variants.find(variant => variant.sku === first.printSku)?.metadata)
        .toMatchObject({ printDropId: first.dropId });
      await expect.poll(async () => {
        const discovery = await creator.cart.listing.search({ seller: live.sellerAddress, fulfillmentKind: 4, productId: mintProduct.productId });
        return discovery.data.find(listing => listing.listingDigest === mintListing)?.productIds ?? [];
      }, { timeout: 180_000, interval: 2_000 }).toContain(mintProduct.productId);
      expect((await creator.cart.listing.get(printListing)).metadata.fulfillmentPreparationId).toBe(printPreparation.id);
      for (const artwork of prepared) {
        const grouped = await jsonCommand<CartApiProduct>(live.sellerHome,
          ['cart', 'catalog', 'products', 'get-mine', '--product-id', artwork.productId, '--chain', live.chain]);
        expect(grouped.variants.map(variant => variant.sku)).toEqual(expect.arrayContaining([artwork.nftSku, artwork.printSku]));
      }

      // Consume the first slot without a print. The next checkout must use artwork 2,
      // not the option whose SKU originally authorized the physical release Listing.
      const firstCheckout = ['cart', 'checkout', '--listing', mintListing, '--payment-currency', 'usdc', '--chain', live.chain];
      const firstPreview = await jsonCommand<{ preparation: { paymentAmount: string } }>(live.buyerHome, [...firstCheckout, '--preview']);
      expect(BigInt(firstPreview.preparation.paymentAmount)).toBeLessThanOrEqual(5_000_000n);
      const firstBalance = await readCollaboratorBalance(live, collaborator);
      const firstPurchase = await jsonCommand<Purchase>(live.buyerHome, [...firstCheckout, '--yes'], 300_000);
      await assertMint(live, firstPurchase, collection.contract, 1n);
      await expect.poll(async () => (await creator.cart.checkout.receipt(firstPurchase.orderId)).status,
        { timeout: 180_000, interval: 2_000 }).toBe('indexed');
      await verifyPrintSplits(live, firstPurchase, await creator.cart.checkout.receipt(firstPurchase.orderId), [mintListing], collaborator, firstBalance);

      const shipping = await jsonFile(live, 'shipping', { name: 'Sandbox Blind Print Test', email: 'blind-print-e2e@example.test',
        phoneNumber: '+12025550123', addressLine1: '123 Test Street', townOrCity: 'New York', stateOrCounty: 'NY',
        postalOrZipCode: '10001', countryCode: 'US' });
      const checkoutFile = await jsonFile(live, 'checkout', { items: [
        { kind: 'listing', listingDigest: mintListing, quantity: '1' },
        { kind: 'listing', listingDigest: printListing, quantity: '1' },
      ], mintSelections: [{ preparationId: printPreparation.id, listingDigest: mintListing, unitIndexes: [0] }] });
      const checkout = ['cart', 'checkout', '--input', checkoutFile, '--payment-currency', 'usdc', '--shipping-input', shipping, '--chain', live.chain];
      const preview = await jsonCommand<{ preparation: { paymentAmount: string } }>(live.buyerHome, [...checkout, '--preview']);
      expect(BigInt(preview.preparation.paymentAmount)).toBeLessThanOrEqual(50_000_000n);
      const splitBalance = await readCollaboratorBalance(live, collaborator);
      const purchase = await jsonCommand<Purchase>(live.buyerHome, [...checkout, '--yes'], 300_000);
      await assertMint(live, purchase, collection.contract, 2n);
      console.info('Blind mint Cart payment confirmed', { transactionHash: purchase.txHash, orderId: purchase.orderId, collection: collection.contract, productId: second.productId });
      await expect.poll(async () => (await creator.cart.checkout.receipt(purchase.orderId)).status,
        { timeout: 180_000, interval: 2_000 }).toBe('indexed');
      const receipt = await creator.cart.checkout.receipt(purchase.orderId);
      assertFees(receipt, preview.preparation.paymentAmount);
      await verifyPrintSplits(live, purchase, receipt, [mintListing, printListing], collaborator, splitBalance);
      expect(receipt.actions.some(action => action.target.toLowerCase() === collection.contract.toLowerCase() && action.tokenId === '2' && action.unitIndex === '0')).toBe(true);

      const readOrder = (): Promise<CartOrder> => jsonCommand(live.buyerHome, ['cart', 'orders', 'get', '--id', purchase.orderId]);
      await expect.poll(async () => (await readOrder()).fulfillments[0]?.providerOrderId,
        { timeout: 240_000, interval: 3_000 }).toMatch(/^ord_/u);
      const order = await readOrder();
      expect(order.status).toBe('CONFIRMED');
      expect(order.items).toHaveLength(2);
      expect(order.fulfillments).toHaveLength(1);
      const fulfillment = order.fulfillments[0];
      if (!fulfillment?.providerOrderId) throw new Error('Resolved print did not reach Prodigi.');
      expect(fulfillment).toMatchObject({ resolvedItems: [{ productId: second.productId, sku: second.printSku,
        tokenId: '2', sourceLineIndex: 0, sourceUnitIndex: 0 }] });
      const response = await fetch(`https://api.sandbox.prodigi.com/v4.0/orders/${encodeURIComponent(fulfillment.providerOrderId)}`, {
        headers: { 'X-API-Key': sandboxKey }, signal: AbortSignal.timeout(30_000), redirect: 'error',
      });
      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      const provider = sandboxOrder.parse(body).order;
      expect(provider.metadata.fulfillmentId).toBe(fulfillment.id);
      expect(provider.items).toHaveLength(1);
      const item = provider.items[0];
      if (!item) throw new Error('Prodigi accepted no physical item.');
      expect(item).toMatchObject({ sku: 'GLOBAL-FAP-8X12', copies: 1 });
      const asset = item.assets[0];
      if (!asset) throw new Error('Prodigi order has no production asset.');
      // Assert privately. Never include signed URLs or recipient details in log output.
      const deliveredPath = decodeURIComponent(new URL(asset.url).pathname);
      expect(deliveredPath.includes(second.masterKey)).toBe(true);
      expect(deliveredPath.includes(first.masterKey)).toBe(false);
      const history = await jsonCommand<{ data: CartOrder[] }>(live.buyerHome, ['cart', 'orders', 'list', '--per-page', '100']);
      expect(history.data.find(candidate => candidate.id === purchase.orderId)?.items).toHaveLength(2);
      console.info('Blind print Product order verified', { transactionHash: purchase.txHash, orderId: purchase.orderId, providerOrderId: provider.id });
      await expect.poll(async () => {
        const product = await jsonCommand<CartApiProduct>(live.sellerHome,
          ['cart', 'catalog', 'products', 'get', '--product-id', second.productId, '--chain', live.chain]);
        return product.variants.filter(variant => !variant.isHidden && variant.universalTokenId === `${live.chainId}-${collection.contract.toLowerCase()}-2`).map(variant => variant.sku);
      }, { timeout: 180_000, interval: 2_000 }).toEqual([second.nftSku]);
    } finally {
      try {
        if (offeringProductId !== undefined) await jsonCommand(live.sellerHome, ['cart', 'catalog', 'products', 'archive', '--product-id', offeringProductId, '--chain', live.chain]);
        for (const artwork of prepared) {
          await jsonCommand(live.sellerHome, ['prints', 'drops', 'archive', '--id', artwork.dropId]);
          await jsonCommand(live.sellerHome, ['cart', 'catalog', 'products', 'archive', '--product-id', artwork.productId, '--chain', live.chain]);
        }
      } finally { await cleanupLiveFixture(live); }
    }
  }, 900_000);
});

async function prepareArtwork(live: BuyerLiveFixture, contract: Address, tokenId: string): Promise<PreparedArtwork> {
  const name = `Blind artwork ${tokenId} ${randomUUID()}`;
  const productFile = await jsonFile(live, `product-${tokenId}`, { metadata: { title: name } });
  const product = await jsonCommand<CartApiProduct>(live.sellerHome,
    ['cart', 'catalog', 'products', 'create', '--input', productFile, '--chain', live.chain]);
  await expect(live.publicClient.readContract({ address: contract, abi: erc721Abi, functionName: 'ownerOf', args: [BigInt(tokenId)] })).rejects.toThrow();
  const variants = await jsonFile(live, `variant-${tokenId}`, { variants: [{ metadata: { title: name },
    plannedNft: { chainId: String(live.chainId), contract, tokenId } }] });
  const grouped = await jsonCommand<CartApiProduct>(live.sellerHome,
    ['cart', 'catalog', 'variants', 'add', '--product-id', product.id, '--input', variants, '--chain', live.chain]);
  const nft = grouped.variants[0];
  if (!nft) throw new Error('Planned NFT variant was not created before mint.');
  const image = await downloadTestImage({ seed: `rare-e2e-${tokenId}`, width: 1200, height: 1600 });
  const imageFile = join(live.tempDir, `artwork-${tokenId}.jpg`);
  await writeFile(imageFile, image);
  const master = await jsonCommand<{ key: string }>(live.sellerHome, ['uploads', 'upload', imageFile, '--access', 'private', '--content-type', 'image/jpeg']);
  const photo = await jsonCommand<{ url: string }>(live.sellerHome, ['uploads', 'upload', imageFile, '--access', 'public', '--content-type', 'image/jpeg']);
  expect(master.key).toBe(createHash('sha256').update(image).digest('hex'));
  const printFile = await jsonFile(live, `print-${tokenId}`, { idempotencyKey: randomUUID(), productId: product.id,
    chainId: String(live.chainId), name, print: { name, description: 'Ordered blind mint physical variant', tags: ['test'],
      productionUploadKey: master.key, images: [photo.url], specificationId: 'GLOBAL-FAP-8X12' } });
  const drop = await jsonCommand<{ id: string }>(live.sellerHome, ['prints', 'drops', 'create', '--input', printFile]);
  const option = await jsonCommand<{ id: string; sku: Hex }>(live.sellerHome,
    ['prints', 'drops', 'configure', '--id', drop.id, '--price-usd-cents', '100']);
  await jsonCommand(live.sellerHome, ['cart', 'catalog', 'products', 'publish', '--product-id', product.id, '--chain', live.chain]);
  return { productId: product.id, dropId: drop.id, nftSku: nft.sku, printSku: option.sku, optionId: option.id, masterKey: master.key };
}

async function jsonFile(live: BuyerLiveFixture, name: string, value: unknown): Promise<string> {
  const path = join(live.tempDir, `${name}.json`);
  await writeFile(path, JSON.stringify(value));
  return path;
}
function deadline(): string { return String(Math.floor(Date.now() / 1000) + 3600); }
async function assertMint(live: BuyerLiveFixture, purchase: Purchase, contract: Address, tokenId: bigint): Promise<void> {
  const receipt = await live.publicClient.getTransactionReceipt({ hash: purchase.txHash });
  expect(receipt.status).toBe('success');
  const mints = parseEventLogs({ abi: cartAbi, logs: receipt.logs, eventName: 'FulfillmentActionExecuted' });
  expect(mints).toHaveLength(1);
  expect(mints[0]?.args).toMatchObject({ orderId: purchase.orderId, tokenId, target: getAddress(contract), recipient: getAddress(live.buyerAddress) });
  expect(await live.publicClient.readContract({ address: contract, abi: erc721Abi, functionName: 'ownerOf', args: [tokenId] })).toBe(getAddress(live.buyerAddress));
  expect(await live.publicClient.readContract({ address: contract, abi: erc721Abi, functionName: 'tokenURI', args: [tokenId] }))
    .toBe(`ipfs://${nftFixtureManifest.metadataCid}/lazy/${tokenId}.json`);
}
function assertFees(receipt: CartCheckoutReceipt, paymentAmount: string): void {
  expect(receipt.issues).toEqual([]);
  expect(receipt.paymentAmount).toBe(paymentAmount);
  expect(receipt.lines.reduce((sum, line) => sum + BigInt(line.amount), 0n)).toBe(BigInt(paymentAmount));
  expect(receipt.feeAllocations?.allocations).toEqual(expect.arrayContaining([
    expect.objectContaining({ purpose: 'GALLERY_COMMISSION', bearer: 'SELLER' }),
    expect.objectContaining({ purpose: 'NETWORK_FEE', bearer: 'BUYER' }),
    expect.objectContaining({ purpose: 'PRODUCTION', bearer: 'BUYER' }),
    expect.objectContaining({ purpose: 'SHIPPING', bearer: 'BUYER' }),
  ]));
}
