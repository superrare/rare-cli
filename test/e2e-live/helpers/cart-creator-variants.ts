import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createRareAccountClient, createRareClient } from '@rareprotocol/rare-sdk';
import { zeroAddress, type Address, type Hex } from 'viem';
import { z } from 'zod';
import { createAuthStore } from '../../../src/auth-storage.js';
import type { LiveFixture } from './live-harness.js';

const productSchema = z.object({ data: z.object({ id: z.string() }) });

/** Exercise listing-time SKU creation using assets minted by this test run. */
export async function createCreatorVariantSkus(
  live: LiveFixture,
  tokens: readonly { contract: Address; tokenId: string; fulfillmentKind?: 2 | 3 }[],
): Promise<Hex[]> {
  const apiBaseUrl = live.accountApiBaseUrl;
  if (apiBaseUrl === undefined) throw new Error('Cart creator fixture requires an authenticated API deployment.');
  const accountClient = createRareAccountClient({ apiBaseUrl, clientId: 'rare-cli',
    sessionStore: createAuthStore({ apiBaseUrl, authBaseUrl: `${apiBaseUrl}/auth/v2`,
      clientId: 'rare-cli', backend: 'file', directory: join(live.sellerHome, 'auth') }),
  });
  const rare = createRareClient({ publicClient: live.publicClient, apiBaseUrl, accountClient });
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
