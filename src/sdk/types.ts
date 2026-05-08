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
export type TimestampInput = IntegerInput | Date;
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

export interface ReleaseConfigureParams {
  contract: Address;
  currency?: Address;
  price: AmountInput;
  startTime?: TimestampInput;
  maxMints: IntegerInput;
  splitAddresses?: Address[];
  splitRatios?: number[];
}

export interface ReleaseConfigureResult extends TransactionResult {
  rareMinter: Address;
  contract: Address;
  currencyAddress: Address;
  price: bigint;
  startTime: bigint;
  maxMints: bigint;
  splitRecipients: Address[];
  splitRatios: number[];
}

export interface ReleaseAllowlistWalletProof {
  address: Address;
  leaf: Hash;
  proof: Hash[];
}

export interface ReleaseAllowlistArtifact {
  kind: 'rare-release-allowlist-v1';
  version: 1;
  leafEncoding: 'keccak256(address)';
  tree: 'sorted-addresses-sort-pairs';
  root: Hash;
  wallets: ReleaseAllowlistWalletProof[];
}

export interface ReleaseAllowlistConfig {
  rareMinter: Address;
  contract: Address;
  root: Hash;
  endTimestamp: bigint;
  active: boolean;
  now: bigint;
}

export interface ReleaseLimitConfig {
  rareMinter: Address;
  contract: Address;
  limit: bigint;
  enabled: boolean;
}

export interface ReleaseSellerStakingMinimum {
  rareMinter: Address;
  contract: Address;
  amount: bigint;
  endTimestamp: bigint;
  active: boolean;
  now: bigint;
}

export interface ReleaseSetAllowlistConfigParams {
  contract: Address;
  root?: Hash;
  artifact?: ReleaseAllowlistArtifact;
  endTimestamp: TimestampInput;
}

export interface ReleaseSetAllowlistConfigResult extends TransactionResult {
  config: ReleaseAllowlistConfig;
}

export interface ReleaseSetLimitParams {
  contract: Address;
  limit: IntegerInput;
}

export interface ReleaseSetLimitResult extends TransactionResult {
  config: ReleaseLimitConfig;
}

export interface ReleaseSetSellerStakingMinimumParams {
  contract: Address;
  amount: AmountInput;
  endTimestamp?: TimestampInput;
}

export interface ReleaseSetSellerStakingMinimumResult extends TransactionResult {
  config: ReleaseSellerStakingMinimum;
}

export interface ReleaseStatusParams {
  contract: Address;
  wallet?: Address;
}

export interface ReleaseStatus {
  rareMinter: Address;
  contract: Address;
  configured: boolean;
  seller: Address;
  currencyAddress: Address;
  currencyDecimals: number | null;
  price: bigint;
  startTime: bigint;
  maxMints: bigint;
  splitRecipients: Address[];
  splitRatios: number[];
  allowlistRoot: `0x${string}`;
  allowlistEndTimestamp: bigint;
  allowlistActive: boolean;
  requiresAllowlist: boolean;
  mintLimit: bigint;
  txLimit: bigint;
  wallet: Address | null;
  walletMints: bigint | null;
  walletTxs: bigint | null;
  stakingMinimumAmount: bigint;
  stakingMinimumEndTimestamp: bigint;
  stakingMinimumActive: boolean;
  totalSupply: bigint | null;
  maxSupply: bigint | null;
  remainingSupply: bigint | null;
  soldOut: boolean | null;
  started: boolean;
  currentlyMintable: boolean;
  isEth: boolean;
  now: bigint;
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
    rareMinter?: Address;
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
  release: {
    buildAllowlistArtifact(params: { input: string; format: 'csv' | 'json' }): ReleaseAllowlistArtifact;
    parseAllowlistArtifact(params: { input: string }): ReleaseAllowlistArtifact;
    getAllowlistProof(params: { artifact: ReleaseAllowlistArtifact; wallet: Address }): ReleaseAllowlistWalletProof | null;
    configure(params: ReleaseConfigureParams): Promise<ReleaseConfigureResult>;
    getAllowlistConfig(params: { contract: Address }): Promise<ReleaseAllowlistConfig>;
    setAllowlistConfig(params: ReleaseSetAllowlistConfigParams): Promise<ReleaseSetAllowlistConfigResult>;
    clearAllowlistConfig(params: { contract: Address }): Promise<ReleaseSetAllowlistConfigResult>;
    getMintLimit(params: { contract: Address }): Promise<ReleaseLimitConfig>;
    setMintLimit(params: ReleaseSetLimitParams): Promise<ReleaseSetLimitResult>;
    getTxLimit(params: { contract: Address }): Promise<ReleaseLimitConfig>;
    setTxLimit(params: ReleaseSetLimitParams): Promise<ReleaseSetLimitResult>;
    getSellerStakingMinimum(params: { contract: Address }): Promise<ReleaseSellerStakingMinimum>;
    setSellerStakingMinimum(params: ReleaseSetSellerStakingMinimumParams): Promise<ReleaseSetSellerStakingMinimumResult>;
    getStatus(params: ReleaseStatusParams): Promise<ReleaseStatus>;
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
