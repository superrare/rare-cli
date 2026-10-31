import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import { z } from 'zod';
import { getAddress } from 'viem';
import { createRareClient } from '@rareprotocol/rare-sdk/client';
import type { RareClient } from '@rareprotocol/rare-sdk';
import { accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { createAuthStore } from '../auth-storage.js';
import { getPublicClient } from '../client.js';
import { getActiveChain } from '../config.js';
import { output } from '../output.js';
import { addChainOptions, type ChainOptions } from './options.js';
import { parseCartBytes32, unwrapCartCliResult } from './cart-core.js';

type CatalogOptions = AccountCommandOptions & ChainOptions;
const metadata = z.record(z.string(), z.unknown());
const productInput = z.object({ slug: z.string().nullable().optional(), metadata }).strict();
const variantsInput = z.union([
  z.object({ variants: z.array(z.object({ metadata }).strict()).min(1) }).strict(),
  z.object({ universalTokenIds: z.array(z.string()).min(1) }).strict(),
]);
const skuInput = z.object({ sku: z.string().regex(/^0x[0-9a-fA-F]{64}$/), position: z.number().int().nonnegative(),
  isHidden: z.boolean().optional(), metadata }).strict();
const pageNumber = (value: string): number => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Use a positive integer for pagination.');
  return number;
};
const print = (value: unknown): void => { output(value, () => { console.log(JSON.stringify(value, null, 2)); }); };
const client = (options: CatalogOptions): RareClient => createRareClient({
  publicClient: getPublicClient(getActiveChain(options.chain, options.chainId)), apiBaseUrl: options.apiUrl,
  sessionStore: createAuthStore(storageOptions(options)),
});
const command = (name: string): Command => addChainOptions(accountCommand(name));
const readInput = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'));

export function cartCatalogCommand(): Command {
  const catalog = new Command('catalog').description('Create, group, publish and search Cart products and variants');
  const products = new Command('products');
  products.addCommand(command('create').requiredOption('--input <path>', 'JSON product with metadata and optional slug')
    .option('--idempotency-key <key>', 'reuse the same creation identity when retrying')
    .action(async (options: CatalogOptions & { input: string; idempotencyKey?: string }) => {
      const input = productInput.parse(await readInput(options.input));
      print(await client(options).cart.catalog.products.create(input, { idempotencyKey: options.idempotencyKey }));
    }));
  products.addCommand(command('attach-sku').requiredOption('--product-id <id>', 'product ID')
    .requiredOption('--input <path>', 'JSON SKU association with sku, position and metadata')
    .action(async (options: CatalogOptions & { productId: string; input: string }) => {
      const input = skuInput.parse(await readInput(options.input));
      print(await client(options).cart.catalog.products.attachSku(options.productId, input));
    }));
  products.addCommand(command('publish').requiredOption('--product-id <id>', 'product ID')
    .action(async (options: CatalogOptions & { productId: string }) => { print(await client(options).cart.catalog.products.publish(options.productId)); }));
  products.addCommand(command('get').requiredOption('--product-id <id>', 'published product ID')
    .action(async (options: CatalogOptions & { productId: string }) => { print(await client(options).cart.catalog.products.get(options.productId)); }));
  products.addCommand(command('search').option('--query <text>').option('--id <id>').option('--slug <slug>')
    .option('--creator-user-id <id>').option('--page <number>', 'page starting at 1', pageNumber)
    .option('--per-page <number>', 'results per page, up to 100', pageNumber)
    .action(async (options: CatalogOptions & { query?: string; id?: string; slug?: string; creatorUserId?: string; page?: number; perPage?: number }) => {
      print(await client(options).cart.catalog.products.search({ query: options.query, id: options.id, slug: options.slug,
        creatorUserId: options.creatorUserId, page: options.page, perPage: options.perPage }));
    }));
  const variants = new Command('variants');
  variants.addCommand(command('add').requiredOption('--product-id <id>', 'product ID')
    .requiredOption('--input <path>', 'JSON variants with metadata, or universalTokenIds for NFT attachment')
    .action(async (options: CatalogOptions & { productId: string; input: string }) => {
      const input = variantsInput.parse(await readInput(options.input));
      print(await client(options).cart.catalog.variants.add(options.productId, input));
    }));
  variants.addCommand(command('search').option('--query <text>').option('--sku <bytes32>').option('--product-id <id>')
    .option('--creator-user-id <id>').option('--owner-user-id <id>').option('--nft-contract <address>').option('--nft-token-id <id>')
    .option('--page <number>', 'page starting at 1', pageNumber).option('--per-page <number>', 'results per page, up to 100', pageNumber)
    .action(async (options: CatalogOptions & { query?: string; sku?: string; productId?: string; creatorUserId?: string; ownerUserId?: string;
      nftContract?: string; nftTokenId?: string; page?: number; perPage?: number }) => {
      if ((options.nftContract === undefined) !== (options.nftTokenId === undefined)) throw new Error('Supply both --nft-contract and --nft-token-id.');
      const nft = options.nftContract === undefined || options.nftTokenId === undefined ? undefined
        : { contract: getAddress(options.nftContract), tokenId: options.nftTokenId };
      print(await client(options).cart.catalog.variants.search({ query: options.query,
        ...(options.sku === undefined ? {} : { sku: unwrapCartCliResult(parseCartBytes32(options.sku, '--sku')) }),
        productId: options.productId, creatorUserId: options.creatorUserId, ownerUserId: options.ownerUserId, nft,
        page: options.page, perPage: options.perPage }));
    }));
  catalog.addCommand(products);
  catalog.addCommand(variants);
  return catalog;
}
