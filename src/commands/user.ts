import { Option } from 'commander';
import { createRareClient } from '@rareprotocol/rare-sdk/client';
import { DEFAULT_RARE_API_BASE_URL } from '@rareprotocol/rare-sdk/data-access/base-url';
import { getActiveChain } from '../config.js';
import { getPublicClient } from '../client.js';
import { Command } from 'commander';
import { parseAddress } from '@rareprotocol/rare-sdk/validation';
import { log, output, printUser } from '../output.js';

export function userCommand(): Command {
  const cmd = new Command('user');
  cmd.description('Get RARE Protocol users');

  cmd
    .command('get')
    .description('Get a user by wallet address')
    .argument('<address>', 'wallet address')
    .addOption(new Option('--api-url <url>', 'Rare API base URL').default(DEFAULT_RARE_API_BASE_URL).env('RARE_API_URL'))
    .action(async (address: string, opts: { apiUrl: string }): Promise<void> => {
      const userAddress = parseAddress(address, '<address>');

      log(`Getting user ${userAddress}...`);

      const rare = createRareClient({ publicClient: getPublicClient(getActiveChain()), apiBaseUrl: opts.apiUrl });
      const result = await rare.user.get(userAddress);
      output(result, () => {
        printUser(result);
      });

    });

  cmd.command('resolve').description('Resolve a public profile by username')
    .requiredOption('--username <value>', 'SuperRare username')
    .addOption(new Option('--api-url <url>', 'Rare API base URL').default(DEFAULT_RARE_API_BASE_URL).env('RARE_API_URL'))
    .action(async (opts: { username: string; apiUrl: string }): Promise<void> => {
      const rare = createRareClient({ publicClient: getPublicClient(getActiveChain()), apiBaseUrl: opts.apiUrl });
      const result = await rare.user.resolve({ username: opts.username });
      output(result, () => { printUser(result); });
    });
  return cmd;
}
