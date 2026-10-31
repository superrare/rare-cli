import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createRareClient, type RareClient } from '@rareprotocol/rare-sdk';
import { zeroAddress, type Address, type Hex } from 'viem';
import { createAuthStore } from '../../../src/auth-storage.js';
import { jsonCommand, type LiveFixture } from './live-harness.js';
import type { CartApiProduct } from '@rareprotocol/rare-sdk';

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
  const listings = (await rare.cart.listing.prepare(intent)).artifact.entries.map(entry => entry.listing);
  const repeated = (await rare.cart.listing.prepare(intent)).artifact.entries.map(entry => entry.listing);
  if (listings.some((listing, index) => listing.sku !== repeated[index]?.sku)) {
    throw new Error('Repeated listing preparation created duplicate NFT SKUs.');
  }
  const runId = randomUUID();
  const product = await catalog<CartApiProduct>(live, ['products', 'create'], {
    slug: `cli-cart-${runId}`, metadata: { title: 'CLI Cart E2E', source: 'rare-cli', runId },
  });
  for (const [position, listing] of listings.entries()) {
    await catalog(live, ['products', 'attach-sku', '--product-id', product.id], { sku: listing.sku, position, metadata: {} });
  }
  await catalog(live, ['products', 'publish', '--product-id', product.id]);
  return listings.map(listing => listing.sku);
}

/** A mint SKU describes new inventory, not an existing or indexed NFT. */
export async function createCreatorMintVariantSku(live: LiveFixture, contract: Address): Promise<Hex> {
  const runId = randomUUID();
  const product = await catalog<CartApiProduct>(live, ['products', 'create'], {
    slug: `cli-cart-mint-${runId}`, metadata: { title: 'CLI Cart mint E2E', source: 'rare-cli', runId },
  });
  const created = await catalog<CartApiProduct>(live, ['variants', 'add', '--product-id', product.id], {
    variants: [{ metadata: {
      type: 'ERC721', chainId: String(live.chainId), tokenContract: contract,
      // Cart's ERC721_MINT_TO Listing uses zero until mintTo returns the real ID.
      tokenId: '0',
    } }],
  });
  const variant = created.variants[0];
  if (created.variants.length !== 1 || variant === undefined || variant.universalTokenId !== null) throw new Error('Creator fixture did not return an unattached mint SKU.');
  await catalog(live, ['products', 'publish', '--product-id', product.id]);
  return variant.sku;
}

export function createCreatorVariantClient(live: LiveFixture): RareClient {
  const apiBaseUrl = live.accountApiBaseUrl;
  if (apiBaseUrl === undefined) throw new Error('Cart creator fixture requires an authenticated API deployment.');
  return createRareClient({ publicClient: live.publicClient, apiBaseUrl,
    sessionStore: createAuthStore({ apiBaseUrl, authBaseUrl: `${apiBaseUrl}/auth/v2`,
      clientId: 'rare-sdk', backend: 'file', directory: join(live.sellerHome, 'auth') }),
  });
}

async function catalog<T = unknown>(live: LiveFixture, arguments_: string[], input?: unknown): Promise<T> {
  if (live.accountApiBaseUrl === undefined) throw new Error('Catalog commands need the test API deployment.');
  const path = join(live.tempDir, `catalog-${randomUUID()}.json`);
  if (input !== undefined) await writeFile(path, JSON.stringify(input));
  return jsonCommand<T>(live.sellerHome, ['cart', 'catalog', ...arguments_,
    ...(input === undefined ? [] : ['--input', path]), '--api-url', live.accountApiBaseUrl,
    '--storage', 'file', '--auth-directory', join(live.sellerHome, 'auth'), '--chain', live.chain]);
}
