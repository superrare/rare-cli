import type { Address, PublicClient, WalletClient } from 'viem';
import type {
  Collection,
  CollectionSearchParams,
  EventSearchParams,
  ImportErc721Params,
  Nft,
  NftEvent,
  NftMediaEntry,
  NftSearchParams,
  PinMetadataParams,
  SearchPageResponse,
  UserProfile,
} from '../api.js';
import type { NftIdentityParams } from '../nft-core.js';
import type { SupportedChain } from '../../contracts/addresses.js';
import type { AuctionNamespace } from './auction.js';
import type { CollectionNamespace } from './collection.js';
import type { CurrencyInfo, CurrencyInput, ResolvedCurrency, ResolvedCurrencyWithDecimals, IntegerInput } from './common.js';
import type { LiquidEditionNamespace } from './liquid.js';
import type { ListingNamespace } from './listing.js';
import type { OfferNamespace } from './offer.js';
import type { SwapNamespace } from './swap.js';
import type { TokenNamespace } from './token.js';
import type { UtilsNamespace } from './utils.js';

export type RareClientConfig = {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  account?: Address;
  apiBaseUrl?: string;
  apiFetch?: typeof fetch;
}

export type RareClientNftSearchParams = Omit<NftSearchParams, 'chainId'>;
export type RareClientCollectionSearchParams = Omit<CollectionSearchParams, 'chainId'>;
export type RareClientEventSearchParams = Omit<EventSearchParams, 'chain' | 'chainId'>;
export type RareClientNftGetParams = Omit<NftIdentityParams, 'chain' | 'chainId'>;

export type RareClientContracts = {
  factory: Address;
  auction: Address;
  sovereignFactory?: Address;
  lazySovereignFactory?: Address;
  rareMinter?: Address;
  lazyBatchMintFactory?: Address;
  batchListing?: Address;
  batchOfferCreator?: Address;
  batchAuctionHouse?: Address;
  marketplaceSettings?: Address;
  erc20ApprovalManager?: Address;
  erc721ApprovalManager?: Address;
  liquidFactory?: Address;
  swapRouter?: Address;
  v4Quoter?: Address;
}

export type SearchNamespace = {
  nfts: (params?: RareClientNftSearchParams) => Promise<SearchPageResponse<Nft>>;
  collections: (params?: RareClientCollectionSearchParams) => Promise<SearchPageResponse<Collection>>;
  events: (params: RareClientEventSearchParams) => Promise<SearchPageResponse<NftEvent>>;
}

export type NftNamespace = {
  get: (params: RareClientNftGetParams) => Promise<Nft>;
}

export type UserNamespace = {
  get: (address: string) => Promise<UserProfile>;
}

export type MediaNamespace = {
  upload: (buffer: Uint8Array, filename: string) => Promise<NftMediaEntry>;
  pinMetadata: (opts: PinMetadataParams) => Promise<string>;
}

export type ImportNamespace = {
  erc721: (params: ImportErc721Params) => Promise<void>;
}

export type CurrencyNamespace = {
  list: () => CurrencyInfo[];
  resolve: (input: CurrencyInput) => ResolvedCurrency;
  resolveDecimals: (input: CurrencyInput) => Promise<ResolvedCurrencyWithDecimals>;
}

export type RareClient = {
  chain: SupportedChain;
  chainId: number;
  contracts: RareClientContracts;
  liquidEdition: LiquidEditionNamespace;
  swap: SwapNamespace;
  auction: AuctionNamespace;
  offer: OfferNamespace;
  listing: ListingNamespace;
  utils: UtilsNamespace;
  search: SearchNamespace;
  nft: NftNamespace;
  collection: CollectionNamespace;
  user: UserNamespace;
  media: MediaNamespace;
  import: ImportNamespace;
  token: TokenNamespace;
  currency: CurrencyNamespace;
}

export type { IntegerInput };
