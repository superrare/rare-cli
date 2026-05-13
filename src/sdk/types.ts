import type { Address, Hash, PublicClient, TransactionReceipt, WalletClient } from 'viem';
import type { SupportedChain } from '../contracts/addresses.js';
import type { CurvePresetKey, LiquidCurvePreview, LiquidCurveSegment } from '../liquid/curve-config.js';
import type { LiquidFactoryConfig } from '../liquid/factory-config.js';
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
  splitAddresses: Address[];
  splitRatios: number[];
  isEth: boolean;
  started: boolean;
  endTime: bigint | null;
  status: 'PENDING' | 'RUNNING' | 'ENDED';
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

export type BatchListingCreateParams = {
  artifact: BatchListingRootArtifact;
  autoApprove?: boolean;
}

export type BatchListingCreateResult = {
  approvalTxHashes?: Hash[];
} & TransactionResult

export type BatchListingCancelParams = {
  root: `0x${string}`;
}

export type BatchListingBuyParams = {
  proofArtifact: BatchListingProofArtifact;
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
  root: `0x${string}`;
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

export type TokenContractInfo = {
  contract: Address;
  chain: SupportedChain;
  name: string;
  symbol: string;
  totalSupply: bigint;
}

export type TokenInfo = {
  contract: Address;
  tokenId: bigint;
  owner: Address;
  tokenUri: string;
}

export type GeneratePresetCurvesParams = {
  preset: CurvePresetKey;
}

export type GeneratePresetCurvesResult = {
  preset: CurvePresetKey;
  rarePriceUsd: number;
  curves: LiquidCurveSegment[];
  preview: LiquidCurvePreview;
}

export type ValidateLiquidCurvesParams = {
  curves: LiquidCurveSegment[];
}

export type DeployLiquidEditionParams = {
  name: string;
  symbol: string;
  tokenUri: string;
  initialRareLiquidity?: AmountInput;
  curves: LiquidCurveSegment[];
}

export type DeployLiquidEditionResult = {
  contract: Address;
  tokenUri: string;
  curves: LiquidCurveSegment[];
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

export type RareClient = {
  chain: SupportedChain;
  chainId: number;
  contracts: {
    factory: Address;
    auction: Address;
    rareMinter?: Address;
    lazyBatchMintFactory?: Address;
    batchListing?: Address;
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
    create: (params: AuctionCreateParams) => Promise<TransactionResult & { approvalTxHash?: Hash }>;
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
  listing: {
    create: (params: ListingCreateParams) => Promise<TransactionResult & { approvalTxHash?: Hash }>;
    cancel: (params: ListingCancelParams) => Promise<TransactionResult>;
    buy: (params: ListingBuyParams) => Promise<TransactionResult>;
    getStatus: (params: ListingStatusParams) => Promise<ListingStatus>;
  };
  batchListing: {
    create: (params: BatchListingCreateParams) => Promise<BatchListingCreateResult>;
    cancel: (params: BatchListingCancelParams) => Promise<TransactionResult>;
    buy: (params: BatchListingBuyParams) => Promise<TransactionResult>;
    setAllowList: (params: BatchListingSetAllowListParams) => Promise<TransactionResult>;
    getStatus: (params: BatchListingStatusParams) => Promise<BatchListingStatus>;
  };
  release: {
    configure(params: ReleaseConfigureParams): Promise<ReleaseConfigureResult>;
    getStatus(params: ReleaseStatusParams): Promise<ReleaseStatus>;
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
