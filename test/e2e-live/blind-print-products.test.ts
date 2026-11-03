import { verifyUsdcCartSettlement } from './helpers/cart-settlement-outcomes.js';
import { readPurchaseBalances, readPrimarySaleProceeds, verifyPurchaseBalances, verifyErc721Ownership } from './helpers/purchase-outcomes.js';
import { verifyPrivateCartOrder } from './helpers/cart-order-history.js';
import { verifyCartPurchaseNotifications } from './helpers/cart-notifications.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { readCollaboratorBalance, verifyPrintSplits } from './helpers/cart-print-splits.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { CartApiProduct, CartCheckoutReceipt, CartOrder, EligibilityClaim, EligibilityRule, CartListingPublishResult, PrintListingPreparation } from '@rareprotocol/rare-sdk';
import { cartAbi, getCartAddress, getContractAddresses, resolveCurrency } from '@rareprotocol/rare-sdk/contracts';
import { erc20Abi, erc721Abi, getAddress, parseEventLogs, parseUnits, zeroAddress, type Address, type Hex } from 'viem';
import { createCreatorVariantClient, createCreatorMintProduct } from './helpers/cart-creator-variants.js';
import { cleanupLiveFixture, createCartLiveFixture, jsonCommand, requireBuyerFixture, type BuyerLiveFixture } from './helpers/live-harness.js';
import { nftFixtureManifest } from './helpers/nft-fixture-manifest.js';
import { downloadTestImage } from './helpers/test-image.js';

const sandboxOrder = z.object({ data: z.object({
  id: z.string(), metadata: z.object({ fulfillmentId: z.string() }),
  items: z.array(z.object({ sku: z.string(), quantity: z.number(), assets: z.array(z.object({ url: z.url() })) })),
}) });
type PreparedPrintSize = { dropId: string; printSku: Hex; optionId: string; specificationId: string };
type PreparedArtwork = PreparedPrintSize & { productId: string; nftSku: Hex; masterKey: string; publicUrl: string; name: string };
type Purchase = { txHash: Hex; orderId: Hex };

// Selected live suites fail when deployment, wallet or provider prerequisites are missing.
// This test deploys the same LazySovereign contract as release creation, not fixture bytecode.
describe('ordered blind mint and its physical Product variant', () => {
  it('buys a blind mint with two print sizes of the artwork actually minted', async () => {
    const configuredKey = process.env.PRODIGI_SANDBOX_API_KEY;
    if (!configuredKey?.startsWith('sandbox_') && !configuredKey?.startsWith('test_')) throw new Error('Set PRODIGI_SANDBOX_API_KEY and deploy Rare API/Pipelines against the Prodigi v5 sandbox.');
    const sandboxKey = configuredKey.startsWith('test_') ? `sandbox_${configuredKey}` : configuredKey;
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
    let extraSizes: PreparedPrintSize[] = [];
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
      for (const artwork of prepared)
        extraSizes = [...extraSizes, await preparePrintSize(live, {
          productId: artwork.productId, name: artwork.name,
          masterKey: artwork.masterKey, publicUrl: artwork.publicUrl,
          specificationId: 'GLOBAL-FAP-12X18',
        })];
      const [firstExtra, secondExtra] = extraSizes;
      if (!firstExtra || !secondExtra) throw new Error('Both artworks must offer the second print size.');
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
      const creator = createCreatorVariantClient(live);
      let publishedPrints: { listingDigest: Hex; preparationId: string }[] = [];
      for (const [index, offer] of [first, firstExtra].entries()) {
        const printTerms = await jsonFile(live, `print-listing-${index}`, { optionId: offer.optionId, seller: live.sellerAddress,
          listingSalt: `0x${randomBytes(32).toString('hex')}`, deadline: deadline(), availableQuantity: '2', splits,
          mintSource: { chainId: String(live.chainId), contract: collection.contract, productIds: prepared.map(item => item.productId) },
        });
        const preparation = await jsonCommand<PrintListingPreparation>(live.sellerHome,
          ['prints', 'listing', 'prepare', '--input', printTerms, '--chain', live.chain]);
        const publication = await jsonCommand<Pick<CartListingPublishResult, 'signedArtifact'>>(live.sellerHome,
          ['prints', 'listing', 'publish', '--input', printTerms, '--chain', live.chain, '--yes']);
        const listingDigest = publication.signedArtifact.entries[0]?.listingDigest;
        if (!listingDigest) throw new Error('Physical release Listing is missing.');
        const companion = await jsonFile(live, `companion-membership-${index}`, {
          sku: offer.printSku, position: index + 1, metadata: { printDropId: offer.dropId, mintCompanion: true },
        });
        await jsonCommand(live.sellerHome, ['cart', 'catalog', 'products', 'attach-sku',
          '--product-id', mintProduct.productId, '--input', companion, '--chain', live.chain]);
        publishedPrints = [...publishedPrints, { listingDigest, preparationId: preparation.id }];
      }
      const offering = await creator.cart.catalog.products.get(mintProduct.productId);
      expect(offering.variants.map(variant => variant.sku)).toEqual(expect.arrayContaining([mintSku, first.printSku, firstExtra.printSku]));
      for (const offer of publishedPrints)
        expect((await creator.cart.listing.get(offer.listingDigest)).metadata.fulfillmentPreparationId).toBe(offer.preparationId);
      await expect.poll(async () => {
        const discovery = await creator.cart.listing.search({ seller: live.sellerAddress, fulfillmentKind: 4, productId: mintProduct.productId });
        return discovery.data.find(listing => listing.listingDigest === mintListing)?.productIds ?? [];
      }, { timeout: 180_000, interval: 2_000 }).toContain(mintProduct.productId);
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
        ...publishedPrints.map(({ listingDigest }) => ({ kind: 'listing', listingDigest, quantity: '1' })),
      ], mintSelections: publishedPrints.map(({ preparationId }) => ({
        preparationId, listingDigest: mintListing, unitIndexes: [0],
      })) });
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
      await verifyPrintSplits(live, purchase, receipt, [mintListing, ...publishedPrints.map(({ listingDigest }) => listingDigest)], collaborator, splitBalance);
      expect(receipt.actions.some(action => action.target.toLowerCase() === collection.contract.toLowerCase() && action.tokenId === '2' && action.unitIndex === '0')).toBe(true);

      const readOrder = (): Promise<CartOrder> => jsonCommand(live.buyerHome, ['cart', 'orders', 'get', '--id', purchase.orderId]);
      await expect.poll(async () => (await readOrder()).fulfillments.filter(item => item.providerOrderId).length,
        { timeout: 240_000, interval: 3_000 }).toBe(2);
      const order = await readOrder();
      expect(order.status).toBe('CONFIRMED');
      expect(order.items).toHaveLength(3);
      expect(order.fulfillments).toHaveLength(2);
      for (const format of [second, secondExtra]) {
        const fulfillment = order.fulfillments.find(item =>
          item.resolvedItems?.some(resolved => resolved.sku === format.printSku));
        if (!fulfillment?.providerOrderId) throw new Error('Resolved print size did not reach Prodigi.');
        expect(fulfillment).toMatchObject({ resolvedItems: [{ productId: second.productId, sku: format.printSku,
          tokenId: '2', sourceLineIndex: 0, sourceUnitIndex: 0 }] });
        const response = await fetch(`https://api.prodigi.com/v5/orders/${encodeURIComponent(fulfillment.providerOrderId)}`, {
          headers: { 'X-API-Key': sandboxKey }, signal: AbortSignal.timeout(30_000), redirect: 'error',
        });
        expect(response.status).toBe(200);
        const body: unknown = await response.json();
        const provider = sandboxOrder.parse(body).data;
        expect(provider.metadata.fulfillmentId).toBe(fulfillment.id);
        expect(provider.items).toHaveLength(1);
        const item = provider.items[0];
        expect(item).toMatchObject({ sku: format.specificationId, quantity: 1 });
        const asset = item?.assets[0];
        if (!asset) throw new Error('Prodigi order has no production asset.');
        const deliveredPath = decodeURIComponent(new URL(asset.url).pathname);
        expect(deliveredPath.includes(second.masterKey)).toBe(true);
        expect(deliveredPath.includes(first.masterKey)).toBe(false);
      }
      const history = await jsonCommand<{ data: CartOrder[] }>(live.buyerHome, ['cart', 'orders', 'list', '--per-page', '100']);
      expect(history.data.find(candidate => candidate.id === purchase.orderId)?.items).toHaveLength(3);
      await expect.poll(async () => {
        const product = await jsonCommand<CartApiProduct>(live.sellerHome,
          ['cart', 'catalog', 'products', 'get', '--product-id', second.productId, '--chain', live.chain]);
        return product.variants.filter(variant => !variant.isHidden && variant.universalTokenId === `${live.chainId}-${collection.contract.toLowerCase()}-2`).map(variant => variant.sku);
      }, { timeout: 180_000, interval: 2_000 }).toEqual([second.nftSku]);
    } finally {
      try {
        if (offeringProductId !== undefined) await jsonCommand(live.sellerHome, ['cart', 'catalog', 'products', 'archive', '--product-id', offeringProductId, '--chain', live.chain]);
        for (const format of extraSizes)
          await jsonCommand(live.sellerHome, ['prints', 'drops', 'archive', '--id', format.dropId]);
        for (const artwork of prepared) {
          await jsonCommand(live.sellerHome, ['prints', 'drops', 'archive', '--id', artwork.dropId]);
          await jsonCommand(live.sellerHome, ['cart', 'catalog', 'products', 'archive', '--product-id', artwork.productId, '--chain', live.chain]);
        }
      } finally { await cleanupLiveFixture(live); }
    }
  }, 900_000);

  it.each(['open', 'primary-sale', 'primary-sale-after-mint'] as const)('buys a RareMinter blind mint, then buys its matching %s print', async mode => {
    const gated = mode !== 'open';
    const afterMint = mode === 'primary-sale-after-mint';
    const sandboxKey = process.env.PRODIGI_SANDBOX_API_KEY;
    if (!sandboxKey?.startsWith('test_')) throw new Error('Set PRODIGI_SANDBOX_API_KEY and deploy Rare API/Pipelines against the Prodigi sandbox.');
    const live = requireBuyerFixture(await createCartLiveFixture({ buyer: true,
      buyerWalletFilter: async (wallet, { chain, publicClient }) => {
        const balance = await publicClient.readContract({ address: resolveCurrency('usdc', chain),
          abi: erc20Abi, functionName: 'balanceOf', args: [wallet.address] });
        return balance > 0n;
      },
    }));
    let prepared: PreparedArtwork[] = [];
    let ruleIds: string[] = [];
    try {
      if (live.chain !== 'sepolia') throw new Error('RareMinter print E2E requires Sepolia.');
      const rareMinter = getContractAddresses(live.chain).rareMinter;
      if (!rareMinter) throw new Error('RareMinter is not configured.');
      const collection = await jsonCommand<{ contract: Address }>(live.sellerHome, [
        'collection', 'deploy', 'lazy-erc721', `RareMinter print ${randomUUID()}`, 'RMPRINT', '--max-tokens', '2', '--chain', live.chain,
      ], 240_000);
      await jsonCommand(live.sellerHome, ['collection', 'prepare-lazy-mint', '--contract', collection.contract,
        '--base-uri', `ipfs://${nftFixtureManifest.metadataCid}/lazy`, '--amount', '2', '--minter', rareMinter, '--chain', live.chain], 240_000);
      let publications: { artwork: PreparedArtwork; tokenId: string; listingDigest: Hex; ruleId?: string }[] = [];
      const setupPrints = async (effectiveFrom?: string): Promise<void> => {
        for (const tokenId of ['1', '2']) prepared = [...prepared, await prepareArtwork(live, collection.contract, tokenId, afterMint)];
        for (const [index, artwork] of prepared.entries()) {
          const tokenId = String(index + 1);
          let ruleId: string | undefined;
          if (gated) {
            const input = await jsonFile(live, `rare-minter-rule-${tokenId}`, {
              ...(afterMint ? { effectiveFrom } : {}),
              definition: { kind: 'PRIMARY_SALE',
                source: { chainId: String(live.chainId), tokenContract: collection.contract, tokenIds: [tokenId] },
                targets: [{ sku: artwork.printSku }] },
            });
            const rule = await jsonCommand<EligibilityRule>(live.sellerHome,
              ['cart', 'purchase-eligibility', 'rules', 'create', '--input', input]);
            ruleId = rule.id;
            ruleIds = [...ruleIds, rule.id];
          }
          const terms = await jsonFile(live, `rare-minter-print-${index}`, { optionId: artwork.optionId,
            seller: live.sellerAddress, listingSalt: `0x${randomBytes(32).toString('hex')}`,
            deadline: deadline(), availableQuantity: '1', ...(ruleId ? { eligibilityRuleId: ruleId } : {}) });
          const publication = await jsonCommand<PrintPublication>(live.sellerHome,
            ['prints', 'listing', 'publish', '--input', terms, '--chain', live.chain, '--yes']);
          const listingDigest = publication.signedArtifact.entries[0]?.listingDigest;
          if (!listingDigest) throw new Error('Print listing is missing.');
          publications = [...publications, { artwork, tokenId, listingDigest, ruleId }];
        }
      };
      if (!afterMint) await setupPrints();
      await jsonCommand(live.sellerHome, ['listing', 'release', 'configure', '--contract', collection.contract,
        '--price', '0.000001', '--max-mints', '2', '--split', `${live.sellerAddress}=100`, '--chain', live.chain, '--yes'], 240_000);
      const mintTotal = parseUnits('0.000001', 18) * 2n;
      const mintProceeds = await readPrimarySaleProceeds(live, collection.contract, mintTotal);
      const mintBalances = await readPurchaseBalances(live, zeroAddress);
      const minted = await jsonCommand<{ txHash: Hex; tokenIds: string[]; totalPrice: string; requiredPayment: string }>(live.buyerHome,
        ['listing', 'release', 'mint', '--contract', collection.contract, '--quantity', '2', '--chain', live.chain, '--yes'], 240_000);
      const mintReceipt = await live.publicClient.getTransactionReceipt({ hash: minted.txHash });
      expect(mintReceipt.status).toBe('success');
      const transfers = parseEventLogs({ abi: erc721Abi, logs: mintReceipt.logs, eventName: 'Transfer' })
        .filter(log => log.address.toLowerCase() === collection.contract.toLowerCase());
      expect(transfers.map(log => String(log.args.tokenId))).toEqual(minted.tokenIds);
      expect(minted.tokenIds).toEqual(['1', '2']);
      expect(BigInt(minted.totalPrice)).toBe(mintTotal);
      await verifyPurchaseBalances(live, { transactionHash: minted.txHash, currency: zeroAddress,
        before: mintBalances, buyerPayment: BigInt(minted.requiredPayment), sellerProceeds: mintProceeds });
      if (afterMint) {
        for (const tokenId of minted.tokenIds) {
          await verifyErc721Ownership(live, createCreatorVariantClient(live), {
            transactionHash: minted.txHash, contract: collection.contract, tokenId,
          });
        }
        const block = await live.publicClient.getBlock({ blockNumber: mintReceipt.blockNumber });
        await setupPrints(new Date(Number(block.timestamp) * 1000).toISOString());
      }
      const tokenId = minted.tokenIds[1];
      const selected = publications.find(item => item.tokenId === tokenId);
      if (!selected || !tokenId) throw new Error('The purchased artwork has no prepared print.');
      const creator = createCreatorVariantClient(live);
      for (const mintedTokenId of minted.tokenIds) {
        await verifyErc721Ownership(live, creator, { transactionHash: minted.txHash,
          contract: collection.contract, tokenId: mintedTokenId });
      }
      await expect.poll(async () => (await creator.cart.catalog.products.get(selected.artwork.productId)).variants
        .find(variant => variant.sku === selected.artwork.nftSku), { timeout: 180_000, interval: 2_000 })
        .toMatchObject({ isHidden: false, universalTokenId: `${live.chainId}-${collection.contract.toLowerCase()}-${tokenId}` });
      const product = await creator.cart.catalog.products.get(selected.artwork.productId);
      expect(product.variants.map(variant => variant.sku)).toEqual(expect.arrayContaining([selected.artwork.nftSku, selected.artwork.printSku]));
      const shipping = await jsonFile(live, 'rare-minter-shipping', { name: 'Sandbox RareMinter Print Test',
        email: 'rare-minter-print-e2e@example.test', phoneNumber: '+12025550123', addressLine1: '123 Test Street',
        townOrCity: 'New York', stateOrCounty: 'NY', postalOrZipCode: '10001', countryCode: 'US' });
      const checkout = ['cart', 'checkout', '--listing', selected.listingDigest, '--payment-currency', 'usdc',
        '--shipping-input', shipping, '--chain', live.chain];
      const claims = (home: string, ruleId: string): Promise<EligibilityClaim[]> =>
        jsonCommand<{ data: EligibilityClaim[] }>(home, ['cart', 'purchase-eligibility', 'claims', 'list',
          '--rule-id', ruleId]).then(page => page.data);
      if (gated) {
        for (const publication of publications) {
          if (!publication.ruleId) throw new Error('The gated print has no eligibility rule.');
          const ruleId = publication.ruleId;
          if (afterMint) {
            expect(await claims(live.buyerHome, ruleId)).toEqual([]);
            await expect(jsonCommand(live.buyerHome, ['cart', 'purchase-eligibility', 'rules', 'backfill', '--rule-id', ruleId]))
              .rejects.toThrow(/Status: 404/u);
            expect(await jsonCommand(live.sellerHome, ['cart', 'purchase-eligibility', 'rules', 'backfill', '--rule-id', ruleId]))
              .toEqual({ queued: true });
          }
          await expect.poll(() => claims(live.buyerHome, ruleId), { timeout: 180_000, interval: 2_000 })
            .toMatchObject([{ status: 'AVAILABLE' }]);
          expect(await claims(live.sellerHome, ruleId)).toEqual([]);
        }
        await expect(jsonCommand(live.sellerHome, [...checkout, '--authorize-only', '--yes']))
          .rejects.toThrow(/Status: 409/u);
      }
      const preview = await jsonCommand<{ preparation: { paymentAmount: string } }>(live.buyerHome, [...checkout, '--preview']);
      expect(BigInt(preview.preparation.paymentAmount)).toBeLessThanOrEqual(50_000_000n);
      const printBalances = await readPurchaseBalances(live, live.usdcAddress);
      const purchase = await jsonCommand<Purchase>(live.buyerHome, [...checkout, '--yes'], 300_000);
      expect((await live.publicClient.getTransactionReceipt({ hash: purchase.txHash })).status).toBe('success');
      const readOrder = (): Promise<CartOrder> => jsonCommand(live.buyerHome, ['cart', 'orders', 'get', '--id', purchase.orderId]);
      await expect.poll(async () => (await readOrder()).fulfillments[0]?.providerOrderId,
        { timeout: 240_000, interval: 3_000 }).toMatch(/^ord_/u);
      const order = await readOrder();
      expect(order.items).toHaveLength(1);
      expect(order.fulfillments).toHaveLength(1);
      const settlement = await verifyUsdcCartSettlement(live, creator, purchase, { paymentAmount: BigInt(preview.preparation.paymentAmount) }, true);
      const sellerProceeds = settlement.lines.filter(line => line.paymentRecipient.toLowerCase() === live.sellerAddress.toLowerCase())
        .reduce((sum, line) => sum + BigInt(line.amount), 0n);
      await verifyPurchaseBalances(live, { transactionHash: purchase.txHash, currency: live.usdcAddress,
        before: printBalances, buyerPayment: BigInt(preview.preparation.paymentAmount), sellerProceeds });
      if (selected.ruleId) {
        const ruleId = selected.ruleId;
        await expect.poll(() => claims(live.buyerHome, ruleId), { timeout: 180_000, interval: 2_000 })
          .toMatchObject([{ status: 'CONSUMED' }]);
        for (const other of publications) {
          if (other.ruleId && other.ruleId !== ruleId)
            expect(await claims(live.buyerHome, other.ruleId)).toMatchObject([{ status: 'AVAILABLE' }]);
        }
      }
      await verifyPrivateCartOrder(live, purchase.orderId);
      await verifyCartPurchaseNotifications(live, purchase, 1);
      const fulfillment = order.fulfillments[0];
      if (!fulfillment?.providerOrderId) throw new Error('Print did not reach Prodigi.');
      const response = await fetch(`https://api.sandbox.prodigi.com/v4.0/orders/${encodeURIComponent(fulfillment.providerOrderId)}`, {
        headers: { 'X-API-Key': sandboxKey }, signal: AbortSignal.timeout(30_000), redirect: 'error',
      });
      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      const provider = sandboxOrder.parse(body).order;
      expect(provider.metadata.fulfillmentId).toBe(fulfillment.id);
      expect(provider.items).toHaveLength(1);
      expect(provider.items[0]).toMatchObject({ sku: 'GLOBAL-FAP-8X12', copies: 1 });
      const asset = provider.items[0]?.assets[0];
      if (!asset) throw new Error('Prodigi order has no production asset.');
      expect(decodeURIComponent(new URL(asset.url).pathname).includes(selected.artwork.masterKey)).toBe(true);
      console.info('RareMinter to Cart print verified', { mintTransactionHash: minted.txHash,
        transactionHash: purchase.txHash, orderId: purchase.orderId, providerOrderId: provider.id });
    } finally {
      try {
        for (const ruleId of ruleIds)
          await jsonCommand(live.sellerHome, ['cart', 'purchase-eligibility', 'rules', 'disable', '--rule-id', ruleId]);
        for (const artwork of prepared) {
          await jsonCommand(live.sellerHome, ['prints', 'drops', 'archive', '--id', artwork.dropId]);
          await jsonCommand(live.sellerHome, ['cart', 'catalog', 'products', 'archive', '--product-id', artwork.productId, '--chain', live.chain]);
        }
      } finally { await cleanupLiveFixture(live); }
    }
  }, 900_000);

});

async function prepareArtwork(live: BuyerLiveFixture, contract: Address, tokenId: string, alreadyMinted = false): Promise<PreparedArtwork> {
  const name = `Blind artwork ${tokenId} ${randomUUID()}`;
  const productFile = await jsonFile(live, `product-${tokenId}`, { metadata: { title: name } });
  const product = await jsonCommand<CartApiProduct>(live.sellerHome,
    ['cart', 'catalog', 'products', 'create', '--input', productFile, '--chain', live.chain]);
  if (!alreadyMinted) await expect(live.publicClient.readContract({ address: contract, abi: erc721Abi, functionName: 'ownerOf', args: [BigInt(tokenId)] })).rejects.toThrow();
  const variants = await jsonFile(live, `variant-${tokenId}`, alreadyMinted
    ? { universalTokenIds: [`${live.chainId}-${contract.toLowerCase()}-${tokenId}`] }
    : { variants: [{ metadata: { title: name },
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
  const print = await preparePrintSize(live, {
    productId: product.id, name, masterKey: master.key, publicUrl: photo.url, specificationId: 'GLOBAL-FAP-8X12',
  });
  await jsonCommand(live.sellerHome, ['cart', 'catalog', 'products', 'publish', '--product-id', product.id, '--chain', live.chain]);
  return { ...print, productId: product.id, nftSku: nft.sku, masterKey: master.key, publicUrl: photo.url, name };
}

async function preparePrintSize(live: BuyerLiveFixture, input: {
  productId: string; name: string; masterKey: string; publicUrl: string; specificationId: string;
}): Promise<PreparedPrintSize> {
  const { productId, name, masterKey, publicUrl, specificationId } = input;
  const printFile = await jsonFile(live, `print-${productId}-${specificationId}`, {
    idempotencyKey: randomUUID(), productId, chainId: String(live.chainId), name,
    print: { name, description: 'Ordered blind mint physical variant', tags: ['test'],
      productionUploadKey: masterKey, images: [publicUrl], specificationId },
  });
  const drop = await jsonCommand<{ id: string }>(live.sellerHome, ['prints', 'drops', 'create', '--input', printFile]);
  const option = await jsonCommand<{ id: string; sku: Hex }>(live.sellerHome,
    ['prints', 'drops', 'configure', '--id', drop.id, '--price-usd-cents', '100']);
  return { dropId: drop.id, printSku: option.sku, optionId: option.id, specificationId };
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
  await verifyErc721Ownership(live, createCreatorVariantClient(live), {
    transactionHash: purchase.txHash, contract, tokenId: tokenId.toString(),
  });
  expect(await live.publicClient.readContract({ address: contract, abi: erc721Abi, functionName: 'tokenURI', args: [tokenId] }))
    .toBe(`ipfs://${nftFixtureManifest.metadataCid}/lazy/${tokenId}.json`);
}
function assertFees(receipt: CartCheckoutReceipt, paymentAmount: string): void {
  expect(receipt.issues).toEqual([]);
  expect(receipt.paymentAmount).toBe(paymentAmount);
  expect(receipt.lines.reduce((sum, line) => sum + BigInt(line.amount), 0n)).toBe(BigInt(paymentAmount));
  expect(receipt).not.toHaveProperty('feeAllocations');
  const feeLines = receipt.lines.filter(line => line.fulfillmentKind === 0);
  expect(feeLines).toHaveLength(4);
  expect(feeLines.every(line => BigInt(line.amount) > 0n)).toBe(true);
}
