import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient } from '../client.js';
import { createRareClient } from '../sdk/client.js';
import type { RareClient } from '../sdk/types.js';
import type { Collection } from '../sdk/api.js';
import { printError } from '../errors.js';
import { output, log, printCollection } from '../output.js';

type ListCollectionsOptions = {
  chain?: string;
  chainId?: string;
  query: string;
};

export function listCollectionsCommand(): Command {
  const cmd = new Command('list-collections');
  cmd
    .description('List all collections')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .option('--query <text>', 'text search filter', '')
    .action(async (opts: ListCollectionsOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const rare = createRareClient({ publicClient: getPublicClient(chain) });

      log(`Fetching collections on ${chain}...`);

      try {
        const allItems = await fetchCollections(rare, opts.query);

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
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

async function fetchCollections(
  rare: RareClient,
  query: string,
  page = 1,
  collected: Collection[] = [],
): Promise<Collection[]> {
  const result = await rare.search.collections({
    query,
    perPage: 100,
    page,
  });
  const nextItems = [...collected, ...result.data];

  return page >= result.pagination.totalPages
    ? nextItems
    : fetchCollections(rare, query, page + 1, nextItems);
}
