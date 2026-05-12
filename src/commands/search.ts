import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { createRareClient } from '../sdk/client.js';
import type { SupportedChain } from '../contracts/addresses.js';
import type { NftSearchParams } from '../sdk/api.js';
import { parseOptionalAddress } from '../sdk/validation.js';
import { printError } from '../errors.js';
import { output, log, printNftRow, printCollectionRow, printPagination } from '../output.js';

type SearchPageOptions = {
  chain?: string;
  query: string;
  perPage: string;
  page: string;
};

type SearchTokensOptions = SearchPageOptions & {
  owner?: string;
  mine?: boolean;
};

type SearchAuctionsOptions = SearchPageOptions & {
  state: string;
  owner?: string;
};

type SearchCollectionsOptions = SearchPageOptions;

const auctionStates = ['PENDING', 'RUNNING', 'UNSETTLED'] as const;

function parseAuctionState(value: string): NftSearchParams['auctionState'] {
  const state = auctionStates.find((candidate) => candidate === value);
  if (!state) {
    throw new Error(`--state must be one of: ${auctionStates.join(', ')}`);
  }
  return state;
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
    .description('Search NFTs')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--query <text>', 'text search query', '')
    .option('--owner <address>', 'filter by owner address')
    .option('--mine', 'filter by your configured wallet address')
    .option('--per-page <n>', 'number of results per page', '24')
    .option('--page <n>', 'page number', '1')
    .action(async (opts: SearchTokensOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain);
      const rare = createRareClient({ publicClient: getPublicClient(chain) });

      const ownerAddress = opts.mine
        ? getWalletAddress(chain)
        : parseOptionalAddress(opts.owner, '--owner');

      const label = ownerAddress
        ? `NFTs owned by ${ownerAddress}`
        : 'NFTs';

      log(`Searching ${label} on ${chain}...`);

      try {
        const result = await rare.search.nfts({
          query: opts.query,
          perPage: parseInt(opts.perPage, 10),
          page: parseInt(opts.page, 10),
          ownerAddress,
        });

        output(result, () => {
          console.log(`\n${label} (${result.pagination.totalCount} total):`);
          if (result.data.length === 0) {
            console.log('  No results found.');
            return;
          }
          for (const nft of result.data) {
            printNftRow(nft);
          }
          printPagination(result.pagination);
        });
      } catch (error) {
        printError(error);
      }
    });

  // --- rare search auctions ---
  cmd
    .command('auctions')
    .description('List NFTs with active or configured auctions')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--state <state>', 'auction state to filter (PENDING, RUNNING, UNSETTLED)', 'RUNNING')
    .option('--owner <address>', 'filter by owner address (optional)')
    .option('--query <text>', 'text search query', '')
    .option('--per-page <n>', 'number of results per page', '24')
    .option('--page <n>', 'page number', '1')
    .action(async (opts: SearchAuctionsOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain);
      const rare = createRareClient({ publicClient: getPublicClient(chain) });
      const auctionState = parseAuctionState(opts.state);
      const ownerAddress = parseOptionalAddress(opts.owner, '--owner');

      log(`Searching auctions (${auctionState}) on ${chain}...`);

      try {
        const result = await rare.search.nfts({
          query: opts.query,
          perPage: parseInt(opts.perPage, 10),
          page: parseInt(opts.page, 10),
          ownerAddress,
          hasAuction: true,
          auctionState,
        });

        output(result, () => {
          console.log(`\nAuctions — ${auctionState} (${result.pagination.totalCount} total):`);
          if (result.data.length === 0) {
            console.log('  No results found.');
            return;
          }
          for (const nft of result.data) {
            printNftRow(nft);
          }
          printPagination(result.pagination);
        });
      } catch (error) {
        printError(error);
      }
    });

  // --- rare search collections ---
  cmd
    .command('collections')
    .description('List collections')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--query <text>', 'text search query', '')
    .option('--per-page <n>', 'number of results per page', '24')
    .option('--page <n>', 'page number', '1')
    .action(async (opts: SearchCollectionsOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain);
      const rare = createRareClient({ publicClient: getPublicClient(chain) });

      log(`Searching collections on ${chain}...`);

      try {
        const result = await rare.search.collections({
          query: opts.query,
          perPage: parseInt(opts.perPage, 10),
          page: parseInt(opts.page, 10),
        });

        output(result, () => {
          console.log(`\nCollections (${result.pagination.totalCount} total):`);
          if (result.data.length === 0) {
            console.log('  No results found.');
            return;
          }
          for (const col of result.data) {
            printCollectionRow(col);
          }
          printPagination(result.pagination);
        });
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}
