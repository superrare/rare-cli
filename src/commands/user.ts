import { Command, Option } from 'commander';
import { createRareClient, type UserSelector } from '@rareprotocol/rare-sdk';
import { DEFAULT_RARE_API_BASE_URL } from '@rareprotocol/rare-sdk/data-access/base-url';
import { getActiveChain } from '../config.js';
import { getPublicClient } from '../client.js';
import { output, printUser } from '../output.js';
import { accountClient, accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { selectUser, type UserOptions } from './user-core.js';

const selectorOptions = (command: Command): Command => command
  .argument('[address]', 'wallet address, or use one selector flag')
  .option('--address <value>', 'wallet address')
  .option('--username <value>', 'SuperRare username')
  .option('--user-id <value>', 'SuperRare user ID');
const publicCommand = (name: string): Command => selectorOptions(new Command(name))
  .addOption(new Option('--api-url <url>', 'Rare API base URL').default(DEFAULT_RARE_API_BASE_URL).env('RARE_API_URL'));

const publicUser = (apiUrl: string): ReturnType<typeof createRareClient>['user'] => createRareClient({ publicClient: getPublicClient(getActiveChain()), apiBaseUrl: apiUrl }).user;

export function userCommand(): Command {
  const command = new Command('user').description('Public user profiles and follows');
  for (const name of ['get', 'resolve']) {
    command.addCommand(publicCommand(name).description('Get a public profile by username, address or user ID')
      .action(async (address: string | undefined, options: UserOptions & { apiUrl: string }): Promise<void> => {
        const selector = selectUser(address, options);
        const user = publicUser(options.apiUrl);
        const result = await (address === undefined ? user.resolve(selector) : user.get(address));
        output(result, () => { printUser(result); });
      }));
  }
  for (const direction of ['followers', 'following']) {
    command.addCommand(publicCommand(direction).description(`List public ${direction}`)
      .option('--page <number>', 'page number', '1').option('--per-page <number>', 'profiles per page, up to 100', '20')
      .action(async (address: string | undefined, options: UserOptions & { apiUrl: string; page: string; perPage: string }): Promise<void> => {
        const api = publicUser(options.apiUrl);
        const selector: UserSelector = selectUser(address, options);
        const pagination = { page: Number(options.page), perPage: Number(options.perPage) };
        const result = await (direction === 'followers' ? api.followers(selector, pagination) : api.following(selector, pagination));
        output(result, () => { console.log(JSON.stringify(result, null, 2)); });
      }));
  }
  for (const name of ['follow', 'unfollow']) {
    command.addCommand(selectorOptions(accountCommand(name)).description(`${name} another user with your signed-in account`)
      .action(async (address: string | undefined, options: AccountCommandOptions & UserOptions): Promise<void> => {
        const selector = selectUser(address, options);
        const following = accountClient(storageOptions(options)).following;
        await (name === 'follow' ? following.follow(selector) : following.unfollow(selector));
        output({ following: name === 'follow' }, () => { console.log(name === 'follow' ? 'Following user.' : 'Unfollowed user.'); });
      }));
  }
  return command;
}
