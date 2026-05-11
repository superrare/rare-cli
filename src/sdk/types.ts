import type { Address, Hash, Hex, PublicClient, TransactionReceipt, WalletClient } from 'viem';
import type { SupportedChain } from '../contracts/addresses.js';
import type {
  LazySovereignCollectionContractType,
  SovereignCollectionContractType,
} from './collection-core.js';
import type {
  BuildReleaseAllowlistParams,
  ReleaseCollectionSupply,
  ReleaseAllowlistArtifact,
  ReleaseAllowlistProof,
  ReleaseDirectSaleConfig,
} from './release-core.js';
import type {
  BatchTokenListArtifact,
  BatchTokenProofArtifact,
  BatchTokenProofParams,
  BatchTokenProofVerifyParams,
  BuildBatchTokenTreeParams,
} from './batch-core.js';
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

export interface CreateSovereignCollectionParams {
  name: string;
  symbol: string;
  maxTokens?: IntegerInput;
  contractType?: SovereignCollectionContractType;
}

export interface CreateSovereignCollectionResult extends TransactionResult {
  contract: Address;
  factory: Address;
  contractType: SovereignCollectionContractType;
}

export interface CreateLazySovereignCollectionParams {
  name: string;
  symbol: string;
  maxTokens: IntegerInput;
  contractType?: LazySovereignCollectionContractType;
}

export interface CreateLazySovereignCollectionResult extends TransactionResult {
  contract: Address;
  factory: Address;
  contractType: LazySovereignCollectionContractType;
  nextStep: string;
}

export interface CollectionMintBatchParams {
  contract: Address;
  baseUri: string;
  tokenCount: IntegerInput;
}

export interface CollectionMintBatchResult extends TransactionResult {
  contract: Address;
  baseUri: string;
  tokenCount: bigint;
  fromTokenId: bigint;
  toTokenId: bigint;
  owner: Address;
}

export interface CollectionPrepareLazyMintParams {
  contract: Address;
  baseUri: string;
  tokenCount: IntegerInput;
  minter?: Address;
}

export interface CollectionPrepareLazyMintResult extends TransactionResult {
  contract: Address;
  baseUri: string;
  tokenCount: bigint;
  minter?: Address;
}

export interface CollectionTokenCreatorParams {
  contract: Address;
  tokenId: IntegerInput;
}

export interface CollectionTokenCreatorResult {
  contract: Address;
  tokenId: bigint;
  creator: Address;
}

export interface CollectionRoyaltyInfoParams {
  contract: Address;
  tokenId: IntegerInput;
  salePrice?: IntegerInput;
}

export interface CollectionRoyaltyInfoResult {
  contract: Address;
  tokenId: bigint;
  salePrice: bigint;
  receiver: Address;
  royaltyAmount: bigint;
  defaultReceiver?: Address;
  defaultPercentage?: bigint;
}

export interface CollectionSetDefaultRoyaltyReceiverParams {
  contract: Address;
  receiver: Address;
}

export interface CollectionSetDefaultRoyaltyReceiverResult extends TransactionResult {
  contract: Address;
  receiver: Address;
}

export interface CollectionSetTokenRoyaltyReceiverParams {
  contract: Address;
  tokenId: IntegerInput;
  receiver: Address;
}

export interface CollectionSetTokenRoyaltyReceiverResult extends TransactionResult {
  contract: Address;
  tokenId: bigint;
  receiver: Address;
}

export interface CollectionMintConfigParams {
  contract: Address;
}

export interface CollectionMintConfigResult {
  contract: Address;
  tokenCount: bigint;
  baseUri: string;
  lockedMetadata: boolean;
}

export interface CollectionUpdateBaseUriParams {
  contract: Address;
  baseUri: string;
}

export interface CollectionUpdateBaseUriResult extends TransactionResult {
  contract: Address;
  baseUri: string;
}

export interface CollectionUpdateTokenUriParams {
  contract: Address;
  tokenId: IntegerInput;
  tokenUri: string;
}

export interface CollectionUpdateTokenUriResult extends TransactionResult {
  contract: Address;
  tokenId: bigint;
  tokenUri: string;
}

export interface CollectionLockBaseUriParams {
  contract: Address;
}

export interface CollectionLockBaseUriResult extends TransactionResult {
  contract: Address;
  baseUri: string;
}

export interface CreateRareSpaceCollectionParams {
  name: string;
  symbol: string;
}

export interface CreateRareSpaceCollectionResult extends TransactionResult {
  contract: Address;
  factory: Address;
  operator: Address;
}

export interface MintRareSpaceTokenParams {
  contract: Address;
  tokenUri: string;
  to?: Address;
  royaltyReceiver?: Address;
}

export interface MintRareSpaceTokenResult extends TransactionResult {
  contract: Address;
  tokenId: bigint;
  tokenUri: string;
  to: Address;
  royaltyReceiver: Address;
}

export interface ReleaseAllowlistConfigParams {
  contract: Address;
  root: Hex;
  endTimestamp: IntegerInput;
}

export interface ReleaseAllowlistConfigResult extends TransactionResult {
  contract: Address;
  minter: Address;
  root: Hex;
  endTimestamp: bigint;
}

export interface ReleaseLimitParams {
  contract: Address;
  limit: IntegerInput;
}

export interface ReleaseLimitResult extends TransactionResult {
  contract: Address;
  minter: Address;
  limit: bigint;
}

export interface ReleaseSellerStakingMinimumParams {
  contract: Address;
  minimum: IntegerInput;
  endTimestamp: IntegerInput;
}

export interface ReleaseSellerStakingMinimumResult extends TransactionResult {
  contract: Address;
  minter: Address;
  minimum: bigint;
  endTimestamp: bigint;
}

export interface ReleaseMintDirectSaleParams {
  contract: Address;
  quantity?: IntegerInput;
  currency?: Address;
  price?: AmountInput;
  proof?: readonly Hex[];
  recipient?: Address;
  autoApprove?: boolean;
}

export interface ReleaseMintDirectSaleResult extends TransactionResult {
  contract: Address;
  minter: Address;
  buyer: Address;
  recipient: Address;
  quantity: number;
  currency: Address;
  price: bigint;
  totalPrice: bigint;
  requiredPayment: bigint;
  approvalTxHash?: Hash;
  allowlistRequired: boolean;
  tokenIdStart: bigint;
  tokenIdEnd: bigint;
  tokenIds: bigint[];
}

export interface ReleaseConfigParams {
  contract: Address;
  account?: Address;
}

export interface ReleaseConfig {
  contract: Address;
  minter: Address;
  allowlistRoot: Hex;
  allowlistEndTimestamp: bigint;
  mintLimit: bigint;
  txLimit: bigint;
  sellerStakingMinimum: bigint;
  sellerStakingMinimumEndTimestamp: bigint;
  directSale: ReleaseDirectSaleConfig;
  supply?: ReleaseCollectionSupply;
  account?: Address;
  accountMints?: bigint;
  accountTxs?: bigint;
}

export interface ReleaseAllowlistProofParams {
  artifact: ReleaseAllowlistArtifact;
  address: Address;
}

export interface ReleaseAllowlistVerifyParams {
  root: Hex;
  address: Address;
  proof: readonly Hex[];
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
  auctionType?: 'reserve' | 'scheduled';
  startTime?: IntegerInput;
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
  auctionTypeName: 'reserve' | 'scheduled' | 'none' | 'unknown';
  splitAddresses: Address[];
  splitRatios: number[];
  isEth: boolean;
  hasAuction: boolean;
  started: boolean;
  endTime: bigint | null;
  status: 'PENDING' | 'RUNNING' | 'ENDED';
  state: 'NONE' | 'RESERVE_NOT_MET' | 'SCHEDULED' | 'ACTIVE' | 'ENDED';
  currentBidder: Address | null;
  currentBid: bigint;
  currentBidCurrency: Address;
  currentBidMarketplaceFee: number;
  minimumNextBid: bigint;
  settlementEligible: boolean;
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

export interface BatchOfferCreateParams {
  root?: Hex;
  artifact?: BatchTokenListArtifact;
  amount: AmountInput;
  currency?: Address;
  expiry: IntegerInput;
}

export interface BatchOfferCreateResult extends TransactionResult {
  batchOfferCreator: Address;
  creator: Address;
  root: Hex;
  amount: bigint;
  currency: Address;
  expiry: bigint;
  requiredPayment: bigint;
  approvalTxHash?: Hash;
}

export interface BatchOfferRevokeParams {
  root?: Hex;
  artifact?: BatchTokenListArtifact;
}

export interface BatchOfferRevokeResult extends TransactionResult {
  batchOfferCreator: Address;
  creator: Address;
  root: Hex;
  amount: bigint;
  currency: Address;
}

export interface BatchOfferAcceptParams {
  creator: Address;
  root?: Hex;
  proof?: readonly Hex[];
  proofArtifact?: BatchTokenProofArtifact;
  contract: Address;
  tokenId: IntegerInput;
  splitAddresses?: Address[];
  splitRatios?: number[];
  autoApprove?: boolean;
}

export interface BatchOfferAcceptResult extends TransactionResult {
  batchOfferCreator: Address;
  seller: Address;
  buyer: Address;
  creator: Address;
  contract: Address;
  tokenId: bigint;
  root: Hex;
  currency: Address;
  amount: bigint;
  approvalTxHash?: Hash;
}

export interface BatchOfferStatusParams {
  creator: Address;
  root?: Hex;
  artifact?: BatchTokenListArtifact;
}

export interface BatchOfferStatus {
  creator: Address;
  root: Hex;
  amount: bigint;
  currency: Address;
  expiry: bigint;
  feePercentage: bigint;
  hasOffer: boolean;
  expired: boolean;
  revoked: boolean | null;
  fillable: boolean;
  state: 'NONE' | 'ACTIVE' | 'EXPIRED';
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
    sovereignFactory?: Address;
    lazySovereignFactory?: Address;
    spaceFactory?: Address;
    rareMinter?: Address;
    batchOfferCreator?: Address;
  };
  deploy: {
    erc721(params: DeployErc721Params): Promise<DeployErc721Result>;
  };
  mint: {
    mintTo(params: MintToParams): Promise<MintToResult>;
  };
  auction: {
    create(params: AuctionCreateParams): Promise<TransactionResult & { approvalTxHash?: Hash; auctionType: 'reserve' | 'scheduled'; startTime: bigint }>;
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
    createSovereign(params: CreateSovereignCollectionParams): Promise<CreateSovereignCollectionResult>;
    createLazySovereign(params: CreateLazySovereignCollectionParams): Promise<CreateLazySovereignCollectionResult>;
    mintBatch(params: CollectionMintBatchParams): Promise<CollectionMintBatchResult>;
    prepareLazyMint(params: CollectionPrepareLazyMintParams): Promise<CollectionPrepareLazyMintResult>;
    getTokenCreator(params: CollectionTokenCreatorParams): Promise<CollectionTokenCreatorResult>;
    getRoyaltyInfo(params: CollectionRoyaltyInfoParams): Promise<CollectionRoyaltyInfoResult>;
    setDefaultRoyaltyReceiver(params: CollectionSetDefaultRoyaltyReceiverParams): Promise<CollectionSetDefaultRoyaltyReceiverResult>;
    setTokenRoyaltyReceiver(params: CollectionSetTokenRoyaltyReceiverParams): Promise<CollectionSetTokenRoyaltyReceiverResult>;
    getMintConfig(params: CollectionMintConfigParams): Promise<CollectionMintConfigResult>;
    updateBaseUri(params: CollectionUpdateBaseUriParams): Promise<CollectionUpdateBaseUriResult>;
    updateTokenUri(params: CollectionUpdateTokenUriParams): Promise<CollectionUpdateTokenUriResult>;
    lockBaseUri(params: CollectionLockBaseUriParams): Promise<CollectionLockBaseUriResult>;
    createSpace(params: CreateRareSpaceCollectionParams): Promise<CreateRareSpaceCollectionResult>;
    mintSpace(params: MintRareSpaceTokenParams): Promise<MintRareSpaceTokenResult>;
  };
  release: {
    buildAllowlist(params: BuildReleaseAllowlistParams): ReleaseAllowlistArtifact;
    getAllowlistProof(params: ReleaseAllowlistProofParams): ReleaseAllowlistProof;
    verifyAllowlistProof(params: ReleaseAllowlistVerifyParams): boolean;
    getConfig(params: ReleaseConfigParams): Promise<ReleaseConfig>;
    setAllowlistConfig(params: ReleaseAllowlistConfigParams): Promise<ReleaseAllowlistConfigResult>;
    setMintLimit(params: ReleaseLimitParams): Promise<ReleaseLimitResult>;
    setTxLimit(params: ReleaseLimitParams): Promise<ReleaseLimitResult>;
    setSellerStakingMinimum(params: ReleaseSellerStakingMinimumParams): Promise<ReleaseSellerStakingMinimumResult>;
    mintDirectSale(params: ReleaseMintDirectSaleParams): Promise<ReleaseMintDirectSaleResult>;
  };
  batch: {
    buildTree(params: BuildBatchTokenTreeParams): BatchTokenListArtifact;
    getTreeProof(params: BatchTokenProofParams): BatchTokenProofArtifact;
    verifyTreeProof(params: BatchTokenProofVerifyParams): boolean;
    offer: {
      create(params: BatchOfferCreateParams): Promise<BatchOfferCreateResult>;
      revoke(params: BatchOfferRevokeParams): Promise<BatchOfferRevokeResult>;
      accept(params: BatchOfferAcceptParams): Promise<BatchOfferAcceptResult>;
      getStatus(params: BatchOfferStatusParams): Promise<BatchOfferStatus>;
    };
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
