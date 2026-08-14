import { Command } from 'commander';
import { getPublicClient } from '../client.js';
import { getActiveChain } from '../config.js';
import { createRareClient } from '@rareprotocol/rare-sdk/client';
import { parseAddress } from '../input-core.js';
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

      const chain = getActiveChain();
      const result = await createRareClient({ publicClient: getPublicClient(chain) }).user.get(userAddress);
      output(result, () => {
        printUser(result);
      });

    });

  return cmd;
}
