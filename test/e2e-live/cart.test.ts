import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cartAbi, getCartAddress } from '@rareprotocol/rare-sdk/contracts';
import { erc721Abi, isHex, type Address, type Hex } from 'viem';
import { z } from 'zod';
import {
  cleanupLiveFixture,
  createLiveFixture,
  expectTx,
  jsonCommand,
  LiveFixtureRef,
  missingEnv,
  requireBuyerFixture,
  step,
  type BuyerLiveFixture,
  type TxResult,
} from './helpers/live-harness.js';
import { deployErc721Collection, mintToken } from './helpers/live-erc721.js';

const missingCartEnv = [
  ...missingEnv,
  ...(process.env.RARE_API_BASE_URL ? [] : ['RARE_API_BASE_URL']),
  ...(process.env.RARE_API_AUTH_TOKEN ? [] : ['RARE_API_AUTH_TOKEN']),
];
const describeLive = missingCartEnv.length === 0 ? describe.sequential : describe.skip;
const live = new LiveFixtureRef<CartLiveFixture>(`Live Cart environment is not configured: ${missingCartEnv.join(', ')}`);

type CartLiveFixture = BuyerLiveFixture & {
  collection: Address;
  purchasedTokenId: bigint;
  listingDigests: Hex[];
  rootDigest: Hex;
  nonceBeforeInvalidation: bigint;
};

type CartListingCreateResult = {
  rootDigest: Hex;
  listingDigests: Hex[];
  approvalTxHashes: Hex[];
  signedArtifact: { signature: Hex; entries: unknown[] };
};

type CartCheckoutPreviewResult = {
  preview: true;
  preparation: {
    intent: { items: Array<{ listingDigest: Hex; quantity: string; recipient: Address }> };
    paymentAmount: string;
    expiresAt: string;
  };
};

type CartPurchaseResult = TxResult & {
  orderId: Hex;
  payer: Address;
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
      const collection = await deployErc721Collection(fixture, '3');
      const firstToken = await mintToken(fixture, collection.contract);
      const secondToken = await mintToken(fixture, collection.contract);
      const thirdToken = await mintToken(fixture, collection.contract);
      const tokens = [firstToken, secondToken, thirdToken];
      const skus = await createCartCatalogFixtures(fixture, collection.contract, tokens.map((token) => token.tokenId));
      const inputPath = join(fixture.tempDir, 'cart-listings.json');
      await writeFile(inputPath, JSON.stringify({
        deadline: String(Math.floor(Date.now() / 1_000) + 3_600),
        listings: skus.map((sku) => ({
          sku,
          settlementCurrency: 'eth',
          unitPrice: process.env.E2E_CART_UNIT_PRICE_ETH ?? '0.000001',
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
      expect(created.signedArtifact.signature).toMatch(/^0x[0-9a-fA-F]+$/);
      expect(created.signedArtifact.entries).toHaveLength(3);
      const nonceBeforeInvalidation = await fixture.publicClient.readContract({
        address: getCartAddress(fixture.chain),
        abi: cartAbi,
        functionName: 'listingNonces',
        args: [fixture.sellerAddress],
      });
      live.set({
        ...fixture,
        collection: collection.contract,
        purchasedTokenId: BigInt(firstToken.tokenId),
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

  it('previews and purchases a fixed-price Cart checkout', async () => {
    const fixture = live.value;
    const listingDigest = fixture.listingDigests[0]!;
    const preview = await step('preview Cart checkout', () =>
      jsonCommand<CartCheckoutPreviewResult>(fixture.buyerHome, [
        'cart', 'checkout', '--listing', listingDigest, '--payment-currency', 'eth', '--preview', '--chain', fixture.chain,
      ], 240_000));
    expect(preview.preview).toBe(true);
    expect(preview.preparation.intent.items).toEqual([{
      listingDigest,
      quantity: '1',
      recipient: fixture.buyerAddress,
    }]);
    expect(BigInt(preview.preparation.paymentAmount)).toBeGreaterThan(0n);
    expect(Date.parse(preview.preparation.expiresAt)).toBeGreaterThan(Date.now());

    const purchase = await step('purchase Cart checkout', () =>
      jsonCommand<CartPurchaseResult>(fixture.buyerHome, [
        'cart', 'checkout', '--listing', listingDigest, '--payment-currency', 'eth', '--chain', fixture.chain,
      ], 300_000));
    expectTx(purchase);
    expect(purchase.orderId).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(purchase.payer.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());
    expect(purchase.lineCount).toBeGreaterThanOrEqual(1);
    expect(purchase.actionCount).toBe(1);
    const owner = await fixture.publicClient.readContract({
      address: fixture.collection,
      abi: erc721Abi,
      functionName: 'ownerOf',
      args: [fixture.purchasedTokenId],
    });
    expect(owner.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());
  }, 360_000);

  it('cancels one listing and its Listing Root on-chain', async () => {
    const fixture = live.value;
    const listingDigest = fixture.listingDigests[1]!;
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

async function createCartCatalogFixtures(
  fixture: BuyerLiveFixture,
  tokenContract: Address,
  tokenIds: readonly string[],
): Promise<Hex[]> {
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const product = await postCartFixture('/v1/cart/products', {
    slug: `rare-cli-cart-${runId}`,
    metadata: { source: 'rare-cli-e2e', runId },
  }, z.object({ id: z.string() }));
  return Promise.all(tokenIds.map(async (tokenId, position) => {
    const created = await postCartFixture('/v1/cart/skus', {
      metadata: { chainId: fixture.chainId, tokenContract, tokenId },
    }, z.object({ sku: z.custom<Hex>((value) => typeof value === 'string' && isHex(value) && value.length === 66) }));
    await postCartFixture(`/v1/cart/products/${product.id}/skus`, {
      sku: created.sku,
      position,
      metadata: { runId },
    }, z.unknown());
    return created.sku;
  }));
}

async function postCartFixture<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const baseUrl = process.env.RARE_API_BASE_URL;
  const authToken = process.env.RARE_API_AUTH_TOKEN;
  if (!baseUrl || !authToken) throw new Error('RARE_API_BASE_URL and RARE_API_AUTH_TOKEN are required.');
  const response = await fetch(new URL(path, baseUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${authToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Cart fixture request ${path} failed with ${response.status}.`);
  const payload = await response.json();
  if (!isRecord(payload) || payload.data === undefined) throw new Error(`Cart fixture request ${path} returned no data.`);
  const data: unknown = payload.data;
  return schema.parse(data);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
