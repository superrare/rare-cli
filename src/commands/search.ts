import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getWalletClient } from '../client.js';
import { searchNfts, searchCollections } from '../sdk/api.js';
import { chainIds, type SupportedChain } from '../contracts/addresses.js';
import { printError } from '../errors.js';
import { output, log, printNftRow, printCollectionRow, printPagination } from '../output.js';

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
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);

      const ownerAddress = opts.mine
        ? getWalletAddress(chain)
        : opts.owner ?? undefined;

      const label = ownerAddress
        ? `NFTs owned by ${ownerAddress}`
        : 'NFTs';

      log(`Searching ${label} on ${chain}...`);

      try {
        const result = await searchNfts({
          query: opts.query,
          perPage: parseInt(opts.perPage, 10),
          page: parseInt(opts.page, 10),
          ownerAddress,
          chainId: chainIds[chain],
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
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);

      log(`Searching auctions (${opts.state}) on ${chain}...`);

      try {
        const result = await searchNfts({
          query: opts.query,
          perPage: parseInt(opts.perPage, 10),
          page: parseInt(opts.page, 10),
          ownerAddress: opts.owner,
          hasAuction: true,
          auctionState: opts.state,
          chainId: chainIds[chain],
        });

        output(result, () => {
          console.log(`\nAuctions — ${opts.state} (${result.pagination.totalCount} total):`);
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
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);

      log(`Searching collections on ${chain}...`);

      try {
        const result = await searchCollections({
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
