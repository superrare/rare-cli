import { Command } from 'commander';
import { z } from 'zod';
import { accountClient, accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { outputJson } from '../output.js';
import { parseCartBytes32, unwrapCartCliResult } from './cart-core.js';

export function ordersCommand(): Command {
  const command = new Command('orders').description('Read your private Cart order history and fulfillment status');
  command.addCommand(accountCommand('list').option('--page <number>', 'page number, starting at 1', (value: unknown) => z.coerce.number().int().positive().parse(value))
    .option('--per-page <number>', 'maximum records per page', (value: unknown) => z.coerce.number().int().min(1).max(100).parse(value))
    .action(async (options: AccountCommandOptions & { page?: number; perPage?: number }): Promise<void> => {
      print(await accountClient(storageOptions(options)).cart.orders.list({ page: options.page, perPage: options.perPage }));
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
