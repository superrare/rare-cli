import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createRareAccountClient } from '@rareprotocol/rare-sdk';
import { isHex, type Address, type Hex } from 'viem';
import { z } from 'zod';
import { createAuthStore } from '../../../src/auth-storage.js';
import type { LiveFixture } from './live-harness.js';

const productSchema = z.object({ data: z.object({ id: z.string(), variants: z.array(z.object({
  sku: z.string(), universalTokenId: z.string().nullable(),
})) }) });
const candidatesSchema = z.object({ records: z.array(z.object({ record: z.object({
  universal_token_id: z.string(), contract_address: z.string(),
  token_id: z.string(), chain_id: z.union([z.string(), z.number()]),
}) })), hasNextPage: z.boolean() });

export async function createCreatorVariantSkus(
  live: LiveFixture,
  tokens: readonly { contract: Address; tokenId: string }[],
): Promise<Hex[]> {
  const apiBaseUrl = live.accountApiBaseUrl;
  if (apiBaseUrl === undefined) throw new Error('Cart creator fixture requires an authenticated API deployment.');
  const accountClient = createRareAccountClient({ apiBaseUrl, clientId: 'rare-cli',
    sessionStore: createAuthStore({ apiBaseUrl, authBaseUrl: `${apiBaseUrl}/auth/v2`,
      clientId: 'rare-cli', backend: 'file', directory: join(live.sellerHome, 'auth') }),
  });
  const deadline = Date.now() + 180000;
  const readCandidates = async (page = 1): Promise<z.infer<typeof candidatesSchema>['records']> => {
    const response = await accountClient.authenticatedFetch(new URL(
      `/v1/cart/products/variant-candidates?perPage=100&page=${page}`, apiBaseUrl,
    ));
    if (!response.ok) throw new Error(`Creator candidate lookup failed with ${response.status}.`);
    const payload: unknown = await response.json();
    const candidates = candidatesSchema.parse(payload);
    return candidates.hasNextPage
      ? [...candidates.records, ...await readCandidates(page + 1)] : candidates.records;
  };
  const waitForCandidates = async (): Promise<string[]> => {
    const candidates = await readCandidates();
    const selected = tokens.map(token => candidates.find(({ record }) =>
      String(record.chain_id) === String(live.chainId)
      && record.contract_address.toLowerCase() === token.contract.toLowerCase()
      && record.token_id === token.tokenId)?.record.universal_token_id);
    if (selected.every(identifier => identifier !== undefined)) return selected;
    if (Date.now() >= deadline) {
      throw new Error('Creator variant fixture requires the minted NFTs to be indexed as creations of the authenticated account.');
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
    return waitForCandidates();
  };
  const universalTokenIds = await waitForCandidates();
  const post = async (path: string, body: unknown): Promise<z.infer<typeof productSchema>['data']> => {
    const response = await accountClient.authenticatedFetch(new URL(path, apiBaseUrl), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const failure = z.object({ error: z.string() }).safeParse(payload);
      throw new Error(`Creator variant fixture ${path} failed with ${response.status}: ${failure.success ? failure.data.error : 'unrecognized API error'}.`);
    }
    return productSchema.parse(payload).data;
  };
  const runId = randomUUID();
  const product = await post('/v1/cart/products', {
    slug: `cli-cart-${runId}`, metadata: { title: 'CLI Cart E2E', source: 'rare-cli', runId },
  });
  const attached = await post(`/v1/cart/products/${product.id}/variants`, { universalTokenIds });
  await post(`/v1/cart/products/${product.id}/publish`, {});
  return universalTokenIds.map(universalTokenId => {
    const variant = attached.variants.find(candidate => candidate.universalTokenId === universalTokenId);
    if (variant === undefined || !isHex(variant.sku)) throw new Error('Creator Product did not create its requested SKU.');
    return variant.sku;
  });
}
