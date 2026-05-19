import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient } from '../client.js';
import { printError } from '../errors.js';
import { createRareClient } from '../sdk/client.js';
import type { Nft } from '../sdk/api.js';
import { parseAddress } from '../sdk/validation.js';
import {
  log,
  output,
  printAuctionMarketRow,
  printCollectionRow,
  printListingMarketRow,
  printOfferMarketRow,
  printPagination,
} from '../output.js';

type AccountListOptions = {
  account: string;
  chain?: string;
  chainId?: string;
  page: string;
  perPage: string;
};

type AccountSideListOptions = AccountListOptions & {
  side: string;
};

type MarketSide = 'maker' | 'taker';

const marketSides = ['maker', 'taker'] as const;

export function createCollectionListCommand(): Command {
  const cmd = new Command('list');
  cmd
    .description('List collections owned by an account')
    .requiredOption('--account <address>', 'owner account address')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .option('--per-page <n>', 'number of results per page', '24')
    .option('--page <n>', 'page number', '1')
    .action(async (opts: AccountListOptions): Promise<void> => {
      try {
        const account = parseAddress(opts.account, '--account');
        const { chain, rare } = createReadClient(opts);
        const page = parsePositiveInteger(opts.page, '--page');
        const perPage = parsePositiveInteger(opts.perPage, '--per-page');

        log(`Listing collections owned by ${account} on ${chain}...`);
        const result = await rare.search.collections({
          ownerAddress: account,
          page,
          perPage,
        });

        output(result, () => {
          console.log(`\nCollections owned by ${account} (${result.pagination.totalCount} total):`);
          if (result.data.length === 0) {
            console.log('  No results found.');
            return;
          }
          for (const collection of result.data) {
            printCollectionRow(collection);
          }
          printPagination(result.pagination);
        });
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

export function createListingListCommand(): Command {
  const cmd = new Command('list');
  cmd
    .description('List active token listings on NFTs held by an account')
    .requiredOption('--account <address>', 'owner account address')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .option('--per-page <n>', 'number of results per page', '24')
    .option('--page <n>', 'page number', '1')
    .action(async (opts: AccountListOptions): Promise<void> => {
      try {
        const account = parseAddress(opts.account, '--account');
        const { chain, rare } = createReadClient(opts);
        const page = parsePositiveInteger(opts.page, '--page');
        const perPage = parsePositiveInteger(opts.perPage, '--per-page');

        log(`Listing active token listings on NFTs held by ${account} on ${chain}...`);
        const result = await rare.search.nfts({
          ownerAddress: account,
          hasListing: true,
          listingType: 'SALE_PRICE',
          page,
          perPage,
        });

        output(result, () => {
          console.log(`\nActive token listings on NFTs held by ${account} (${result.pagination.totalCount} tokens):`);
          printListingRows(result.data, 'SALE_PRICE');
          printPagination(result.pagination);
        });
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

export function createBatchListingListCommand(): Command {
  const cmd = new Command('list');
  cmd
    .description('List active batch listings on NFTs held by an account')
    .requiredOption('--account <address>', 'owner account address')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .option('--per-page <n>', 'number of results per page', '24')
    .option('--page <n>', 'page number', '1')
    .action(async (opts: AccountListOptions): Promise<void> => {
      try {
        const account = parseAddress(opts.account, '--account');
        const { chain, rare } = createReadClient(opts);
        const page = parsePositiveInteger(opts.page, '--page');
        const perPage = parsePositiveInteger(opts.perPage, '--per-page');

        log(`Listing active batch listings on NFTs held by ${account} on ${chain}...`);
        const result = await rare.search.nfts({
          ownerAddress: account,
          hasListing: true,
          listingType: 'BATCH_SALE_PRICE',
          page,
          perPage,
        });

        output(result, () => {
          console.log(`\nActive batch listings on NFTs held by ${account} (${result.pagination.totalCount} tokens):`);
          printListingRows(result.data, 'BATCH_SALE_PRICE');
          printPagination(result.pagination);
        });
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

export function createOfferListCommand(): Command {
  const cmd = new Command('list');
  cmd
    .description('List active offers for an account as maker or taker')
    .requiredOption('--account <address>', 'account address')
    .requiredOption('--side <maker|taker>', 'maker lists offers made by account; taker lists offers on tokens the account holds')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .option('--per-page <n>', 'number of results per page', '24')
    .option('--page <n>', 'page number', '1')
    .action(async (opts: AccountSideListOptions): Promise<void> => {
      try {
        const account = parseAddress(opts.account, '--account');
        const side = parseMarketSide(opts.side);
        const { chain, rare } = createReadClient(opts);
        const page = parsePositiveInteger(opts.page, '--page');
        const perPage = parsePositiveInteger(opts.perPage, '--per-page');
        const makerParams = side === 'maker' ? { offerBuyerAddress: account } : {};
        const takerParams = side === 'taker' ? { ownerAddress: account } : {};

        log(`Listing active offers for ${account} as ${side} on ${chain}...`);
        const result = await rare.search.nfts({
          ...makerParams,
          ...takerParams,
          hasOffer: true,
          page,
          perPage,
        });

        output(result, () => {
          console.log(`\nActive offers for ${account} as ${side} (${result.pagination.totalCount} tokens):`);
          printOfferRows(result.data, side, account);
          printPagination(result.pagination);
        });
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

export function createAuctionListCommand(): Command {
  const cmd = new Command('list');
  cmd
    .description('List auctions for an account as maker or taker')
    .requiredOption('--account <address>', 'account address')
    .requiredOption('--side <maker|taker>', 'maker lists auctions created by account; taker lists auctions where account is bidder')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .option('--per-page <n>', 'number of results per page', '24')
    .option('--page <n>', 'page number', '1')
    .action(async (opts: AccountSideListOptions): Promise<void> => {
      try {
        const account = parseAddress(opts.account, '--account');
        const side = parseMarketSide(opts.side);
        const { chain, rare } = createReadClient(opts);
        const page = parsePositiveInteger(opts.page, '--page');
        const perPage = parsePositiveInteger(opts.perPage, '--per-page');
        const makerParams = side === 'maker' ? { auctionCreatorAddress: account } : {};
        const takerParams = side === 'taker' ? { auctionBidderAddress: account } : {};

        log(`Listing auctions for ${account} as ${side} on ${chain}...`);
        const result = await rare.search.nfts({
          ...makerParams,
          ...takerParams,
          hasAuction: true,
          page,
          perPage,
        });

        output(result, () => {
          console.log(`\nAuctions for ${account} as ${side} (${result.pagination.totalCount} tokens):`);
          printAuctionRows(result.data, side, account);
          printPagination(result.pagination);
        });
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createReadClient(opts: { chain?: string; chainId?: string }): {
  chain: ReturnType<typeof getActiveChain>;
  rare: ReturnType<typeof createRareClient>;
} {
  const chain = getActiveChain(opts.chain, opts.chainId);
  const publicClient = getPublicClient(chain);
  return {
    chain,
    rare: createRareClient({ publicClient }),
  };
}

function parsePositiveInteger(value: string, optionName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  return parsed;
}

function parseMarketSide(value: string): MarketSide {
  const side = marketSides.find((candidate) => candidate === value);
  if (side === undefined) {
    throw new Error(`--side must be one of: ${marketSides.join(', ')}`);
  }
  return side;
}

function printListingRows(nfts: Nft[], listingType: Nft['market']['listings'][number]['type']): void {
  const rows = nfts.flatMap((nft) =>
    nft.market.listings
      .filter((candidate) => candidate.type === listingType)
      .map((listing) => ({ nft, listing })),
  );
  for (const row of rows) {
    printListingMarketRow(row.nft, row.listing);
  }
  if (rows.length === 0) {
    console.log('  No results found.');
  }
}

function printOfferRows(nfts: Nft[], side: MarketSide, account: string): void {
  const rows = nfts.flatMap((nft) => {
    const offers = side === 'maker'
      ? nft.market.offers.filter((offer) => isSameAddress(offer.buyerAddress, account))
      : nft.market.offers;
    return offers.map((offer) => ({ nft, offer }));
  });
  for (const row of rows) {
    printOfferMarketRow(row.nft, row.offer);
  }
  if (rows.length === 0) {
    console.log('  No results found.');
  }
}

function printAuctionRows(nfts: Nft[], side: MarketSide, account: string): void {
  const rows = nfts.flatMap((nft) => {
    const auctions = side === 'maker'
      ? nft.market.auctions.filter((auction) => isSameAddress(auction.sellerAddress, account))
      : nft.market.auctions.filter((auction) => isSameAddress(auction.highestBidder.address, account));
    return auctions.map((auction) => ({ nft, auction }));
  });
  for (const row of rows) {
    printAuctionMarketRow(row.nft, row.auction);
  }
  if (rows.length === 0) {
    console.log('  No results found.');
  }
}

function isSameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
