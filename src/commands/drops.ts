import { Command, Option } from 'commander';
import { createRareClient, type DropType, type UpdateDropInput, type RareClient } from '@rareprotocol/rare-sdk';
import { DEFAULT_RARE_API_BASE_URL } from '@rareprotocol/rare-sdk/data-access/base-url';
import { getActiveChain } from '../config.js';
import { getPublicClient } from '../client.js';
import { accountClient, accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { output } from '../output.js';
import { selectUser, type UserOptions } from './user-core.js';

type DropOptions = { type?: DropType; startsAt?: string; headline?: string; description?: string; destinationUrl?: string; imageUrl?: string };
const types = ['NONE', 'SINGLE_ARTWORK', 'EDITION', 'RELEASE', 'LIQUID_EDITION'];
const publicCommand = (name: string): Command => new Command(name).addOption(new Option('--api-url <url>', 'Rare API base URL').default(DEFAULT_RARE_API_BASE_URL).env('RARE_API_URL'));
const publicDrops = (apiUrl: string): RareClient['drops'] => createRareClient({ publicClient: getPublicClient(getActiveChain()), apiBaseUrl: apiUrl }).drops;
const print = (value: unknown): void => { output(value, () => { console.log(JSON.stringify(value, null, 2)); }); };
const fields = (command: Command): Command => command.addOption(new Option('--type <type>', 'announcement type').choices(types))
  .option('--starts-at <timestamp>', 'ISO 8601 launch time, within the next 30 days')
  .option('--headline <text>', 'headline, up to 120 characters')
  .option('--description <text>', 'description, up to 300 characters')
  .option('--destination-url <url>', 'HTTPS destination, or an empty string')
  .option('--image-url <url>', 'image URL returned by the shared uploader');

export function dropsCommand(): Command {
  const command = new Command('drops').description('Browse the public drop calendar and manage your announcements');
  command.addCommand(publicCommand('list').requiredOption('--from <timestamp>', 'inclusive calendar window start, ISO 8601').requiredOption('--to <timestamp>', 'inclusive calendar window end, at most 30 days later')
    .option('--address <address>', 'creator wallet address').option('--username <username>', 'creator username').option('--user-id <id>', 'creator account ID')
    .option('--page <number>', 'page number', '1').option('--per-page <number>', 'items per page, up to 100', '20')
    .addOption(new Option('--type <type>', 'filter announcement type').choices(types))
    .addOption(new Option('--curated <boolean>', 'filter curated announcements').choices(['true', 'false']))
    .addOption(new Option('--featured <boolean>', 'filter featured announcements').choices(['true', 'false']))
    .addOption(new Option('--sort-by <field>', 'sort field').choices(['STARTS_AT', 'CREATED_AT', 'UPDATED_AT']))
    .addOption(new Option('--sort-direction <direction>', 'sort direction').choices(['ASC', 'DESC']))
    .action(async (options: UserOptions & { apiUrl: string; from: string; to: string; page: string; perPage: string; type?: DropType; curated?: 'true' | 'false'; featured?: 'true' | 'false'; sortBy?: 'STARTS_AT' | 'CREATED_AT' | 'UPDATED_AT'; sortDirection?: 'ASC' | 'DESC' }): Promise<void> => {
      const user = [options.address, options.username, options.userId].some(value => value !== undefined) ? selectUser(undefined, options) : undefined;
      print(await publicDrops(options.apiUrl).list({ from: options.from, to: options.to, user, page: Number(options.page), perPage: Number(options.perPage), type: options.type, isCurated: options.curated === undefined ? undefined : options.curated === 'true', isFeatured: options.featured === undefined ? undefined : options.featured === 'true', sortBy: options.sortBy, sortDirection: options.sortDirection }));
    }));
  command.addCommand(publicCommand('get').argument('<drop-id>').description('Read a public announcement')
    .action(async (dropId: string, options: { apiUrl: string }): Promise<void> => { print(await publicDrops(options.apiUrl).get(dropId)); }));
  command.addCommand(fields(accountCommand('create')).description('Create your own drop announcement')
    .action(async (options: AccountCommandOptions & DropOptions): Promise<void> => {
      print(await accountClient(storageOptions(options)).drops.create({ type: options.type ?? 'NONE', startsAt: options.startsAt ?? '', metadata: { headline: options.headline ?? '', description: options.description ?? '', destinationUrl: options.destinationUrl ?? '', imageUrl: options.imageUrl ?? '' } }));
    }));
  command.addCommand(fields(accountCommand('update')).argument('<drop-id>').description('Update supplied fields on your own announcement')
    .action(async (dropId: string, options: AccountCommandOptions & DropOptions): Promise<void> => {
      const patch: UpdateDropInput = { type: options.type, startsAt: options.startsAt, metadata: { headline: options.headline, description: options.description, destinationUrl: options.destinationUrl, imageUrl: options.imageUrl } };
      print(await accountClient(storageOptions(options)).drops.update(dropId, patch));
    }));
  command.addCommand(accountCommand('delete').argument('<drop-id>').description('Delete your own announcement')
    .action(async (dropId: string, options: AccountCommandOptions): Promise<void> => { await accountClient(storageOptions(options)).drops.delete(dropId); print({ deleted: true }); }));
  return command;
}
