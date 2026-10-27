import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createRareClient, type RareClient } from '@rareprotocol/rare-sdk';
import { zeroAddress, type Address, type Hex } from 'viem';
import { createAuthStore } from '../../../src/auth-storage.js';
import type { LiveFixture } from './live-harness.js';

/** Exercise listing-time SKU creation using assets minted by this test run. */
export async function createCreatorVariantSkus(
  live: LiveFixture,
  tokens: readonly { contract: Address; tokenId: string; fulfillmentKind?: 2 | 3 }[],
): Promise<Hex[]> {
  const rare = createCreatorVariantClient(live);
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
  const product = await rare.cart.catalog.products.create({
    slug: `cli-cart-${runId}`, metadata: { title: 'CLI Cart E2E', source: 'rare-cli', runId },
  });
  for (const [position, listing] of listings.entries()) {
    await rare.cart.catalog.products.attachSku(product.id, { sku: listing.sku, position, metadata: {} });
  }
  await rare.cart.catalog.products.publish(product.id);
  return listings.map(listing => listing.sku);
}

/** A mint SKU describes new inventory, not an existing or indexed NFT. */
export async function createCreatorMintVariantSku(live: LiveFixture, contract: Address): Promise<Hex> {
  const rare = createCreatorVariantClient(live);
  const runId = randomUUID();
  const product = await rare.cart.catalog.products.create({
    slug: `cli-cart-mint-${runId}`, metadata: { title: 'CLI Cart mint E2E', source: 'rare-cli', runId },
  });
  const created = await rare.cart.catalog.variants.add(product.id, {
    variants: [{ metadata: {
      type: 'ERC721', chainId: String(live.chainId), tokenContract: contract,
      // Cart's ERC721_MINT_TO Listing uses zero until mintTo returns the real ID.
      tokenId: '0',
    } }],
  });
  const variant = created.variants[0];
  if (created.variants.length !== 1 || variant === undefined || variant.universalTokenId !== null) throw new Error('Creator fixture did not return an unattached mint SKU.');
  await rare.cart.catalog.products.publish(product.id);
  return variant.sku;
}

function createCreatorVariantClient(live: LiveFixture): RareClient {
  const apiBaseUrl = live.accountApiBaseUrl;
  if (apiBaseUrl === undefined) throw new Error('Cart creator fixture requires an authenticated API deployment.');
  return createRareClient({ publicClient: live.publicClient, apiBaseUrl,
    sessionStore: createAuthStore({ apiBaseUrl, authBaseUrl: `${apiBaseUrl}/auth/v2`,
      clientId: 'rare-sdk', backend: 'file', directory: join(live.sellerHome, 'auth') }),
  });
}
