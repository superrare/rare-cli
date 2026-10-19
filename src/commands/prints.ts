import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import { z } from 'zod';
import { createRareClient } from '@rareprotocol/rare-sdk/client';
import type { RareClient } from '@rareprotocol/rare-sdk';
import { accountClient, accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { getActiveChain } from '../config.js';
import { output } from '../output.js';
import { addChainOptions, type ChainOptions } from './options.js';
import { parseCommerceUuid, parsePrintPrice, printDraftPatch, printDropInput, printListingInput } from './print-input-core.js';

type PrintOptions = AccountCommandOptions & ChainOptions;
type IdentityOptions = PrintOptions & { id: string };
type InputOptions = PrintOptions & { input: string };

function command(name: string): Command {
  return addChainOptions(accountCommand(name));
}

export function printsCommand(): Command {
  const prints = new Command('prints').description('Create and publish print editions through Rare API');
  prints.addCommand(command('specifications').description('List supported creator-facing paper and size choices')
    .action(async (options: PrintOptions): Promise<void> => { print(await client(options).prints.specifications.list()); }));
  prints.addCommand(command('get').description('Read a public print edition')
    .requiredOption('--id <uuid>', 'print drop ID')
    .action(async (options: IdentityOptions): Promise<void> => { print(await client(options).prints.drops.get(parseCommerceUuid(options.id))); }));
  prints.addCommand(command('activity').requiredOption('--id <uuid>', 'print drop ID')
    .option('--after <id>', 'activity pagination cursor')
    .action(async (options: IdentityOptions & { after?: string }): Promise<void> => {
      print(await client(options).prints.drops.activity(parseCommerceUuid(options.id), { after: options.after }));
    }));
  prints.addCommand(command('releases').requiredOption('--universal-token-id <id>', 'linked NFT universal token ID')
    .action(async (options: PrintOptions & { universalTokenId: string }): Promise<void> => {
      print(await client(options).prints.releases.list({ universalTokenId: options.universalTokenId }));
    }));

  const drops = new Command('drops').description('Manage your creator print drafts');
  drops.addCommand(command('create').requiredOption('--input <path>', 'JSON draft with private productionUploadKey and public images')
    .action(async (options: InputOptions): Promise<void> => {
      const input: unknown = JSON.parse(await readFile(options.input, 'utf8'));
      print(await client(options).prints.drops.create(printDropInput.parse(input)));
    }));
  drops.addCommand(command('update').requiredOption('--id <uuid>', 'owned drop ID')
    .requiredOption('--input <path>', 'JSON patch; published production changes require a new draft')
    .action(async (options: InputOptions & { id: string }): Promise<void> => {
      const id = parseCommerceUuid(options.id);
      const input: unknown = JSON.parse(await readFile(options.input, 'utf8'));
      print(await client(options).prints.drops.update(id, printDraftPatch.parse(input)));
    }));
  drops.addCommand(command('list').option('--after <uuid>', 'pagination cursor')
    .option('--take <number>', 'maximum records', (value: unknown) => z.coerce.number().int().min(1).max(100).parse(value))
    .action(async (options: PrintOptions & { after?: string; take?: number }): Promise<void> => {
      print(await client(options).prints.drops.listMine({ after: options.after, take: options.take }));
    }));
  drops.addCommand(command('get').requiredOption('--id <uuid>', 'owned drop ID')
    .action(async (options: IdentityOptions): Promise<void> => { print(await client(options).prints.drops.getMine(parseCommerceUuid(options.id))); }));
  drops.addCommand(command('archive').requiredOption('--id <uuid>', 'owned drop ID')
    .action(async (options: IdentityOptions): Promise<void> => { print(await client(options).prints.drops.archive(parseCommerceUuid(options.id))); }));
  drops.addCommand(command('configure').requiredOption('--id <uuid>', 'owned drop ID')
    .requiredOption('--price-usd-cents <amount>', 'collector price, in integer USD cents; Listings settle in USDC')
    .action(async (options: IdentityOptions & { priceUsdCents: string }): Promise<void> => {
      const displayPriceUsdCents = parsePrintPrice(options.priceUsdCents);
      print(await client(options).prints.options.configure(parseCommerceUuid(options.id), { displayPriceUsdCents }));
    }));
  prints.addCommand(drops);

  const listings = new Command('listing').description('Prepare and publish print Listing terms');
  listings.addCommand(command('prepare').requiredOption('--input <path>', 'JSON listing terms')
    .action(async (options: InputOptions): Promise<void> => {
      const input: unknown = JSON.parse(await readFile(options.input, 'utf8'));
      print(await client(options).prints.listings.prepare(printListingInput.parse(input)));
    }));
  listings.addCommand(command('publish').requiredOption('--input <path>', 'JSON listing terms to prepare, sign and publish')
    .option('--yes', 'authorize signing and publishing these print Listing terms')
    .action(async (options: InputOptions): Promise<void> => {
      const input: unknown = JSON.parse(await readFile(options.input, 'utf8'));
      const parsed = printListingInput.parse(input);
      const rare = client(options, true);
      const preparation = await rare.prints.listings.prepare(parsed);
      print(await rare.prints.listings.signAndPublish(preparation));
    }));
  prints.addCommand(listings);
  return prints;
}

function client(options: PrintOptions, signing = false): RareClient {
  const chain = getActiveChain(options.chain, options.chainId);
  const wallet = signing ? getWalletClient(chain) : undefined;
  return createRareClient({ publicClient: getPublicClient(chain), apiBaseUrl: options.apiUrl,
    accountClient: accountClient(storageOptions(options)),
    ...(wallet === undefined ? {} : { walletClient: wallet.client, account: wallet.account.address }),
  });
}

function print(value: unknown): void {
  output(value, () => { console.log(JSON.stringify(value, null, 2)); });
}
