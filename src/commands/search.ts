import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getConfiguredAccountAddress, getPublicClient } from '../client.js';
import { createRareClient } from '../sdk/client.js';
import type { SupportedChain } from '../contracts/addresses.js';
import type { NftSearchParams } from '../sdk/api.js';
import type { RareClientEventSearchParams } from '../sdk/client.js';
import { parseAddress, parseOptionalAddress } from '../sdk/validation.js';
import { output, log, printNftRow, printCollectionRow, printNftEventRow, printPagination } from '../output.js';
import { collectOption, parseNftEventSort, parseNftEventTypes } from './event-options.js';
import { parsePositiveInteger } from './pagination-core.js';

type SearchPageOptions = {
  chain?: string;
  chainId?: string;
  query: string;
  perPage: string;
  page: string;
};

type SearchNftsOptions = SearchPageOptions & {
  owner?: string;
  mine?: boolean;
  hasAuction?: boolean;
  auctionState?: string;
  auctionCreator?: string;
  auctionBidder?: string;
  hasListing?: boolean;
  listingType?: string;
  hasOffer?: boolean;
  offerBuyer?: string;
};

type SearchCollectionsOptions = SearchPageOptions;

type SearchEventsOptions = {
  chain?: string;
  chainId?: string;
  collectionId?: string;
  contract?: string;
  tokenId?: string;
  eventType?: string[];
  sortBy?: string;
  perPage: string;
  page: string;
};

const auctionStates = ['PENDING', 'RUNNING', 'UNSETTLED'] as const;
const listingTypes = ['SALE_PRICE', 'BATCH_SALE_PRICE'] as const;

function parseAuctionState(value: string | undefined): NftSearchParams['auctionState'] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const state = auctionStates.find((candidate) => candidate === value);
  if (state === undefined) {
    throw new Error(`--auction-state must be one of: ${auctionStates.join(', ')}`);
  }
  return state;
}

function parseListingType(value: string | undefined): NftSearchParams['listingType'] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const listingType = listingTypes.find((candidate) => candidate === value);
  if (listingType === undefined) {
    throw new Error(`--listing-type must be one of: ${listingTypes.join(', ')}`);
  }
  return listingType;
}

function getWalletAddress(chain: SupportedChain): string {
  const address = getConfiguredAccountAddress(chain);
  if (address === undefined) {
    throw new Error(
      `no wallet configured for "${chain}". ` +
        `Run: rare configure --chain ${chain} --private-key <key> or --private-key-ref <op://...>`,
    );
  }
  return address;
}

export function searchCommand(): Command {
  const cmd = new Command('search');
  cmd.description('Search NFTs and collections via the RARE Protocol API');

  // --- rare search nfts ---
  cmd
    .command('nfts')
    .description('Search NFTs')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .option('--query <text>', 'text search query', '')
    .option('--owner <address>', 'filter by owner address')
    .option('--mine', 'filter by your configured wallet address')
    .option('--has-auction', 'filter to NFTs with auctions')
    .option('--auction-state <state>', 'auction state to filter (PENDING, RUNNING, UNSETTLED)')
    .option('--auction-creator <address>', 'filter by auction creator address')
    .option('--auction-bidder <address>', 'filter by auction bidder address')
    .option('--has-listing', 'filter to NFTs with listings')
    .option('--listing-type <type>', 'listing type to filter (SALE_PRICE, BATCH_SALE_PRICE)')
    .option('--has-offer', 'filter to NFTs with offers')
    .option('--offer-buyer <address>', 'filter by offer buyer address')
    .option('--per-page <n>', 'number of results per page', '24')
    .option('--page <n>', 'page number', '1')
    .action(async (opts: SearchNftsOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const page = parsePositiveInteger(opts.page, '--page');
      const perPage = parsePositiveInteger(opts.perPage, '--per-page');
      const auctionState = parseAuctionState(opts.auctionState);
      const auctionCreatorAddress = parseOptionalAddress(opts.auctionCreator, '--auction-creator');
      const auctionBidderAddress = parseOptionalAddress(opts.auctionBidder, '--auction-bidder');
      const listingType = parseListingType(opts.listingType);
      const offerBuyerAddress = parseOptionalAddress(opts.offerBuyer, '--offer-buyer');
      const rare = createRareClient({ publicClient: getPublicClient(chain) });

      const ownerAddress = opts.mine
        ? getWalletAddress(chain)
        : parseOptionalAddress(opts.owner, '--owner');
      const hasAuction = opts.hasAuction === true ||
        auctionState !== undefined ||
        auctionCreatorAddress !== undefined ||
        auctionBidderAddress !== undefined;
      const hasListing = opts.hasListing === true || listingType !== undefined;
      const hasOffer = opts.hasOffer === true || offerBuyerAddress !== undefined;

      const label = ownerAddress
        ? `NFTs owned by ${ownerAddress}`
        : 'NFTs';

      log(`Searching ${label} on ${chain}...`);

      const result = await rare.search.nfts({
        query: opts.query,
        perPage,
        page,
        ownerAddress,
        hasAuction: hasAuction ? true : undefined,
        auctionState,
        auctionCreatorAddress,
        auctionBidderAddress,
        hasListing: hasListing ? true : undefined,
        listingType,
        hasOffer: hasOffer ? true : undefined,
        offerBuyerAddress,
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

    });

  // --- rare search collections ---
  cmd
    .command('collections')
    .description('List collections')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .option('--query <text>', 'text search query', '')
    .option('--per-page <n>', 'number of results per page', '24')
    .option('--page <n>', 'page number', '1')
    .action(async (opts: SearchCollectionsOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const page = parsePositiveInteger(opts.page, '--page');
      const perPage = parsePositiveInteger(opts.perPage, '--per-page');
      const rare = createRareClient({ publicClient: getPublicClient(chain) });

      log(`Searching collections on ${chain}...`);

      const result = await rare.search.collections({
        query: opts.query,
        perPage,
        page,
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

    });

  // --- rare search events ---
  cmd
    .command('events')
    .description('Search NFT events')
    .option('--chain <chain>', 'chain to use for contract filters (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID to use for contract filters (1, 11155111, 8453, 84532)')
    .option('--collection-id <id>', 'filter by collection ID')
    .option('--contract <address>', 'filter by collection or NFT contract address')
    .option('--token-id <id>', 'filter by NFT token ID; requires --contract')
    .option('--event-type <type>', 'event type filter (repeatable)', collectOption)
    .option('--sort-by <field>', 'sort order (newest, oldest)')
    .option('--per-page <n>', 'number of results per page', '24')
    .option('--page <n>', 'page number', '1')
    .action(async (opts: SearchEventsOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const page = parsePositiveInteger(opts.page, '--page');
      const perPage = parsePositiveInteger(opts.perPage, '--per-page');
      if (opts.tokenId !== undefined && opts.contract === undefined) {
        throw new Error('rare search events --token-id requires --contract.');
      }
      const rare = createRareClient({ publicClient: getPublicClient(chain) });
      const params: RareClientEventSearchParams = {
        collectionId: opts.collectionId,
        contract: opts.contract === undefined ? undefined : parseAddress(opts.contract, '--contract'),
        tokenId: opts.tokenId,
        eventType: parseNftEventTypes(opts.eventType),
        sortBy: parseNftEventSort(opts.sortBy),
        perPage,
        page,
      };

      const label = opts.collectionId !== undefined
        ? `collection ${opts.collectionId}`
        : opts.tokenId !== undefined
          ? `NFT ${opts.contract ?? '<missing contract>'}/${opts.tokenId}`
          : `collection contract ${opts.contract ?? '<missing contract>'}`;

      log(`Searching events for ${label}...`);

      const result = await rare.search.events(params);
      output(result, () => {
        console.log(`\nEvents (${result.pagination.totalCount} total):`);
        if (result.data.length === 0) {
          console.log('  No events found.');
          return;
        }
        for (const event of result.data) {
          printNftEventRow(event);
        }
        printPagination(result.pagination);
      });

    });

  return cmd;
}
