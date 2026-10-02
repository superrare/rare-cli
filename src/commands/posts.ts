import { getActiveChain } from '../config.js';
import { getPublicClient } from '../client.js';
import { readFile } from 'node:fs/promises';
import { Command, Option } from 'commander';
import { createRareClient } from '@rareprotocol/rare-sdk';
import { DEFAULT_RARE_API_BASE_URL } from '@rareprotocol/rare-sdk/data-access/base-url';
import { accountClient, accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { output } from '../output.js';
import { selectUser, type UserOptions } from './user-core.js';

type PageOptions = { page: string; perPage: string };
type BodyOptions = { body?: string; bodyFile?: string };
const publicPosts = (apiUrl: string): ReturnType<typeof createRareClient>['posts'] => createRareClient({ publicClient: getPublicClient(getActiveChain()), apiBaseUrl: apiUrl }).posts;
const publicCommand = (name: string): Command => new Command(name).addOption(new Option('--api-url <url>', 'Rare API base URL').default(DEFAULT_RARE_API_BASE_URL).env('RARE_API_URL'));
const pageOptions = (command: Command): Command => command.option('--page <number>', 'page number', '1').option('--per-page <number>', 'items per page, up to 100', '20');
const bodyOptions = (command: Command): Command => command.addOption(new Option('--body <text>', 'Markdown text').conflicts('bodyFile')).addOption(new Option('--body-file <path>', 'read Markdown from a UTF-8 file').conflicts('body'));
const bodyText = async (options: BodyOptions): Promise<string> => {
  if (options.bodyFile !== undefined) return readFile(options.bodyFile, 'utf8');
  if (options.body !== undefined) return options.body;
  throw new Error('Supply --body or --body-file.');
};
const print = (value: unknown): void => { output(value, () => { console.log(JSON.stringify(value, null, 2)); }); };

export function postsCommand(): Command {
  const command = new Command('posts').description('Public creator posts, comments and your private favorites');
  command.addCommand(pageOptions(publicCommand('list')).description('List public posts for a user')
    .argument('[address]', 'wallet address, or use one selector flag').option('--address <value>', 'wallet address').option('--username <value>', 'SuperRare username').option('--user-id <value>', 'SuperRare user ID')
    .action(async (address: string | undefined, options: UserOptions & PageOptions & { apiUrl: string }): Promise<void> => {
      print(await publicPosts(options.apiUrl).list(selectUser(address, options), { page: Number(options.page), perPage: Number(options.perPage) }));
    }));
  command.addCommand(publicCommand('get').description('Read a public post, including its favorite count').argument('<post-id>')
    .action(async (postId: string, options: { apiUrl: string }): Promise<void> => { print(await publicPosts(options.apiUrl).get(postId)); }));
  command.addCommand(pageOptions(publicCommand('comments')).description('List comments on a public post').argument('<post-id>')
    .action(async (postId: string, options: PageOptions & { apiUrl: string }): Promise<void> => { print(await publicPosts(options.apiUrl).comments(postId, { page: Number(options.page), perPage: Number(options.perPage) })); }));
  command.addCommand(bodyOptions(accountCommand('create')).description('Create a post with your signed-in account').requiredOption('--title <text>', 'post title')
    .option('--image-url <url>', 'image URL from the shared uploader; repeat up to five times', (value: string, previous: string[]) => [...previous, value], [])
    .action(async (options: AccountCommandOptions & BodyOptions & { title: string; imageUrl: string[] }): Promise<void> => {
      const body = await bodyText(options);
      print(await accountClient(storageOptions(options)).posts.create({ title: options.title, body, imageUrls: options.imageUrl }));
    }));
  command.addCommand(bodyOptions(accountCommand('comment')).description('Comment on any public post').argument('<post-id>')
    .action(async (postId: string, options: AccountCommandOptions & BodyOptions): Promise<void> => { const body = await bodyText(options); print(await accountClient(storageOptions(options)).posts.comment(postId, body)); }));
  command.addCommand(accountCommand('delete').description('Delete your own post').argument('<post-id>')
    .action(async (postId: string, options: AccountCommandOptions): Promise<void> => { await accountClient(storageOptions(options)).posts.delete(postId); print({ deleted: true }); }));
  command.addCommand(accountCommand('delete-comment').description('Delete your own comment').argument('<post-id>').argument('<comment-id>')
    .action(async (postId: string, commentId: string, options: AccountCommandOptions): Promise<void> => { await accountClient(storageOptions(options)).posts.deleteComment(postId, commentId); print({ deleted: true }); }));
  const favorites = new Command('favorites').description('Manage your private post favorites');
  favorites.addCommand(pageOptions(accountCommand('list')).description('List your favorite posts, newest first')
    .action(async (options: AccountCommandOptions & PageOptions): Promise<void> => { print(await accountClient(storageOptions(options)).postFavorites.list({ page: Number(options.page), perPage: Number(options.perPage) })); }));
  for (const name of ['add', 'remove', 'status']) favorites.addCommand(accountCommand(name).argument('<post-id>')
    .action(async (postId: string, options: AccountCommandOptions): Promise<void> => {
      const client = accountClient(storageOptions(options)).postFavorites;
      if (name === 'status') print({ favorited: await client.has(postId) });
      else { await (name === 'add' ? client.add(postId) : client.remove(postId)); print({ favorited: name === 'add' }); }
    }));
  command.addCommand(favorites);
  return command;
}
