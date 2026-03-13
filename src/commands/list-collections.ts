import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getWalletClient } from '../client.js';
import { searchCollections } from '../search.js';
import type { SupportedChain } from '../contracts/addresses.js';

function getWalletAddress(chain: SupportedChain): string {
  const { account } = getWalletClient(chain);
  return account.address;
}

export function listCollectionsCommand(): Command {
  const cmd = new Command('list-collections');
  cmd
    .description('List all collections owned by your wallet')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--query <text>', 'text search filter', '')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const address = getWalletAddress(chain);

      console.log(`Fetching collections for ${address} on ${chain}...\n`);

      const allItems: Record<string, unknown>[] = [];
      let cursor = 0;
      let hasMore = true;

      while (hasMore) {
        const page = await searchCollections({
          query: opts.query,
          take: 100,
          cursor,
          ownerAddresses: [address],
        });

        allItems.push(...page.items);
        hasMore = page.hasNextPage;
        cursor = page.nextCursor;
      }

      if (allItems.length === 0) {
        console.log('No collections found.');
        return;
      }

      console.log(`Found ${allItems.length} collection(s):\n`);

      for (const item of allItems) {
        const name = item.name ?? item.collectionName ?? 'Unnamed';
        const contract = item.contractAddress ?? '';
        const id = item.id ?? item.collectionId ?? '';
        console.log(`  ${name}`);
        if (contract) console.log(`    Contract: ${contract}`);
        if (id) console.log(`    ID:       ${id}`);
        console.log('');
      }
    });

  return cmd;
}
