import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRareClient } from '@rareprotocol/rare-sdk';
import { cartAbi, getCartAddress } from '@rareprotocol/rare-sdk/contracts';
import { erc721Abi, getAddress, parseEventLogs, zeroAddress, type Address, type Hex } from 'viem';
import {
  cleanupLiveFixture,
  createLiveFixture,
  expectTx,
  expectTokenBalanceAtLeast,
  jsonCommand,
  LiveFixtureRef,
  missingEnv,
  readTokenBalance,
  requireBuyerFixture,
  step,
  type BuyerLiveFixture,
  type TxResult,
} from './helpers/live-harness.js';
import { deployErc721Collection, mintToken } from './helpers/live-erc721.js';

const cartUnitPriceEth = '0.000001';
const contractIndexingDelayMs = 15_000;

const missingCartEnv = [
  ...missingEnv,
  ...(process.env.RARE_API_BASE_URL ? [] : ['RARE_API_BASE_URL']),
];
const describeLive = missingCartEnv.length === 0 ? describe.sequential : describe.skip;
const live = new LiveFixtureRef<CartLiveFixture>(`Live Cart environment is not configured: ${missingCartEnv.join(', ')}`);

type CartLiveFixture = BuyerLiveFixture & {
  collection: Address;
  purchasedTokenIds: bigint[];
  listingDigests: Hex[];
  rootDigest: Hex;
  nonceBeforeInvalidation: bigint;
};

type CartListingCreateResult = {
  rootDigest: Hex;
  listingDigests: Hex[];
  approvalTxHashes: Hex[];
  publishedRoot: {
    seller: Address;
    listingCount: number;
  };
  signedArtifact: { signature: Hex; entries: unknown[] };
};

type CartCheckoutPreviewResult = {
  preview: true;
  preparation: {
    intent: { items: Array<{ listingDigest: Hex; quantity: string; recipient: Address }> };
    paymentAmount: string;
    expiresAt: string;
    lines: Array<{
      sku: Hex;
      listingDigest: Hex;
      fulfillmentKind: number;
      quantity: string;
      settlementCurrency: Address;
      amount: string;
      paymentRecipient: Address;
    }>;
    route: { inputs: Hex[] };
  };
};

type CartPurchaseResult = TxResult & {
  txHash: Hex;
  approvalTxHash: Hex | null;
  orderId: Hex;
  payer: Address;
  paymentCurrency: Address;
  paymentAmount: string;
  lineCount: number;
  actionCount: number;
};

describeLive('live Rare API and Sepolia Cart CLI workflow', () => {
  beforeAll(async () => {
    const fixture = requireBuyerFixture(await createLiveFixture({ buyer: true }));
    if (fixture.chain !== 'sepolia') {
      await cleanupLiveFixture(fixture);
      throw new Error('Cart live E2E currently requires TEST_RPC_URL to target Sepolia.');
    }
    try {
      const rare = createRareClient({
        publicClient: fixture.publicClient,
        apiBaseUrl: process.env.RARE_API_BASE_URL,
      });
      await step('preflight public Cart Variant catalog', () =>
        rare.cart.catalog.variants.search({
          nft: {
            contract: '0x0000000000000000000000000000000000000001',
            tokenId: 0n,
          },
          perPage: 1,
        }));
      await expectTokenBalanceAtLeast(fixture, fixture.buyerAddress, fixture.rareAddress, '1');
      const collection = await deployErc721Collection(fixture, '3');
      await step('wait for ERC-721 contract indexing', () =>
        new Promise((resolve) => setTimeout(resolve, contractIndexingDelayMs)));
      const firstToken = await mintToken(fixture, collection.contract);
      const secondToken = await mintToken(fixture, collection.contract);
      const thirdToken = await mintToken(fixture, collection.contract);
      const tokens = [firstToken, secondToken, thirdToken];
      const skus = await Promise.all(tokens.map((token) =>
        pollForIndexedSku(rare, collection.contract, token.tokenId)));
      const inputPath = join(fixture.tempDir, 'cart-listings.json');
      await writeFile(inputPath, JSON.stringify({
        deadline: String(Math.floor(Date.now() / 1_000) + 3_600),
        listings: skus.map((sku) => ({
          sku,
          settlementCurrency: 'eth',
          unitPrice: cartUnitPriceEth,
          quantity: '1',
          paymentRecipient: fixture.sellerAddress,
        })),
      }, null, 2), 'utf8');

      const preview = await step('preview Cart Listing Root', () =>
        jsonCommand<{ preview: true; preparation: { artifact: { entries: unknown[] } } }>(fixture.sellerHome, [
          'cart', 'listing', 'create', '--input', inputPath, '--preview', '--chain', fixture.chain,
        ], 240_000));
      expect(preview.preview).toBe(true);
      expect(preview.preparation.artifact.entries).toHaveLength(3);

      const artifactPath = join(fixture.tempDir, 'cart-listing-root.json');
      const created = await step('publish Cart Listing Root', () =>
        jsonCommand<CartListingCreateResult>(fixture.sellerHome, [
          'cart', 'listing', 'create', '--input', inputPath, '--output', artifactPath, '--chain', fixture.chain,
        ], 240_000));
      expect(created.listingDigests).toHaveLength(3);
      expect(created.approvalTxHashes).toHaveLength(1);
      expect(created.approvalTxHashes[0]).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(created.publishedRoot.listingCount).toBe(3);
      expect(created.publishedRoot.seller.toLowerCase()).toBe(fixture.sellerAddress.toLowerCase());
      expect(created.signedArtifact.signature).toMatch(/^0x[0-9a-fA-F]+$/);
      expect(created.signedArtifact.entries).toHaveLength(3);
      await expect(rare.cart.approval.status(collection.contract, fixture.sellerAddress)).resolves.toBe(true);
      await pollForPublishedListings(rare, fixture.sellerAddress, created.listingDigests);
      const nonceBeforeInvalidation = await fixture.publicClient.readContract({
        address: getCartAddress(fixture.chain),
        abi: cartAbi,
        functionName: 'listingNonces',
        args: [fixture.sellerAddress],
      });
      live.set({
        ...fixture,
        collection: collection.contract,
        purchasedTokenIds: [BigInt(firstToken.tokenId), BigInt(secondToken.tokenId)],
        listingDigests: created.listingDigests,
        rootDigest: created.rootDigest,
        nonceBeforeInvalidation,
      });
    } catch (error) {
      await cleanupLiveFixture(fixture);
      throw error;
    }
  }, 480_000);

  afterAll(async () => {
    await cleanupLiveFixture(live.optionalValue);
  });

  it('routes RARE payment across a multi-item fixed-price Cart checkout', async () => {
    const fixture = live.value;
    const listingDigests = fixture.listingDigests.slice(0, 2);
    expect(listingDigests).toHaveLength(2);
    const listingArgs = listingDigests.flatMap((listingDigest) => ['--listing', listingDigest]);
    const preview = await step('preview Cart checkout', () =>
      jsonCommand<CartCheckoutPreviewResult>(fixture.buyerHome, [
        'cart', 'checkout', ...listingArgs, '--payment-currency', 'rare', '--preview', '--chain', fixture.chain,
      ], 240_000));
    expect(preview.preview).toBe(true);
    expect(preview.preparation.intent.items).toEqual(listingDigests.map((listingDigest) => ({
      listingDigest,
      quantity: '1',
      recipient: fixture.buyerAddress,
    })));
    expect(BigInt(preview.preparation.paymentAmount)).toBeGreaterThan(0n);
    expect(Date.parse(preview.preparation.expiresAt)).toBeGreaterThan(Date.now());
    expect(preview.preparation.route.inputs.length).toBeGreaterThan(0);
    const entitlements = aggregateEntitlements(preview.preparation.lines);
    expect(entitlements.length).toBeGreaterThan(0);
    const payoutBalancesBefore = await Promise.all(entitlements.map(async (entitlement) => ({
      ...entitlement,
      balance: await readCurrencyBalance(fixture, entitlement.recipient, entitlement.currency),
    })));
    const buyerRareBalanceBefore = await readTokenBalance(fixture, fixture.buyerAddress, fixture.rareAddress);

    const purchase = await step('purchase Cart checkout', () =>
      jsonCommand<CartPurchaseResult>(fixture.buyerHome, [
        'cart', 'checkout', ...listingArgs, '--payment-currency', 'rare', '--chain', fixture.chain,
      ], 300_000));
    expectTx(purchase);
    if (purchase.approvalTxHash !== null) {
      expect(purchase.approvalTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
      await expect(fixture.publicClient.getTransactionReceipt({ hash: purchase.approvalTxHash })).resolves.toMatchObject({ status: 'success' });
    }
    expect(purchase.orderId).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(purchase.payer.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());
    expect(purchase.paymentCurrency.toLowerCase()).toBe(fixture.rareAddress.toLowerCase());
    expect(purchase.lineCount).toBeGreaterThanOrEqual(2);
    expect(purchase.actionCount).toBe(2);
    const purchaseReceipt = await fixture.publicClient.getTransactionReceipt({ hash: purchase.txHash });
    const settledLines = parseEventLogs({
      abi: cartAbi,
      logs: purchaseReceipt.logs,
      eventName: 'OrderLineSettled',
    });
    expect(settledLines).toHaveLength(preview.preparation.lines.length);
    for (const [lineIndex, line] of preview.preparation.lines.entries()) {
      const settled = settledLines.find((event) => event.args.lineIndex === BigInt(lineIndex));
      expect(settled?.args).toMatchObject({
        orderId: purchase.orderId,
        lineIndex: BigInt(lineIndex),
        sku: line.sku,
        listingDigest: line.listingDigest,
        quantity: BigInt(line.quantity),
        settlementCurrency: getAddress(line.settlementCurrency),
        amount: BigInt(line.amount),
        paymentRecipient: getAddress(line.paymentRecipient),
        fulfillmentKind: line.fulfillmentKind,
      });
    }
    const buyerRareBalanceAfter = await readTokenBalance(fixture, fixture.buyerAddress, fixture.rareAddress);
    const buyerRareSpent = buyerRareBalanceBefore - buyerRareBalanceAfter;
    expect(buyerRareSpent).toBeGreaterThan(0n);
    expect(buyerRareSpent).toBeLessThanOrEqual(BigInt(purchase.paymentAmount));
    for (const entitlement of payoutBalancesBefore) {
      const balanceAfter = await readCurrencyBalance(fixture, entitlement.recipient, entitlement.currency);
      const balanceDelta = balanceAfter - entitlement.balance;
      if (entitlement.recipient === fixture.sellerAddress) {
        expect(balanceDelta).toBe(entitlement.amount);
      } else {
        expect(balanceDelta).toBeGreaterThanOrEqual(entitlement.amount);
      }
    }
    for (const tokenId of fixture.purchasedTokenIds) {
      const owner = await fixture.publicClient.readContract({
        address: fixture.collection,
        abi: erc721Abi,
        functionName: 'ownerOf',
        args: [tokenId],
      });
      expect(owner.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());
    }
  }, 360_000);

  it('cancels one listing and its Listing Root on-chain', async () => {
    const fixture = live.value;
    const listingDigest = fixture.listingDigests[2]!;
    const cancelled = await step('cancel Cart listing', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'cart', 'listing', 'cancel', '--listing-digest', listingDigest, '--chain', fixture.chain,
      ]));
    expectTx(cancelled);
    await expect(fixture.publicClient.readContract({
      address: getCartAddress(fixture.chain),
      abi: cartAbi,
      functionName: 'cancelledListings',
      args: [fixture.sellerAddress, listingDigest],
    })).resolves.toBe(true);

    const cancelledRoot = await step('cancel Cart Listing Root', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'cart', 'listing', 'cancel-root', '--root-digest', fixture.rootDigest, '--chain', fixture.chain,
      ]));
    expectTx(cancelledRoot);
    await expect(fixture.publicClient.readContract({
      address: getCartAddress(fixture.chain),
      abi: cartAbi,
      functionName: 'cancelledListingRoots',
      args: [fixture.sellerAddress, fixture.rootDigest],
    })).resolves.toBe(true);
  }, 240_000);

  it('invalidates the seller Listing nonce', async () => {
    const fixture = live.value;
    const result = await step('invalidate Cart listing nonce', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'cart', 'listing', 'invalidate-nonce', '--chain', fixture.chain,
      ]));
    expectTx(result);
    await expect(fixture.publicClient.readContract({
      address: getCartAddress(fixture.chain),
      abi: cartAbi,
      functionName: 'listingNonces',
      args: [fixture.sellerAddress],
    })).resolves.toBe(fixture.nonceBeforeInvalidation + 1n);
  }, 180_000);
});

async function pollForIndexedSku(
  rare: ReturnType<typeof createRareClient>,
  tokenContract: Address,
  tokenId: string,
): Promise<Hex> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const result = await rare.cart.catalog.variants.search({
      nft: { contract: tokenContract, tokenId },
      perPage: 2,
    });
    if (result.data.length > 1) {
      throw new Error(`Cart catalog returned multiple Variants for ${tokenContract}:${tokenId}.`);
    }
    const variant = result.data[0];
    if (variant) {
      const bySku = await rare.cart.catalog.variants.search({ sku: variant.sku, perPage: 2 });
      if (bySku.data.length !== 1 || bySku.data[0]?.sku !== variant.sku) {
        throw new Error(`Cart catalog could not resolve indexed SKU ${variant.sku} uniquely.`);
      }
      return variant.sku;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Timed out waiting for Cart catalog indexing of ${tokenContract}:${tokenId}.`);
}

async function pollForPublishedListings(
  rare: ReturnType<typeof createRareClient>,
  seller: Address,
  listingDigests: readonly Hex[],
): Promise<void> {
  const expected = new Set(listingDigests.map((digest) => digest.toLowerCase()));
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const result = await rare.cart.api.listing.search({ seller, perPage: 100 });
    const published = new Set(result.data.map((listing) => listing.listingDigest.toLowerCase()));
    if ([...expected].every((digest) => published.has(digest))) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Timed out waiting for Rare API to return ${listingDigests.length} published Cart listings.`);
}

type CartEntitlement = {
  recipient: Address;
  currency: Address;
  amount: bigint;
};

function aggregateEntitlements(
  lines: CartCheckoutPreviewResult['preparation']['lines'],
): CartEntitlement[] {
  return lines.reduce<CartEntitlement[]>((totals, line) => {
    const recipient = getAddress(line.paymentRecipient);
    const currency = getAddress(line.settlementCurrency);
    const existing = totals.find((entitlement) =>
      entitlement.recipient === recipient && entitlement.currency === currency);
    return existing === undefined
      ? [...totals, { recipient, currency, amount: BigInt(line.amount) }]
      : totals.map((entitlement) => entitlement === existing
        ? { ...entitlement, amount: entitlement.amount + BigInt(line.amount) }
        : entitlement);
  }, []);
}

async function readCurrencyBalance(
  fixture: BuyerLiveFixture,
  owner: Address,
  currency: Address,
): Promise<bigint> {
  return currency === zeroAddress
    ? fixture.publicClient.getBalance({ address: owner })
    : readTokenBalance(fixture, owner, currency);
}
