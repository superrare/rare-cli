import type { Address, Hash, Hex, PublicClient, TransactionReceipt, WalletClient } from 'viem';
import type { SupportedChain } from '../contracts/addresses.js';
import type { CurvePresetKey, LiquidCurvePreview, LiquidCurveSegment } from '../liquid/curve-config.js';
import type { LiquidFactoryConfig } from '../liquid/factory-config.js';
import type {
  LazySovereignCollectionContractType,
  SovereignCollectionContractType,
} from './collection-core.js';
import type {
  BatchTokenListArtifact,
  BatchTokenProofArtifact,
  BatchTokenProofParams,
  BatchTokenProofVerifyParams,
  BuildBatchTokenTreeParams,
  BuildUtilsTreeParams,
  UtilsTreeArtifact,
  UtilsTreeProofArtifact,
  UtilsTreeProofParams,
  UtilsTreeProofVerifyParams,
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
  NftEventOptions,
  CollectionEventOptions,
  UserProfile,
} from './api.js';

export type IntegerInput = bigint | number | string;
export type AmountInput = bigint | number | string;
export type TimestampInput = IntegerInput | Date;
export type WalletAccount = NonNullable<WalletClient['account']>;

export type RareClientConfig = {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  account?: Address;
  apiBaseUrl?: string;
  apiFetch?: typeof fetch;
}

export type TransactionResult = {
  txHash: Hash;
  receipt: TransactionReceipt;
}

export type DeployErc721Params = {
  name: string;
  symbol: string;
  maxTokens?: IntegerInput;
}

export type DeployErc721Result = {
  contract: Address;
} & TransactionResult

export type DeployLazyBatchMintParams = {
  name: string;
  symbol: string;
  maxTokens?: IntegerInput;
}

export type DeployLazyBatchMintResult = {
  contract: Address;
} & TransactionResult

export type CreateSovereignCollectionParams = {
  name: string;
  symbol: string;
  maxTokens?: IntegerInput;
  contractType?: SovereignCollectionContractType;
}

export type CreateSovereignCollectionResult = {
  contract: Address;
  factory: Address;
  contractType: SovereignCollectionContractType;
} & TransactionResult

export type CreateLazySovereignCollectionParams = {
  name: string;
  symbol: string;
  maxTokens: IntegerInput;
  contractType?: LazySovereignCollectionContractType;
}

export type CreateLazySovereignCollectionResult = {
  contract: Address;
  factory: Address;
  contractType: LazySovereignCollectionContractType;
  nextStep: string;
} & TransactionResult

export type CollectionMintBatchParams = {
  contract: Address;
  baseUri: string;
  tokenCount: IntegerInput;
}

export type CollectionMintBatchResult = {
  contract: Address;
  baseUri: string;
  tokenCount: bigint;
  fromTokenId: bigint;
  toTokenId: bigint;
  owner: Address;
} & TransactionResult

export type CollectionPrepareLazyMintParams = {
  contract: Address;
  baseUri: string;
  tokenCount: IntegerInput;
  minter?: Address;
}

export type CollectionPrepareLazyMintResult = {
  contract: Address;
  baseUri: string;
  tokenCount: bigint;
  minter?: Address;
} & TransactionResult

export type CollectionTokenCreatorParams = {
  contract: Address;
  tokenId: IntegerInput;
}

export type CollectionTokenCreatorResult = {
  contract: Address;
  tokenId: bigint;
  creator: Address;
}

export type CollectionRoyaltyInfoParams = {
  contract: Address;
  tokenId: IntegerInput;
  salePrice?: IntegerInput;
}

export type CollectionRoyaltyInfoResult = {
  contract: Address;
  tokenId: bigint;
  salePrice: bigint;
  receiver: Address;
  royaltyAmount: bigint;
  defaultReceiver?: Address;
  defaultPercentage?: bigint;
}

export type CollectionSetDefaultRoyaltyReceiverParams = {
  contract: Address;
  receiver: Address;
}

export type CollectionSetDefaultRoyaltyReceiverResult = {
  contract: Address;
  receiver: Address;
} & TransactionResult

export type CollectionSetTokenRoyaltyReceiverParams = {
  contract: Address;
  tokenId: IntegerInput;
  receiver: Address;
}

export type CollectionSetTokenRoyaltyReceiverResult = {
  contract: Address;
  tokenId: bigint;
  receiver: Address;
} & TransactionResult

export type CollectionRoyaltyRegistryStatusParams = {
  registry?: Address;
  contract: Address;
  tokenId: IntegerInput;
  salePrice?: IntegerInput;
}

export type CollectionRoyaltyRegistryStatusResult = {
  registry: Address;
  contract: Address;
  tokenId: bigint;
  salePrice: bigint;
  creatorRegistry: Address;
  receiver: Address;
  royaltyPercentage: number;
  royaltyAmount: bigint;
  configuredContractPercentage?: number;
  contractReceiver?: Address;
  tokenReceiver?: Address;
}

export type CollectionRoyaltyRegistryReceiverOverrideParams = {
  registry?: Address;
  receiver: Address;
}

export type CollectionRoyaltyRegistryReceiverOverrideResult = {
  registry: Address;
  receiver: Address;
} & TransactionResult

export type CollectionRoyaltyRegistryContractReceiverParams = {
  registry?: Address;
  contract: Address;
  receiver: Address;
}

export type CollectionRoyaltyRegistryContractReceiverResult = {
  registry: Address;
  contract: Address;
  receiver: Address;
} & TransactionResult

export type CollectionRoyaltyRegistryTokenReceiverParams = {
  registry?: Address;
  contract: Address;
  tokenId: IntegerInput;
  receiver: Address;
}

export type CollectionRoyaltyRegistryTokenReceiverResult = {
  registry: Address;
  contract: Address;
  tokenId: bigint;
  receiver: Address;
} & TransactionResult

export type CollectionRoyaltyRegistryContractPercentageParams = {
  registry?: Address;
  contract: Address;
  percentage: IntegerInput;
}

export type CollectionRoyaltyRegistryContractPercentageResult = {
  registry: Address;
  contract: Address;
  percentage: number;
} & TransactionResult

export type CollectionMintConfigParams = {
  contract: Address;
}

export type CollectionMintConfigResult = {
  contract: Address;
  tokenCount: bigint;
  baseUri: string;
  lockedMetadata: boolean;
}

export type CollectionUpdateBaseUriParams = {
  contract: Address;
  baseUri: string;
}

export type CollectionUpdateBaseUriResult = {
  contract: Address;
  baseUri: string;
} & TransactionResult

export type CollectionUpdateTokenUriParams = {
  contract: Address;
  tokenId: IntegerInput;
  tokenUri: string;
}

export type CollectionUpdateTokenUriResult = {
  contract: Address;
  tokenId: bigint;
  tokenUri: string;
} & TransactionResult

export type CollectionLockBaseUriParams = {
  contract: Address;
}

export type CollectionLockBaseUriResult = {
  contract: Address;
  baseUri: string;
} & TransactionResult

export type MintToParams = {
  contract: Address;
  tokenUri: string;
  to?: Address;
  royaltyReceiver?: Address;
}

export type MintToResult = {
  tokenId: bigint;
} & TransactionResult

export type AuctionCreateParams = {
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

export type AuctionBidParams = {
  contract: Address;
  tokenId: IntegerInput;
  amount: AmountInput;
  currency?: Address;
}

export type AuctionSettleParams = {
  contract: Address;
  tokenId: IntegerInput;
}

export type AuctionCancelParams = {
  contract: Address;
  tokenId: IntegerInput;
}

export type AuctionStatusParams = {
  contract: Address;
  tokenId: IntegerInput;
}

export type AuctionStatus = {
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

export type OfferCreateParams = {
  contract: Address;
  tokenId: IntegerInput;
  currency?: Address;
  amount: AmountInput;
}

export type OfferCancelParams = {
  contract: Address;
  tokenId: IntegerInput;
  currency?: Address;
}

export type OfferAcceptParams = {
  contract: Address;
  tokenId: IntegerInput;
  currency?: Address;
  amount: AmountInput;
  splitAddresses?: Address[];
  splitRatios?: number[];
}

export type OfferStatusParams = {
  contract: Address;
  tokenId: IntegerInput;
  currency?: Address;
}

export type OfferStatus = {
  buyer: Address;
  amount: bigint;
  timestamp: bigint;
  marketplaceFee: number;
  hasOffer: boolean;
  currency: Address;
  tokenOwner: Address | null;
  cancellableAfter: bigint | null;
  canAccept: boolean | null;
  canCancel: boolean | null;
}

export type ListingCreateParams = {
  contract: Address;
  tokenId: IntegerInput;
  currency?: Address;
  price: AmountInput;
  target?: Address;
  splitAddresses?: Address[];
  splitRatios?: number[];
  autoApprove?: boolean;
}

export type ListingCancelParams = {
  contract: Address;
  tokenId: IntegerInput;
  target?: Address;
}

export type ListingBuyParams = {
  contract: Address;
  tokenId: IntegerInput;
  currency?: Address;
  amount: AmountInput;
}

export type ListingStatusParams = {
  contract: Address;
  tokenId: IntegerInput;
  target?: Address;
}

export type ListingStatus = {
  seller: Address;
  currencyAddress: Address;
  amount: bigint;
  hasListing: boolean;
  isEth: boolean;
  target: Address;
  splitAddresses: Address[];
  splitRatios: number[];
  canBuy: boolean | null;
}

export type BatchListingTokenEntry = {
  contract: Address;
  tokenId: IntegerInput;
}

export type BatchListingRootArtifact = {
  root: `0x${string}`;
  currency: Address;
  amount: string;
  splitAddresses: Address[];
  splitRatios: number[];
  tokens: { contract: Address; tokenId: string }[];
  allowList?: { root: `0x${string}`; addresses: Address[]; endTimestamp?: string };
}

export type BatchListingProofArtifact = {
  root: `0x${string}`;
  contract: Address;
  tokenId: string;
  proof: `0x${string}`[];
  allowListProof?: `0x${string}`[];
  allowListAddress?: Address;
}

export type UtilsMerkleTokenEntry = BatchListingTokenEntry;
export type UtilsMerkleRootArtifact = BatchListingRootArtifact;
export type UtilsMerkleProofArtifact = BatchListingProofArtifact;

export type UtilsMerkleProofParams = {
  artifact: UtilsMerkleRootArtifact;
  contract: Address;
  tokenId: IntegerInput;
  buyer?: Address;
}

export type BatchListingCreateParams = {
  artifact: BatchListingRootArtifact;
  autoApprove?: boolean;
}

export type BatchListingCreateResult = {
  root: `0x${string}`;
  approvalTxHashes?: Hash[];
} & TransactionResult

export type BatchListingCancelParams = {
  root: `0x${string}`;
}

export type BatchListingBuyParams = {
  proofArtifact?: BatchListingProofArtifact;
  root?: `0x${string}`;
  contract?: Address;
  tokenId?: IntegerInput;
  creator: Address;
  currency: Address;
  amount: AmountInput;
}

export type BatchListingSetAllowListParams = {
  root: `0x${string}`;
  allowListRoot: `0x${string}`;
  endTimestamp: IntegerInput;
}

export type BatchListingStatusParams = {
  root?: `0x${string}`;
  creator: Address;
  contract?: Address;
  tokenId?: IntegerInput;
  proof?: `0x${string}`[];
}

export type BatchListingStatus = {
  root: `0x${string}`;
  seller: Address;
  currencyAddress: Address;
  amount: bigint;
  splitRecipients: Address[];
  splitRatios: number[];
  nonce: bigint;
  isEth: boolean;
  hasListing: boolean;
  allowList?: { root: `0x${string}`; endTimestamp: bigint };
  tokenInRoot?: boolean;
  tokenNonce?: bigint;
}

export type ReleaseConfigureParams = {
  contract: Address;
  currency?: Address;
  price: AmountInput;
  startTime?: TimestampInput;
  maxMints: IntegerInput;
  splitAddresses?: Address[];
  splitRatios?: number[];
}

export type ReleaseConfigureResult = {
  rareMinter: Address;
  contract: Address;
  currencyAddress: Address;
  price: bigint;
  startTime: bigint;
  maxMints: bigint;
  splitRecipients: Address[];
  splitRatios: number[];
} & TransactionResult

export type ReleaseMintDirectSaleParams = {
  contract: Address;
  quantity?: IntegerInput;
  currency?: Address;
  price?: AmountInput;
  proof?: readonly Hash[];
  recipient?: Address;
  autoApprove?: boolean;
}

export type ReleaseMintDirectSaleResult = {
  rareMinter: Address;
  contract: Address;
  buyer: Address;
  recipient: Address;
  quantity: number;
  currencyAddress: Address;
  price: bigint;
  totalPrice: bigint;
  requiredPayment: bigint;
  approvalTxHash?: Hash;
  allowlistRequired: boolean;
  tokenIdStart: bigint;
  tokenIdEnd: bigint;
  tokenIds: bigint[];
} & TransactionResult

export type ReleaseAllowlistWalletProof = {
  address: Address;
  leaf: Hash;
  proof: Hash[];
}

export type ReleaseAllowlistArtifact = {
  kind: 'rare-release-allowlist-v1';
  version: 1;
  leafEncoding: 'keccak256(address)';
  tree: 'sorted-addresses-sort-pairs';
  root: Hash;
  wallets: ReleaseAllowlistWalletProof[];
}

export type ReleaseAllowlistConfig = {
  rareMinter: Address;
  contract: Address;
  root: Hash;
  endTimestamp: bigint;
  active: boolean;
  now: bigint;
}

export type ReleaseLimitConfig = {
  rareMinter: Address;
  contract: Address;
  limit: bigint;
  enabled: boolean;
}

export type ReleaseSetAllowlistConfigParams = {
  contract: Address;
  root?: Hash;
  artifact?: ReleaseAllowlistArtifact;
  endTimestamp: TimestampInput;
}

export type ReleaseSetAllowlistConfigResult = {
  config: ReleaseAllowlistConfig;
} & TransactionResult

export type ReleaseSetLimitParams = {
  contract: Address;
  limit: IntegerInput;
}

export type ReleaseSetLimitResult = {
  config: ReleaseLimitConfig;
} & TransactionResult

export type ReleaseStatusParams = {
  contract: Address;
  account?: Address;
}

export type ReleaseStatus = {
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
  account: Address | null;
  accountMints: bigint | null;
  accountTxs: bigint | null;
  totalSupply: bigint | null;
  maxSupply: bigint | null;
  remainingSupply: bigint | null;
  soldOut: boolean | null;
  started: boolean;
  currentlyMintable: boolean;
  isEth: boolean;
  now: bigint;
}

export type BatchOfferCreateParams = {
  root?: Hex;
  artifact?: BatchTokenListArtifact;
  amount: AmountInput;
  currency?: Address;
  expiry: IntegerInput;
}

export type BatchOfferCreateResult = {
  batchOfferCreator: Address;
  creator: Address;
  root: Hex;
  amount: bigint;
  currency: Address;
  expiry: bigint;
  requiredPayment: bigint;
  approvalTxHash?: Hash;
} & TransactionResult

export type BatchOfferRevokeParams = {
  root?: Hex;
  artifact?: BatchTokenListArtifact;
}

export type BatchOfferRevokeResult = {
  batchOfferCreator: Address;
  creator: Address;
  root: Hex;
  amount: bigint;
  currency: Address;
} & TransactionResult

export type BatchOfferAcceptParams = {
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

export type BatchOfferAcceptResult = {
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
} & TransactionResult

export type BatchOfferStatusParams = {
  creator: Address;
  root?: Hex;
  artifact?: BatchTokenListArtifact;
}

export type BatchOfferStatus = {
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

export type BatchAuctionCreateParams = {
  root?: Hex;
  artifact?: BatchTokenListArtifact;
  reserveAmount: AmountInput;
  currency?: Address;
  duration: IntegerInput;
  splitAddresses?: Address[];
  splitRatios?: number[];
  autoApprove?: boolean;
}

export type BatchAuctionCreateResult = {
  batchAuctionHouse: Address;
  creator: Address;
  root: Hex;
  currency: Address;
  reserveAmount: bigint;
  duration: bigint;
  nonce: number;
  approvalTxHashes: Hash[];
} & TransactionResult

export type BatchAuctionCancelParams = {
  root?: Hex;
  artifact?: BatchTokenListArtifact;
}

export type BatchAuctionCancelResult = {
  batchAuctionHouse: Address;
  creator: Address;
  root: Hex;
} & TransactionResult

export type BatchAuctionBidParams = {
  creator: Address;
  root?: Hex;
  proof?: readonly Hex[];
  proofArtifact?: BatchTokenProofArtifact;
  contract: Address;
  tokenId: IntegerInput;
  currency?: Address;
  amount: AmountInput;
  autoApprove?: boolean;
}

export type BatchAuctionBidResult = {
  batchAuctionHouse: Address;
  bidder: Address;
  creator: Address;
  contract: Address;
  tokenId: bigint;
  root: Hex;
  currency: Address;
  amount: bigint;
  nonce: number;
  requiredPayment: bigint;
  approvalTxHash?: Hash;
} & TransactionResult

export type BatchAuctionSettleParams = {
  contract: Address;
  tokenId: IntegerInput;
}

export type BatchAuctionSettleResult = {
  batchAuctionHouse: Address;
  seller: Address;
  bidder: Address;
  contract: Address;
  tokenId: bigint;
  currency: Address;
  amount: bigint;
  marketplaceFee: number;
} & TransactionResult

export type BatchAuctionStatusParams = {
  contract: Address;
  tokenId: IntegerInput;
  creator?: Address;
  root?: Hex;
  artifact?: BatchTokenListArtifact;
  proof?: readonly Hex[];
  proofArtifact?: BatchTokenProofArtifact;
}

export type BatchAuctionStatus = {
  seller: Address;
  root: Hex | null;
  currency: Address;
  reserveAmount: bigint;
  duration: bigint;
  creationBlock: bigint;
  startingTime: bigint;
  endTime: bigint | null;
  splitAddresses: Address[];
  splitRatios: number[];
  hasRootConfig: boolean;
  rootNonce: number | null;
  tokenNonce: number | null;
  tokenNonceConsumed: boolean | null;
  hasAuction: boolean;
  started: boolean;
  ended: boolean;
  settlementEligible: boolean;
  currentBidder: Address | null;
  currentBid: bigint;
  currentBidCurrency: Address;
  currentBidMarketplaceFee: number;
  minimumNextBid: bigint;
  state: 'NONE' | 'CONFIGURED' | 'RESERVE_NOT_MET' | 'ACTIVE' | 'ENDED' | 'USED';
  isEth: boolean;
}

export type TokenContractInfo = {
  contract: Address;
  chain: SupportedChain;
  name: string;
  symbol: string;
  totalSupply: bigint | null;
}

export type TokenInfo = {
  contract: Address;
  tokenId: bigint;
  owner: Address;
  tokenUri: string;
}

export type GeneratePresetCurvesParams = {
  preset: CurvePresetKey;
  totalSupply?: AmountInput;
}

export type GeneratePresetCurvesResult = {
  preset: CurvePresetKey;
  rarePriceUsd: number;
  curves: LiquidCurveSegment[];
  preview: LiquidCurvePreview;
}

export type ValidateLiquidCurvesParams = {
  curves: LiquidCurveSegment[];
  totalSupply?: AmountInput;
}

export type DeployLiquidEditionParams = {
  name: string;
  symbol: string;
  tokenUri: string;
  initialRareLiquidity?: AmountInput;
  totalSupply?: AmountInput;
  curves: LiquidCurveSegment[];
}

export type DeployLiquidEditionResult = {
  contract: Address;
  tokenUri: string;
  curves: LiquidCurveSegment[];
} & TransactionResult

export type LiquidEditionPoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export type LiquidEditionPoolInfo = {
  contract: Address;
  poolId: Hex;
  poolKey: LiquidEditionPoolKey;
}

export type LiquidEditionMarketState = {
  rarePerToken: bigint;
  tokenPerRare: bigint;
  sqrtPriceX96: bigint;
  currentTick: number;
  liquidity: bigint;
  currentSupply: bigint;
}

export type LiquidEditionCurrentPrice = {
  contract: Address;
  rarePerToken: bigint;
  tokenPerRare: bigint;
}

export type LiquidEditionTelemetry = {
  contract: Address;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  maxTotalSupply: bigint;
  poolLaunchSupply: bigint;
  creatorLaunchReward: bigint;
  baseToken: Address;
  tokenCreator: Address;
  initialTokenUri: string;
  tokenUri: string;
  renderContract: Address;
  poolManager: Address;
  pool: LiquidEditionPoolInfo;
  lpTickLower: number;
  lpTickUpper: number;
  lpLiquidity: bigint;
  totalLiquidity: bigint;
  marketState: LiquidEditionMarketState;
  currentPrice: LiquidEditionCurrentPrice;
}

export type SetLiquidEditionRenderContractParams = {
  contract: Address;
  renderContract: Address;
}

export type SetLiquidEditionRenderContractResult = {
  contract: Address;
  renderContract: Address;
} & TransactionResult

export type RouterBuyParams = {
  token: Address;
  ethAmount: AmountInput;
  minTokensOut: AmountInput;
  commands: `0x${string}`;
  inputs: readonly `0x${string}`[];
  recipient?: Address;
  deadline?: IntegerInput;
}

export type RouterSellParams = {
  token: Address;
  tokenAmount: AmountInput;
  minEthOut: AmountInput;
  commands: `0x${string}`;
  inputs: readonly `0x${string}`[];
  recipient?: Address;
  deadline?: IntegerInput;
}

export type RouterSwapParams = {
  tokenIn: Address;
  amountIn: AmountInput;
  tokenOut: Address;
  minAmountOut: AmountInput;
  commands: `0x${string}`;
  inputs: readonly `0x${string}`[];
  recipient?: Address;
  deadline?: IntegerInput;
}

export type BuyRareParams = {
  ethAmount: AmountInput;
  minRareOut?: AmountInput;
  slippageBps?: IntegerInput;
  recipient?: Address;
  deadline?: IntegerInput;
}

export type BuyTokenParams = {
  token: Address;
  ethAmount: AmountInput;
  minTokensOut?: AmountInput;
  slippageBps?: IntegerInput;
  recipient?: Address;
  deadline?: IntegerInput;
}

export type SellTokenParams = {
  token: Address;
  tokenAmount: AmountInput;
  minEthOut?: AmountInput;
  slippageBps?: IntegerInput;
  recipient?: Address;
  deadline?: IntegerInput;
}

export type TokenTradeRouteSource = 'liquid-edition' | 'known-pool' | 'uniswap-api';
export type TokenTradeExecution = 'liquid-router' | 'uniswap-api';

export type TokenTradeQuoteBase = {
  amountIn: bigint;
  estimatedAmountOut: bigint;
  minAmountOut: bigint;
  tokenIn: Address;
  tokenOut: Address;
  inputDecimals: number;
  outputDecimals: number;
  slippageBps: number;
  routeDescription: string;
}

export type LiquidRouterTokenTradeQuote = {
  routeSource: Extract<TokenTradeRouteSource, 'liquid-edition' | 'known-pool'>;
  execution: 'liquid-router';
  commands: `0x${string}`;
  inputs: readonly `0x${string}`[];
} & TokenTradeQuoteBase

export type UniswapApiTokenTradeQuote = {
  routeSource: 'uniswap-api';
  execution: 'uniswap-api';
} & TokenTradeQuoteBase

export type TokenTradeQuote = LiquidRouterTokenTradeQuote | UniswapApiTokenTradeQuote;

export type TokenTradeResult = {
  estimatedAmountOut: bigint;
  minAmountOut: bigint;
  routeSource: TokenTradeRouteSource;
  execution: TokenTradeExecution;
  commands?: `0x${string}`;
  inputs?: readonly `0x${string}`[];
  approvalTxHash?: Hash;
  approvalResetTxHash?: Hash;
} & TransactionResult

export type BuyRareQuote = {
  ethAmount: bigint;
  rareAddress: Address;
  estimatedRareOut: bigint;
  minRareOut: bigint;
  slippageBps: number;
  commands: `0x${string}`;
  inputs: readonly `0x${string}`[];
}

export type BuyRareResult = {
  estimatedRareOut: bigint;
  minRareOut: bigint;
  commands: `0x${string}`;
  inputs: readonly `0x${string}`[];
} & TransactionResult

export type ReleaseNamespace = {
  buildAllowlistArtifact: (params: { input: string; format: 'csv' | 'json' }) => ReleaseAllowlistArtifact;
  parseAllowlistArtifact: (params: { input: string }) => ReleaseAllowlistArtifact;
  getAllowlistProof: (params: { artifact: ReleaseAllowlistArtifact; address: Address }) => ReleaseAllowlistWalletProof | null;
  configure: (params: ReleaseConfigureParams) => Promise<ReleaseConfigureResult>;
  getAllowlistConfig: (params: { contract: Address }) => Promise<ReleaseAllowlistConfig>;
  setAllowlistConfig: (params: ReleaseSetAllowlistConfigParams) => Promise<ReleaseSetAllowlistConfigResult>;
  clearAllowlistConfig: (params: { contract: Address }) => Promise<ReleaseSetAllowlistConfigResult>;
  getMintLimit: (params: { contract: Address }) => Promise<ReleaseLimitConfig>;
  setMintLimit: (params: ReleaseSetLimitParams) => Promise<ReleaseSetLimitResult>;
  getTxLimit: (params: { contract: Address }) => Promise<ReleaseLimitConfig>;
  setTxLimit: (params: ReleaseSetLimitParams) => Promise<ReleaseSetLimitResult>;
  mintDirectSale: (params: ReleaseMintDirectSaleParams) => Promise<ReleaseMintDirectSaleResult>;
  getStatus: (params: ReleaseStatusParams) => Promise<ReleaseStatus>;
}

export type ListingMarketplaceNamespace = {
  create: (params: ListingCreateParams) => Promise<TransactionResult & { approvalTxHash?: Hash }>;
  cancel: (params: ListingCancelParams) => Promise<TransactionResult>;
  buy: (params: ListingBuyParams) => Promise<TransactionResult>;
  getStatus: (params: ListingStatusParams) => Promise<ListingStatus>;
}

export type ListingNamespace = ListingMarketplaceNamespace & {
  release: ReleaseNamespace;
}

export type RareClient = {
  chain: SupportedChain;
  chainId: number;
  contracts: {
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
  };
  deploy: {
    erc721: (params: DeployErc721Params) => Promise<DeployErc721Result>;
    lazyBatchMint: (params: DeployLazyBatchMintParams) => Promise<DeployLazyBatchMintResult>;
  };
  liquid: {
    getFactoryConfig: () => Promise<LiquidFactoryConfig>;
    generatePresetCurves: (params: GeneratePresetCurvesParams) => Promise<GeneratePresetCurvesResult>;
    validateCurves: (params: ValidateLiquidCurvesParams) => Promise<LiquidCurvePreview>;
    deployMultiCurve: (params: DeployLiquidEditionParams) => Promise<DeployLiquidEditionResult>;
    getTokenUri: (params: { contract: Address }) => Promise<string>;
    getRenderContract: (params: { contract: Address }) => Promise<Address>;
    setRenderContract: (params: SetLiquidEditionRenderContractParams) => Promise<SetLiquidEditionRenderContractResult>;
    getPoolInfo: (params: { contract: Address }) => Promise<LiquidEditionPoolInfo>;
    getMarketState: (params: { contract: Address }) => Promise<LiquidEditionMarketState>;
    getCurrentPrice: (params: { contract: Address }) => Promise<LiquidEditionCurrentPrice>;
    getTelemetry: (params: { contract: Address }) => Promise<LiquidEditionTelemetry>;
  };
  mint: {
    mintTo: (params: MintToParams) => Promise<MintToResult>;
  };
  swap: {
    buy: (params: RouterBuyParams) => Promise<TransactionResult>;
    sell: (params: RouterSellParams) => Promise<TransactionResult>;
    swap: (params: RouterSwapParams) => Promise<TransactionResult>;
    quoteBuyToken: (params: BuyTokenParams) => Promise<TokenTradeQuote>;
    buyToken: (params: BuyTokenParams) => Promise<TokenTradeResult>;
    quoteSellToken: (params: SellTokenParams) => Promise<TokenTradeQuote>;
    sellToken: (params: SellTokenParams) => Promise<TokenTradeResult>;
    quoteBuyRare: (params: BuyRareParams) => Promise<BuyRareQuote>;
    buyRare: (params: BuyRareParams) => Promise<BuyRareResult>;
  };
  auction: {
    create: (params: AuctionCreateParams) => Promise<TransactionResult & { approvalTxHash?: Hash; auctionType: 'reserve' | 'scheduled'; startTime: bigint }>;
    bid: (params: AuctionBidParams) => Promise<TransactionResult>;
    settle: (params: AuctionSettleParams) => Promise<TransactionResult>;
    cancel: (params: AuctionCancelParams) => Promise<TransactionResult>;
    getStatus: (params: AuctionStatusParams) => Promise<AuctionStatus>;
  };
  offer: {
    create: (params: OfferCreateParams) => Promise<TransactionResult>;
    cancel: (params: OfferCancelParams) => Promise<TransactionResult>;
    accept: (params: OfferAcceptParams) => Promise<TransactionResult>;
    getStatus: (params: OfferStatusParams) => Promise<OfferStatus>;
  };
  listing: ListingNamespace;
  batchListing: {
    create: (params: BatchListingCreateParams) => Promise<BatchListingCreateResult>;
    cancel: (params: BatchListingCancelParams) => Promise<TransactionResult>;
    buy: (params: BatchListingBuyParams) => Promise<TransactionResult>;
    setAllowList: (params: BatchListingSetAllowListParams) => Promise<TransactionResult>;
    getStatus: (params: BatchListingStatusParams) => Promise<BatchListingStatus>;
  };
  batch: {
    buildTree: (params: BuildBatchTokenTreeParams) => BatchTokenListArtifact;
    getTreeProof: (params: BatchTokenProofParams) => BatchTokenProofArtifact;
    verifyTreeProof: (params: BatchTokenProofVerifyParams) => boolean;
    offer: {
      create: (params: BatchOfferCreateParams) => Promise<BatchOfferCreateResult>;
      revoke: (params: BatchOfferRevokeParams) => Promise<BatchOfferRevokeResult>;
      accept: (params: BatchOfferAcceptParams) => Promise<BatchOfferAcceptResult>;
      getStatus: (params: BatchOfferStatusParams) => Promise<BatchOfferStatus>;
    };
    auction: {
      create: (params: BatchAuctionCreateParams) => Promise<BatchAuctionCreateResult>;
      cancel: (params: BatchAuctionCancelParams) => Promise<BatchAuctionCancelResult>;
      bid: (params: BatchAuctionBidParams) => Promise<BatchAuctionBidResult>;
      settle: (params: BatchAuctionSettleParams) => Promise<BatchAuctionSettleResult>;
      getStatus: (params: BatchAuctionStatusParams) => Promise<BatchAuctionStatus>;
    };
  };
  utils: {
    tree: {
      build: (params: BuildUtilsTreeParams) => UtilsTreeArtifact;
      proof: (params: UtilsTreeProofParams) => UtilsTreeProofArtifact;
      verify: (params: UtilsTreeProofVerifyParams) => boolean;
    };
    merkle: {
      proof: (params: UtilsMerkleProofParams) => UtilsMerkleProofArtifact;
    };
  };
  search: {
    nfts: (params?: NftSearchParams) => Promise<SearchPageResponse<Nft>>;
    collections: (params?: CollectionSearchParams) => Promise<SearchPageResponse<Collection>>;
  };
  nft: {
    get: (universalTokenId: string) => Promise<Nft>;
    events: (universalTokenId: string, opts?: NftEventOptions) => Promise<SearchPageResponse<NftEvent>>;
  };
  collection: {
    get: (id: string) => Promise<Collection>;
    events: (id: string, opts?: CollectionEventOptions) => Promise<SearchPageResponse<NftEvent>>;
    createSovereign: (params: CreateSovereignCollectionParams) => Promise<CreateSovereignCollectionResult>;
    createLazySovereign: (params: CreateLazySovereignCollectionParams) => Promise<CreateLazySovereignCollectionResult>;
    mintBatch: (params: CollectionMintBatchParams) => Promise<CollectionMintBatchResult>;
    prepareLazyMint: (params: CollectionPrepareLazyMintParams) => Promise<CollectionPrepareLazyMintResult>;
    getTokenCreator: (params: CollectionTokenCreatorParams) => Promise<CollectionTokenCreatorResult>;
    getRoyaltyInfo: (params: CollectionRoyaltyInfoParams) => Promise<CollectionRoyaltyInfoResult>;
    setDefaultRoyaltyReceiver: (params: CollectionSetDefaultRoyaltyReceiverParams) => Promise<CollectionSetDefaultRoyaltyReceiverResult>;
    setTokenRoyaltyReceiver: (params: CollectionSetTokenRoyaltyReceiverParams) => Promise<CollectionSetTokenRoyaltyReceiverResult>;
    getRoyaltyRegistryStatus: (params: CollectionRoyaltyRegistryStatusParams) => Promise<CollectionRoyaltyRegistryStatusResult>;
    setRoyaltyRegistryReceiverOverride: (params: CollectionRoyaltyRegistryReceiverOverrideParams) => Promise<CollectionRoyaltyRegistryReceiverOverrideResult>;
    setRoyaltyRegistryContractReceiver: (params: CollectionRoyaltyRegistryContractReceiverParams) => Promise<CollectionRoyaltyRegistryContractReceiverResult>;
    setRoyaltyRegistryTokenReceiver: (params: CollectionRoyaltyRegistryTokenReceiverParams) => Promise<CollectionRoyaltyRegistryTokenReceiverResult>;
    setRoyaltyRegistryContractPercentage: (params: CollectionRoyaltyRegistryContractPercentageParams) => Promise<CollectionRoyaltyRegistryContractPercentageResult>;
    getMintConfig: (params: CollectionMintConfigParams) => Promise<CollectionMintConfigResult>;
    updateBaseUri: (params: CollectionUpdateBaseUriParams) => Promise<CollectionUpdateBaseUriResult>;
    updateTokenUri: (params: CollectionUpdateTokenUriParams) => Promise<CollectionUpdateTokenUriResult>;
    lockBaseUri: (params: CollectionLockBaseUriParams) => Promise<CollectionLockBaseUriResult>;
  };
  user: {
    get: (address: string) => Promise<UserProfile>;
  };
  media: {
    upload: (buffer: Uint8Array, filename: string) => Promise<NftMediaEntry>;
    pinMetadata: (opts: PinMetadataParams) => Promise<string>;
  };
  import: {
    erc721: (params: ImportErc721Params) => Promise<void>;
  };
  token: {
    getContractInfo: (params: { contract: Address }) => Promise<TokenContractInfo>;
    getTokenInfo: (params: { contract: Address; tokenId: IntegerInput }) => Promise<TokenInfo>;
    getPrice: (symbol: string) => Promise<{ symbol: string; priceUsd: number; decimals: number; chainId: number; address: string }>;
  };
}
