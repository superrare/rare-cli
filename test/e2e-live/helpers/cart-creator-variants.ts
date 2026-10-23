import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createRareClient, type RareClient } from '@rareprotocol/rare-sdk';
import { isHex, zeroAddress, type Address, type Hex } from 'viem';
import { z } from 'zod';
import { createAuthStore } from '../../../src/auth-storage.js';
import type { LiveFixture } from './live-harness.js';

const productSchema = z.object({ data: z.object({ id: z.string() }) });
const mintVariantSchema = z.object({ data: z.object({
  variants: z.array(z.object({
    sku: z.custom<Hex>((value) => typeof value === 'string' && isHex(value) && value.length === 66),
    universalTokenId: z.null(),
  })).length(1),
}) });

/** Exercise listing-time SKU creation using assets minted by this test run. */
export async function createCreatorVariantSkus(
  live: LiveFixture,
  tokens: readonly { contract: Address; tokenId: string; fulfillmentKind?: 2 | 3 }[],
): Promise<Hex[]> {
  const { rare, post } = createCreatorVariantApi(live);
  const intent = {
    seller: live.sellerAddress,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    listings: tokens.map(token => ({
      nft: { contract: token.contract, tokenId: BigInt(token.tokenId) },
      fulfillmentKind: token.fulfillmentKind ?? 2,
      settlementCurrency: zeroAddress,
      unitPrice: 1_000_000_000_000n,
      quantity: 1n,
    })),
  };
  const listings = await rare.cart.api.listing.preview(intent);
  const repeated = await rare.cart.api.listing.preview(intent);
  if (listings.some((listing, index) => listing.sku !== repeated[index]?.sku)) {
    throw new Error('Repeated listing preparation created duplicate NFT SKUs.');
  }
  const runId = randomUUID();
  const product = productSchema.parse(await post('/v1/cart/products', {
    slug: `cli-cart-${runId}`, metadata: { title: 'CLI Cart E2E', source: 'rare-cli', runId },
  })).data;
  for (const [position, listing] of listings.entries()) {
    await post(`/v1/cart/products/${product.id}/skus`, { sku: listing.sku, position, metadata: {} });
  }
  await post(`/v1/cart/products/${product.id}/publish`, {});
  return listings.map(listing => listing.sku);
}

/** A mint SKU describes new inventory, not an existing or indexed NFT. */
export async function createCreatorMintVariantSku(live: LiveFixture, contract: Address): Promise<Hex> {
  const { post } = createCreatorVariantApi(live);
  const runId = randomUUID();
  const product = productSchema.parse(await post('/v1/cart/products', {
    slug: `cli-cart-mint-${runId}`, metadata: { title: 'CLI Cart mint E2E', source: 'rare-cli', runId },
  })).data;
  const created = mintVariantSchema.parse(await post(`/v1/cart/products/${product.id}/variants`, {
    variants: [{ metadata: {
      type: 'ERC721', chainId: String(live.chainId), tokenContract: contract,
      // Cart's ERC721_MINT_TO Listing uses zero until mintTo returns the real ID.
      tokenId: '0',
    } }],
  })).data;
  const variant = created.variants[0];
  if (variant === undefined) throw new Error('Creator fixture did not return a mint SKU.');
  await post(`/v1/cart/products/${product.id}/publish`, {});
  return variant.sku;
}

function createCreatorVariantApi(live: LiveFixture): {
  rare: RareClient;
  post: (path: string, body: unknown) => Promise<unknown>;
} {
  const apiBaseUrl = live.accountApiBaseUrl;
  if (apiBaseUrl === undefined) throw new Error('Cart creator fixture requires an authenticated API deployment.');
  const accountClient = createRareClient({ apiBaseUrl,
    sessionStore: createAuthStore({ apiBaseUrl, authBaseUrl: `${apiBaseUrl}/auth/v2`,
      clientId: 'rare-sdk', backend: 'file', directory: join(live.sellerHome, 'auth') }),
  });
  const rare = createRareClient({ publicClient: live.publicClient, apiBaseUrl, accountClient });
  const post = async (path: string, body: unknown): Promise<unknown> => {
    const response = await accountClient.authenticatedFetch(new URL(path, apiBaseUrl), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const failure = z.object({ error: z.string() }).safeParse(payload);
      throw new Error(`Creator variant fixture ${path} failed with ${response.status}: ${failure.success ? failure.data.error : 'unrecognized API error'}.`);
    }
    return payload;
  };
  return { rare, post };
}
