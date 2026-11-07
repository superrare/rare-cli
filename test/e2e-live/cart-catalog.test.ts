import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CartApiProduct, CartProductSearchResult, CartVariantSearchResult } from '@rareprotocol/rare-sdk';
import { cleanupLiveFixture, createCartLiveFixture, jsonCommand } from './helpers/live-harness.js';

describe('published Cart product and variant discovery through the built CLI', () => {
  it('keeps drafts private, paginates published products and variants, and removes archived products', async () => {
    const fixture = await createCartLiveFixture();
    const products: CartApiProduct[] = [];
    const runId = `cli-catalog-${randomUUID()}`;
    const input = async (name: string, value: unknown): Promise<string> => {
      const file = join(fixture.tempDir, `${name}.json`);
      await writeFile(file, JSON.stringify(value));
      return file;
    };
    try {
      for (const suffix of ['first', 'second', 'private']) {
        const product = await jsonCommand<CartApiProduct>(fixture.sellerHome, [
          'cart', 'catalog', 'products', 'create', '--input',
          await input(suffix, { slug: `${runId}-${suffix}`, metadata: { title: `${runId} ${suffix}` } }),
        ]);
        // This is test cleanup bookkeeping, not application domain state.
        // eslint-disable-next-line functional/immutable-data
        products.push(product);
        const configured = await jsonCommand<CartApiProduct>(fixture.sellerHome, [
          'cart', 'catalog', 'variants', 'add', '--product-id', product.id, '--input',
          await input(`${suffix}-variants`, { variants: [
            { metadata: { title: `${runId} small` } }, { metadata: { title: `${runId} large` } },
          ] }),
        ]);
        expect(configured.variants).toHaveLength(2);
        expect(await jsonCommand<CartVariantSearchResult>(fixture.sellerHome, [
          'cart', 'catalog', 'variants', 'search', '--product-id', product.id,
        ])).toMatchObject({ data: [] });
      }
      const [first, second, draft] = products;
      if (!first || !second || !draft) throw new Error('Catalog fixture requires three products.');
      const search = (page: number): Promise<CartProductSearchResult> => jsonCommand(fixture.sellerHome, [
        'cart', 'catalog', 'products', 'search', '--query', runId, '--page', String(page), '--per-page', '1',
      ]);
      expect(await search(1)).toMatchObject({ data: [] });
      for (const product of [first, second]) {
        await jsonCommand(fixture.sellerHome, ['cart', 'catalog', 'products', 'publish', '--product-id', product.id]);
      }
      expect(await search(1)).toMatchObject({ data: [{ id: first.id }], pagination: { page: 1, perPage: 1, hasNextPage: true } });
      expect(await search(2)).toMatchObject({ data: [{ id: second.id }], pagination: { page: 2, perPage: 1, hasNextPage: false } });
      const variants = (page: number): Promise<CartVariantSearchResult> => jsonCommand(fixture.sellerHome, [
        'cart', 'catalog', 'variants', 'search', '--product-id', first.id, '--page', String(page), '--per-page', '1',
      ]);
      const firstPage = await variants(1);
      const secondPage = await variants(2);
      expect(firstPage.pagination).toEqual({ page: 1, perPage: 1, hasNextPage: true });
      expect(secondPage.pagination).toEqual({ page: 2, perPage: 1, hasNextPage: false });
      const [firstVariant] = firstPage.data;
      const [secondVariant] = secondPage.data;
      if (!firstVariant || !secondVariant) throw new Error('Published variants were not discoverable.');
      expect(firstVariant.sku).not.toBe(secondVariant.sku);
      expect(await jsonCommand<CartVariantSearchResult>(fixture.sellerHome, [
        'cart', 'catalog', 'variants', 'search', '--product-id', first.id, '--sku', firstVariant.sku,
      ])).toMatchObject({ data: [{ sku: firstVariant.sku }] });
      expect(await jsonCommand<CartProductSearchResult>(fixture.sellerHome, [
        'cart', 'catalog', 'products', 'search', '--id', draft.id,
      ])).toMatchObject({ data: [] });
      await jsonCommand(fixture.sellerHome, ['cart', 'catalog', 'products', 'archive', '--product-id', first.id]);
      expect(await search(1)).toMatchObject({ data: [{ id: second.id }], pagination: { hasNextPage: false } });
      expect(await jsonCommand<CartVariantSearchResult>(fixture.sellerHome, [
        'cart', 'catalog', 'variants', 'search', '--product-id', first.id,
      ])).toMatchObject({ data: [] });
    } finally {
      try {
        for (const product of products) {
          await jsonCommand(fixture.sellerHome, ['cart', 'catalog', 'products', 'archive', '--product-id', product.id]);
        }
      } finally {
        await cleanupLiveFixture(fixture);
      }
    }
  }, 300_000);
});
