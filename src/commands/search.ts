import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getWalletClient } from '../client.js';
import { searchNfts, searchCollections } from '../search.js';
import type { SupportedChain } from '../contracts/addresses.js';

const CHAIN_IDS: Record<SupportedChain, number> = {
  sepolia: 11155111,
  mainnet: 1,
};

function formatNftRow(item: Record<string, unknown>): string {
  const name = item.name ?? item.tokenName ?? 'Untitled';
  const tokenId = item.universalTokenId ?? item.id ?? '?';
  const contract = item.contractAddress ?? '';
  return `  ${tokenId}  ${name}  ${contract}`;
}

function formatCollectionRow(item: Record<string, unknown>): string {
  const name = item.name ?? item.collectionName ?? 'Unnamed';
  const id = item.id ?? item.collectionId ?? '?';
  const contract = item.contractAddress ?? '';
  return `  ${id}  ${name}  ${contract}`;
}

function printPage(
  label: string,
  items: Record<string, unknown>[],
  total: number,
  hasNextPage: boolean,
  formatRow: (item: Record<string, unknown>) => string,
): void {
  console.log(`\n${label} (${total} total):`);
  if (items.length === 0) {
    console.log('  No results found.');
    return;
  }
  for (const item of items) {
    console.log(formatRow(item));
  }
  if (hasNextPage) {
    console.log(`\n  ... and more. Use --take and --cursor to paginate.`);
  }
}

function getWalletAddress(chain: SupportedChain): string {
  const { account } = getWalletClient(chain);
  return account.address;
}

export function searchCommand(): Command {
  const cmd = new Command('search');
  cmd.description('Search NFTs and collections via the RARE Protocol API');

  // --- rare search tokens ---
  cmd
    .command('tokens')
    .description('List NFTs owned by your wallet')
    .option('--chain <chain>', 'chain to use (sepolia or mainnet)')
    .option('--query <text>', 'text search query', '')
    .option('--take <n>', 'number of results per page', '24')
    .option('--cursor <n>', 'pagination cursor', '0')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const address = getWalletAddress(chain);

      console.log(`Searching NFTs owned by ${address} on ${chain}...`);

      const page = await searchNfts({
        query: opts.query,
        take: parseInt(opts.take, 10),
        cursor: parseInt(opts.cursor, 10),
        ownerAddresses: [address],
        chainIds: [CHAIN_IDS[chain]],
      });

      printPage('Owned NFTs', page.items, page.total, page.hasNextPage, formatNftRow);
    });

  // --- rare search auctions ---
  cmd
    .command('auctions')
    .description('List NFTs with active or configured auctions')
    .option('--chain <chain>', 'chain to use (sepolia or mainnet)')
    .option('--state <states...>', 'auction states to filter (PENDING, RUNNING, SETTLED, UNSETTLED)', ['RUNNING'])
    .option('--owner <address>', 'filter by owner address (defaults to your wallet)')
    .option('--query <text>', 'text search query', '')
    .option('--take <n>', 'number of results per page', '24')
    .option('--cursor <n>', 'pagination cursor', '0')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const ownerAddress = opts.owner ?? getWalletAddress(chain);

      console.log(`Searching auctions (${opts.state.join(', ')}) for ${ownerAddress} on ${chain}...`);

      const page = await searchNfts({
        query: opts.query,
        take: parseInt(opts.take, 10),
        cursor: parseInt(opts.cursor, 10),
        ownerAddresses: [ownerAddress],
        auctionStates: opts.state,
        chainIds: [CHAIN_IDS[chain]],
      });

      printPage(`Auctions (${opts.state.join(', ')})`, page.items, page.total, page.hasNextPage, formatNftRow);
    });

  // --- rare search collections ---
  cmd
    .command('collections')
    .description('List collections owned by your wallet')
    .option('--chain <chain>', 'chain to use (sepolia or mainnet)')
    .option('--query <text>', 'text search query', '')
    .option('--take <n>', 'number of results per page', '24')
    .option('--cursor <n>', 'pagination cursor', '0')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const address = getWalletAddress(chain);

      console.log(`Searching collections owned by ${address}...`);

      const page = await searchCollections({
        query: opts.query,
        take: parseInt(opts.take, 10),
        cursor: parseInt(opts.cursor, 10),
        ownerAddresses: [address],
      });

      printPage('Collections', page.items, page.total, page.hasNextPage, formatCollectionRow);
    });

  return cmd;
}
