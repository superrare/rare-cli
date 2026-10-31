import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import { accountClient, accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { outputJson } from '../output.js';
import { parseCommerceUuid, savedShippingInput } from './print-input-core.js';

export function shippingCommand(): Command {
  const command = new Command('shipping').description('Manage private account shipping addresses');
  command.addCommand(accountCommand('list').action(async (options: AccountCommandOptions): Promise<void> => {
    print(await accountClient(storageOptions(options)).shippingAddresses.list());
  }));
  command.addCommand(accountCommand('save')
    .description('Save an address from JSON; use makeDefault to select the account default')
    .requiredOption('--input <path>', 'JSON address file, including a stable UUID id')
    .action(async (options: AccountCommandOptions & { input: string }): Promise<void> => {
      const value: unknown = JSON.parse(await readFile(options.input, 'utf8'));
      const input = savedShippingInput.parse(value);
      print(await accountClient(storageOptions(options)).shippingAddresses.save(input));
    }));
  command.addCommand(accountCommand('delete').requiredOption('--id <uuid>', 'saved address ID')
    .action(async (options: AccountCommandOptions & { id: string }): Promise<void> => {
      const id = parseCommerceUuid(options.id);
      await accountClient(storageOptions(options)).shippingAddresses.delete(id);
      print({ id, deleted: true });
    }));
  return command;
}

function print(value: unknown): void {
  outputJson(value);
}
