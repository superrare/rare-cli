import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import { z } from 'zod';
import { createRareClient } from '@rareprotocol/rare-sdk/client';
import type { RareClient } from '@rareprotocol/rare-sdk';
import { accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { getActiveChain } from '../config.js';
import { createAuthStore } from '../auth-storage.js';
import { output } from '../output.js';
import { formatPrintOutput } from './print-output-core.js';
import { addChainOptions, type ChainOptions } from './options.js';
import { conciergePrintListingInput, parseCommerceUuid, parsePrintPrice, printDraftPatch, printDropInput, printListingInput, printQuoteInput } from './print-input-core.js';

type PrintOptions = AccountCommandOptions & ChainOptions;
type IdentityOptions = PrintOptions & { id: string };
type InputOptions = PrintOptions & { input: string };
type FileToolOptions = PrintOptions & { productionUploadKey: string; specificationId: string };

function command(name: string): Command {
  return addChainOptions(accountCommand(name));
}

export function printsCommand(): Command {
  const prints = new Command('prints').description('Create and publish print editions through Rare API');
  const products = new Command('products').description('Read supported print products and recommended artwork dimensions');
  products.addCommand(command('list').description('List available paper and size presets')
    .action(async (options: PrintOptions): Promise<void> => { print(await client(options).prints.products.list()); }));
  products.addCommand(command('get').description('Read a print product')
    .requiredOption('--id <productId>', 'canonical print product ID, such as GLOBAL-FAP-8X12')
    .action(async (options: IdentityOptions): Promise<void> => { print(await client(options).prints.products.get(options.id)); }));
  prints.addCommand(products);
  const files = new Command('files').description('Check private production files against a print product');
  files.addCommand(command('validate').description('Validate an uploaded production file for a print size')
    .requiredOption('--production-upload-key <key>', 'owned private upload key')
    .requiredOption('--specification-id <id>', 'print product ID, such as GLOBAL-FAP-8X12')
    .action(async (options: FileToolOptions): Promise<void> => {
      print(await client(options).prints.files.validate({ productionUploadKey: options.productionUploadKey, specificationId: options.specificationId }));
    }));
  prints.addCommand(files);
  const mockups = new Command('mockups').description('Generate and read private print previews');
  mockups.addCommand(command('create').description('Create a preview from an uploaded production file')
    .requiredOption('--production-upload-key <key>', 'owned private upload key')
    .requiredOption('--specification-id <id>', 'print product ID, such as GLOBAL-FAP-8X12')
    .action(async (options: FileToolOptions): Promise<void> => {
      print(await client(options).prints.mockups.create({ productionUploadKey: options.productionUploadKey, specificationId: options.specificationId }));
    }));
  mockups.addCommand(command('get').description('Read the status and image of an account-owned preview')
    .requiredOption('--id <uuid>', 'preview job ID')
    .action(async (options: IdentityOptions): Promise<void> => {
      print(await client(options).prints.mockups.get(parseCommerceUuid(options.id)));
    }));
  prints.addCommand(mockups);
  prints.addCommand(command('quote').description('Quote production and shipping without creating a listing or order')
    .requiredOption('--input <path>', 'JSON specificationId, destinationCountryCode, optional copies and shippingMethod')
    .action(async (options: InputOptions): Promise<void> => {
      const input: unknown = JSON.parse(await readFile(options.input, 'utf8'));
      print(await client(options).prints.quote(printQuoteInput.parse(input)));
    }));
  prints.addCommand(command('get').description('Read a public print edition')
    .requiredOption('--id <uuid>', 'print drop ID')
    .action(async (options: IdentityOptions): Promise<void> => { print(await client(options).prints.drops.get(parseCommerceUuid(options.id))); }));
  prints.addCommand(command('activity').requiredOption('--id <uuid>', 'print drop ID')
    .option('--page <number>', 'page number, starting at 1', (value: unknown) => z.coerce.number().int().positive().parse(value))
    .option('--per-page <number>', 'maximum records per page', (value: unknown) => z.coerce.number().int().min(1).max(100).parse(value))
    .action(async (options: IdentityOptions & { page?: number; perPage?: number }): Promise<void> => {
      print(await client(options).prints.drops.activity(parseCommerceUuid(options.id), { page: options.page, perPage: options.perPage }));
    }));
  prints.addCommand(command('releases').requiredOption('--universal-token-id <id>', 'linked NFT universal token ID')
    .action(async (options: PrintOptions & { universalTokenId: string }): Promise<void> => {
      print(await client(options).prints.releases.list({ universalTokenId: options.universalTokenId }));
    }));

  const concierge = new Command('concierge').description('Set up prints on behalf of a creator');
  concierge.addCommand(command('create').requiredOption('--input <path>', 'JSON creatorUserId, drop, displayPriceUsdCents and optional listing terms')
    .action(async (options: InputOptions): Promise<void> => {
      const input: unknown = JSON.parse(await readFile(options.input, 'utf8'));
      const setup = z.object({
        creatorUserId: z.string().regex(/^[1-9][0-9]{0,18}$/u),
        drop: printDropInput,
        listing: conciergePrintListingInput.optional(),
        displayPriceUsdCents: z.string(),
      }).strict().parse(input);
      print(await client(options).prints.concierge.createDraft({
        ...setup, displayPriceUsdCents: parsePrintPrice(setup.displayPriceUsdCents),
      }));
    }));
  prints.addCommand(concierge);

  const drops = new Command('drops').description('Manage your creator print drafts');
  drops.addCommand(command('create').requiredOption('--input <path>', 'JSON draft with chainId, optional productId, and print details: private productionUploadKey, public images and specificationId')
    .action(async (options: InputOptions): Promise<void> => {
      const input: unknown = JSON.parse(await readFile(options.input, 'utf8'));
      print(await client(options).prints.drops.create(printDropInput.parse(input)));
    }));
  drops.addCommand(command('update').requiredOption('--id <uuid>', 'owned drop ID')
    .requiredOption('--input <path>', 'JSON patch; replace productionUploadKey even after publication; specification changes require an unconfigured draft')
    .action(async (options: InputOptions & { id: string }): Promise<void> => {
      const id = parseCommerceUuid(options.id);
      const input: unknown = JSON.parse(await readFile(options.input, 'utf8'));
      print(await client(options).prints.drops.update(id, printDraftPatch.parse(input)));
    }));
  drops.addCommand(command('list').option('--page <number>', 'page number, starting at 1', (value: unknown) => z.coerce.number().int().positive().parse(value))
    .option('--per-page <number>', 'maximum records per page', (value: unknown) => z.coerce.number().int().min(1).max(100).parse(value))
    .action(async (options: PrintOptions & { page?: number; perPage?: number }): Promise<void> => {
      print(await client(options).prints.drops.listMine({ page: options.page, perPage: options.perPage }));
    }));
  drops.addCommand(command('get').requiredOption('--id <uuid>', 'owned drop ID')
    .action(async (options: IdentityOptions): Promise<void> => { print(await client(options).prints.drops.getMine(parseCommerceUuid(options.id))); }));
  drops.addCommand(command('archive').requiredOption('--id <uuid>', 'owned drop ID')
    .action(async (options: IdentityOptions): Promise<void> => { print(await client(options).prints.drops.archive(parseCommerceUuid(options.id))); }));
  drops.addCommand(command('configure').requiredOption('--id <uuid>', 'owned drop ID')
    .requiredOption('--price-usd-cents <amount>', 'collector price, in integer USD cents; Listings settle in USDC')
    .action(async (options: IdentityOptions & { priceUsdCents: string }): Promise<void> => {
      const displayPriceUsdCents = parsePrintPrice(options.priceUsdCents);
      const rare = client(options);
      const dropId = parseCommerceUuid(options.id);
      print(await rare.prints.options.configure({ dropId, input: { displayPriceUsdCents } }));
    }));
  prints.addCommand(drops);

  const listings = new Command('listing').description('Prepare and publish print Listing terms');
  listings.addCommand(command('prepare').requiredOption('--input <path>', 'JSON listing terms, including optional eligibilityRuleId, maxQuantityPerCheckout, splits and mintSource')
    .action(async (options: InputOptions): Promise<void> => {
      const input: unknown = JSON.parse(await readFile(options.input, 'utf8'));
      print(await client(options).prints.listings.prepare(printListingInput.parse(input)));
    }));
  listings.addCommand(command('publish').requiredOption('--input <path>', 'JSON listing terms or an array of up to 100 print offers to sign together')
    .option('--yes', 'proceed through all required signing and publication steps')
    .action(async (options: InputOptions): Promise<void> => {
      const input: unknown = JSON.parse(await readFile(options.input, 'utf8'));
      const inputs: unknown = Array.isArray(input) ? input : [input];
      const terms = z.array(printListingInput).min(1).max(100).parse(inputs);
      const rare = client(options, true);
      const preparations = await Promise.all(terms.map(async (item) => rare.prints.listings.prepare(item)));
      print(await rare.cart.listing.publish({ printPreparations: preparations }));
    }));
  prints.addCommand(listings);
  return prints;
}

function client(options: PrintOptions, signing = false): RareClient {
  const chain = getActiveChain(options.chain, options.chainId);
  const wallet = signing ? getWalletClient(chain) : undefined;
  return createRareClient({ publicClient: getPublicClient(chain), apiBaseUrl: options.apiUrl,
    sessionStore: createAuthStore(storageOptions(options)),
    ...(wallet === undefined ? {} : { walletClient: wallet.client, account: wallet.account.address }),
  });
}

function print(value: unknown): void {
  output(value, () => {
    for (const line of formatPrintOutput(value)) console.log(line);
  });
}
