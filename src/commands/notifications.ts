import { Command } from 'commander';
import { accountClient, accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { output } from '../output.js';

const print = (value: unknown): void => { output(value, () => { console.log(JSON.stringify(value, null, 2)); }); };
const client = (options: AccountCommandOptions): ReturnType<typeof accountClient>['notifications'] => accountClient(storageOptions(options)).notifications;
export function notificationsCommand(): Command {
  const command = new Command('notifications').description('Your delivered notification inbox');
  command.addCommand(accountCommand('list').option('--page <number>', 'page number, starting at 1').option('--per-page <number>', 'entries per page, 1 to 100').action(async (options: AccountCommandOptions & { page?: string; perPage?: string }) => {
    print(await client(options).list({ ...(options.page === undefined ? {} : { page: Number(options.page) }), ...(options.perPage === undefined ? {} : { perPage: Number(options.perPage) }) }));
  }));
  command.addCommand(accountCommand('unread-count').action(async (options: AccountCommandOptions) => { print({ unreadCount: await client(options).unreadCount() }); }));
  command.addCommand(accountCommand('read').argument('<notification-id>').description('Mark an inbox entry read; conversation read state is separate').action(async (id: string, options: AccountCommandOptions) => { print(await client(options).markRead(id)); }));
  command.addCommand(accountCommand('read-all').description('Mark all delivered inbox entries read').action(async (options: AccountCommandOptions) => { print(await client(options).markAllRead()); }));
  return command;
}
