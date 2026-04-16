import type { Address, Hash, PublicClient, TransactionReceipt, WalletClient } from 'viem';
import type { SupportedChain } from '../contracts/addresses.js';
import type {
  CollectionSearchParams,
  ImportErc721Params,
  NftMediaEntry,
  NftSearchParams,
  PinMetadataParams,
  SearchPageResponse,
  Nft,
  Collection,
  NftEvent,
  UserProfile,
} from './api.js';

export type IntegerInput = bigint | number | string;
export type AmountInput = bigint | number | string;
export type WalletAccount = NonNullable<WalletClient['account']>;

export interface RareClientConfig {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  account?: Address;
}

export interface TransactionResult {
  txHash: Hash;
  receipt: TransactionReceipt;
}

export interface DeployErc721Params {
  name: string;
  symbol: string;
  maxTokens?: IntegerInput;
}

export interface DeployErc721Result extends TransactionResult {
  contract: Address;
}

export interface MintToParams {
  contract: Address;
  tokenUri: string;
  to?: Address;
  royaltyReceiver?: Address;
}

export interface MintToResult extends TransactionResult {
  tokenId: bigint;
}

export interface AuctionCreateParams {
  contract: Address;
  tokenId: IntegerInput;
  startingPrice: AmountInput;
  duration: IntegerInput;
  currency?: Address;
  splitAddresses?: Address[];
  splitRatios?: number[];
  autoApprove?: boolean;
}

export interface AuctionBidParams {
  contract: Address;
  tokenId: IntegerInput;
  amount: AmountInput;
  currency?: Address;
}

export interface AuctionSettleParams {
  contract: Address;
  tokenId: IntegerInput;
}

export interface AuctionCancelParams {
  contract: Address;
  tokenId: IntegerInput;
}

export interface AuctionStatusParams {
  contract: Address;
  tokenId: IntegerInput;
}

export interface AuctionStatus {
  seller: Address;
  creationBlock: bigint;
  startingTime: bigint;
  lengthOfAuction: bigint;
  currency: Address;
  minimumBid: bigint;
  auctionType: `0x${string}`;
  splitAddresses: Address[];
  splitRatios: number[];
  isEth: boolean;
  started: boolean;
  endTime: bigint | null;
  status: 'PENDING' | 'RUNNING' | 'ENDED';
}

export interface OfferCreateParams {
  contract: Address;
  tokenId: IntegerInput;
  currency?: Address;
  amount: AmountInput;
  convertible?: boolean;
}

export interface OfferCancelParams {
  contract: Address;
  tokenId: IntegerInput;
  currency?: Address;
}

export interface OfferAcceptParams {
  contract: Address;
  tokenId: IntegerInput;
  currency?: Address;
  amount: AmountInput;
  splitAddresses?: Address[];
  splitRatios?: number[];
}

export interface OfferStatusParams {
  contract: Address;
  tokenId: IntegerInput;
  currency?: Address;
}

export interface OfferStatus {
  buyer: Address;
  amount: bigint;
  timestamp: bigint;
  marketplaceFee: number;
  convertible: boolean;
  hasOffer: boolean;
}

export interface ListingCreateParams {
  contract: Address;
  tokenId: IntegerInput;
  currency?: Address;
  price: AmountInput;
  target?: Address;
  splitAddresses?: Address[];
  splitRatios?: number[];
  autoApprove?: boolean;
}

export interface ListingCancelParams {
  contract: Address;
  tokenId: IntegerInput;
  target?: Address;
}

export interface ListingBuyParams {
  contract: Address;
  tokenId: IntegerInput;
  currency?: Address;
  amount: AmountInput;
}

export interface ListingStatusParams {
  contract: Address;
  tokenId: IntegerInput;
  target?: Address;
}

export interface ListingStatus {
  seller: Address;
  currencyAddress: Address;
  amount: bigint;
  hasListing: boolean;
  isEth: boolean;
}

export interface TokenContractInfo {
  contract: Address;
  chain: SupportedChain;
  name: string;
  symbol: string;
  totalSupply: bigint;
}

export interface TokenInfo {
  contract: Address;
  tokenId: bigint;
  owner: Address;
  tokenUri: string;
}

export interface RareClient {
  chain: SupportedChain;
  chainId: number;
  contracts: {
    factory: Address;
    auction: Address;
  };
  deploy: {
    erc721(params: DeployErc721Params): Promise<DeployErc721Result>;
  };
  mint: {
    mintTo(params: MintToParams): Promise<MintToResult>;
  };
  auction: {
    create(params: AuctionCreateParams): Promise<TransactionResult & { approvalTxHash?: Hash }>;
    bid(params: AuctionBidParams): Promise<TransactionResult>;
    settle(params: AuctionSettleParams): Promise<TransactionResult>;
    cancel(params: AuctionCancelParams): Promise<TransactionResult>;
    getStatus(params: AuctionStatusParams): Promise<AuctionStatus>;
  };
  offer: {
    create(params: OfferCreateParams): Promise<TransactionResult>;
    cancel(params: OfferCancelParams): Promise<TransactionResult>;
    accept(params: OfferAcceptParams): Promise<TransactionResult>;
    getStatus(params: OfferStatusParams): Promise<OfferStatus>;
  };
  listing: {
    create(params: ListingCreateParams): Promise<TransactionResult & { approvalTxHash?: Hash }>;
    cancel(params: ListingCancelParams): Promise<TransactionResult>;
    buy(params: ListingBuyParams): Promise<TransactionResult>;
    getStatus(params: ListingStatusParams): Promise<ListingStatus>;
  };
  search: {
    nfts(params?: NftSearchParams): Promise<SearchPageResponse<Nft>>;
    collections(params?: CollectionSearchParams): Promise<SearchPageResponse<Collection>>;
  };
  nft: {
    get(universalTokenId: string): Promise<Nft>;
    events(universalTokenId: string, opts?: { page?: number; perPage?: number; eventType?: string | string[]; sortBy?: 'newest' | 'oldest' }): Promise<SearchPageResponse<NftEvent>>;
  };
  collection: {
    get(id: string): Promise<Collection>;
    events(id: string, opts?: { page?: number; perPage?: number; eventType?: string | string[]; sortBy?: 'newest' | 'oldest' }): Promise<SearchPageResponse<NftEvent>>;
  };
  user: {
    get(address: string): Promise<UserProfile>;
  };
  media: {
    upload(buffer: Uint8Array, filename: string): Promise<NftMediaEntry>;
    pinMetadata(opts: PinMetadataParams): Promise<string>;
  };
  import: {
    erc721(params: ImportErc721Params): Promise<void>;
  };
  token: {
    getContractInfo(params: { contract: Address }): Promise<TokenContractInfo>;
    getTokenInfo(params: { contract: Address; tokenId: IntegerInput }): Promise<TokenInfo>;
    getPrice(symbol: string): Promise<{ symbol: string; priceUsd: number; decimals: number; chainId: number; address: string }>;
  };
}
