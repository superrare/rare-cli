import { Command } from 'commander';
import { getUser } from '@rareprotocol/rare-sdk/api';
import { parseAddress } from '@rareprotocol/rare-sdk/validation';
import { log, output, printUser } from '../output.js';

export function userCommand(): Command {
  const cmd = new Command('user');
  cmd.description('Get RARE Protocol users');

  cmd
    .command('get')
    .description('Get a user by wallet address')
    .argument('<address>', 'wallet address')
    .action(async (address: string): Promise<void> => {
      const userAddress = parseAddress(address, '<address>');

      log(`Getting user ${userAddress}...`);

      const result = await getUser(userAddress);
      output(result, () => {
        printUser(result);
      });

    });

  return cmd;
}
