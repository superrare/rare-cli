import { Command } from 'commander';
import { accountClient, accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { output } from '../output.js';

export function favoritesCommand(): Command {
  const command = new Command('favorites').description('Manage your private artwork favorites');
  command.addCommand(accountCommand('list').description('List your favorite artworks, newest first')
    .option('--page <number>', 'page number', '1').option('--per-page <number>', 'artworks per page, up to 100', '20')
    .action(async (options: AccountCommandOptions & { page: string; perPage: string }): Promise<void> => {
      const account = accountClient(storageOptions(options));
      const result = await account.favorites.list({ page: Number(options.page), perPage: Number(options.perPage) });
      output(result, () => { console.log(JSON.stringify(result, null, 2)); });
    }));
  for (const name of ['add', 'remove', 'status']) {
    command.addCommand(accountCommand(name).description(name === 'status' ? 'Check whether an artwork is in your favorites' : `${name} an artwork in your favorites`)
      .argument('<universal-token-id>', 'chainId-contractAddress-tokenId')
      .action(async (id: string, options: AccountCommandOptions): Promise<void> => {
        const favorites = accountClient(storageOptions(options)).favorites;
        if (name === 'status') {
          const favorited = await favorites.has(id);
          output({ favorited }, () => { console.log(favorited ? 'Artwork is in your favorites.' : 'Artwork is not in your favorites.'); });
        } else {
          await (name === 'add' ? favorites.add(id) : favorites.remove(id));
          output({ favorited: name === 'add' }, () => { console.log(name === 'add' ? 'Artwork added to favorites.' : 'Artwork removed from favorites.'); });
        }
      }));
  }
  return command;
}
