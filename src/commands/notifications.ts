import { Command } from 'commander';
import { accountClient, accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { output } from '../output.js';

const print = (value: unknown): void => { output(value, () => { console.log(JSON.stringify(value, null, 2)); }); };
const client = (options: AccountCommandOptions): ReturnType<typeof accountClient>['notifications'] => accountClient(storageOptions(options)).notifications;
export function notificationsCommand(): Command {
  const command = new Command('notifications').description('Your delivered notification inbox');
  command.addCommand(accountCommand('list').option('--cursor <value>', 'cursor returned by the previous page').option('--limit <number>', 'entries per page, 1 to 50').action(async (options: AccountCommandOptions & { cursor?: string; limit?: string }) => {
    print(await client(options).list({ cursor: options.cursor, ...(options.limit === undefined ? {} : { limit: Number(options.limit) }) }));
  }));
  command.addCommand(accountCommand('unread-count').action(async (options: AccountCommandOptions) => { print({ unreadCount: await client(options).unreadCount() }); }));
  command.addCommand(accountCommand('read').argument('<notification-id>').description('Mark an inbox entry read; conversation read state is separate').action(async (id: string, options: AccountCommandOptions) => { print(await client(options).markRead(id)); }));
  command.addCommand(accountCommand('read-all').description('Mark all delivered inbox entries read').action(async (options: AccountCommandOptions) => { print(await client(options).markAllRead()); }));
  return command;
}
