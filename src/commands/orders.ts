import { Command } from 'commander';
import { z } from 'zod';
import { accountClient, accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { outputJson } from '../output.js';
import { parseCartBytes32, unwrapCartCliResult } from './cart-core.js';

export function ordersCommand(): Command {
  const command = new Command('orders').description('Read your private Cart order history and fulfillment status');
  command.addCommand(accountCommand('list').option('--after <id>', 'order pagination cursor')
    .option('--take <number>', 'maximum records', (value: unknown) => z.coerce.number().int().min(1).max(100).parse(value))
    .action(async (options: AccountCommandOptions & { after?: string; take?: number }): Promise<void> => {
      print(await accountClient(storageOptions(options)).cart.orders.list({ after: options.after, take: options.take }));
    }));
  command.addCommand(accountCommand('get').requiredOption('--id <bytes32>', 'Cart order ID, not a fulfillment UUID')
    .action(async (options: AccountCommandOptions & { id: string }): Promise<void> => {
      const id = unwrapCartCliResult(parseCartBytes32(options.id, '--id'));
      print(await accountClient(storageOptions(options)).cart.orders.get(id));
    }));
  return command;
}

function print(value: unknown): void {
  outputJson(value);
}
