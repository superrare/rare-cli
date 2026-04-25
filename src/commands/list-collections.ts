import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient } from '../client.js';
import { createRareClient } from '../sdk/client.js';
import type { Collection } from '../sdk/api.js';
import { output, log, printCollection } from '../output.js';

export function listCollectionsCommand(): Command {
  const cmd = new Command('list-collections');
  cmd
    .description('List all collections')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--query <text>', 'text search filter', '')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const rare = createRareClient({ publicClient: getPublicClient(chain) });

      log(`Fetching collections on ${chain}...`);

      const allItems: Collection[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const result = await rare.search.collections({
          query: opts.query,
          perPage: 100,
          page,
        });

        allItems.push(...result.data);
        hasMore = page < result.pagination.totalPages;
        page++;
      }

      output(allItems, () => {
        if (allItems.length === 0) {
          console.log('No collections found.');
          return;
        }

        console.log(`\nFound ${allItems.length} collection(s):`);
        for (const col of allItems) {
          printCollection(col);
        }
      });
    });

  return cmd;
}
