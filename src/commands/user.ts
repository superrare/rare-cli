import { Command } from 'commander';
import { getUser } from '../sdk/api.js';
import { parseAddress } from '../sdk/validation.js';
import { printError } from '../errors.js';
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

      try {
        const result = await getUser(userAddress);
        output(result, () => {
          printUser(result);
        });
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}
