import type { Address, Hash, Hex } from 'viem';
import type { AmountInput, CurrencyInput, IntegerInput, TimestampInput, TransactionResult } from './common.js';
import type {
  ReleaseAllowlistArtifact,
  ReleaseAllowlistWalletProof,
} from './release.js';

export type DeployErc1155Params = {
  name: string;
  symbol: string;
  baseUri: string;
}

export type DeployErc1155Result = {
  contract: Address;
  factory: Address;
  defaultMinter: Address;
} & TransactionResult

export type Erc1155MintBatchItemInput = {
  tokenId: IntegerInput;
  quantity: IntegerInput;
}

export type Erc1155CollectionCreateTokenParams = {
  contract: Address;
  maxSupply: IntegerInput;
  tokenUri?: string;
  royaltyReceiver?: Address;
}

export type Erc1155CollectionCreateTokenResult = {
  contract: Address;
  tokenId: bigint;
  maxSupply: bigint;
  tokenUri: string;
  royaltyReceiver: Address;
} & TransactionResult

export type Erc1155CollectionMintParams = {
  contract: Address;
  tokenId: IntegerInput;
  quantity: IntegerInput;
  to?: Address;
}

export type Erc1155CollectionMintResult = {
  contract: Address;
  tokenId: bigint;
  quantity: bigint;
  to: Address;
} & TransactionResult

export type Erc1155CollectionMintBatchParams = {
  contract: Address;
  to?: Address;
  items: Erc1155MintBatchItemInput[];
}

export type Erc1155CollectionMintBatchResult = {
  contract: Address;
  to: Address;
  items: Erc1155MintBatchItem[];
} & TransactionResult

export type Erc1155CollectionSetMinterApprovalParams = {
  contract: Address;
  minter: Address;
  approved: boolean;
}

export type Erc1155CollectionSetMinterApprovalResult = {
  contract: Address;
  minter: Address;
  approved: boolean;
} & TransactionResult

export type Erc1155CollectionUpdateTokenUriParams = {
  contract: Address;
  tokenId: IntegerInput;
  tokenUri: string;
}

export type Erc1155CollectionUpdateTokenUriResult = {
  contract: Address;
  tokenId: bigint;
  tokenUri: string;
} & TransactionResult

export type Erc1155CollectionDisableParams = {
  contract: Address;
}

export type Erc1155CollectionDisableResult = {
  contract: Address;
} & TransactionResult

export type Erc1155CollectionStatusParams = {
  contract: Address;
  tokenId?: IntegerInput;
  account?: Address;
}

export type Erc1155CollectionStatus = {
  contract: Address;
  name?: string;
  symbol?: string;
  owner?: Address;
  disabled?: boolean;
  maxBatchSize?: bigint;
  account?: Address;
  accountApprovedMinter?: boolean;
  token?: {
    tokenId: bigint;
    uri?: string;
    maxSupply?: bigint;
    totalMinted?: bigint;
    accountBalance?: bigint;
    royalty?: {
      salePrice: bigint;
      receiver: Address;
      amount: bigint;
    };
  };
}

export type Erc1155MintBatchItem = {
  tokenId: bigint;
  quantity: bigint;
}

export type Erc1155ListingCreateParams = {
  contract: Address;
  tokenId: IntegerInput;
  quantity: IntegerInput;
  price: AmountInput;
  currency?: CurrencyInput;
  expirationTime?: TimestampInput;
  splitAddresses?: Address[];
  splitRatios?: number[];
  autoApprove?: boolean;
}

export type Erc1155ListingCreateResult = {
  approvalTxHash?: Hash;
} & TransactionResult

export type Erc1155ListingCreateBatchItemInput = {
  tokenId: IntegerInput;
  quantity: IntegerInput;
  price: AmountInput;
  expirationTime?: TimestampInput;
}

export type Erc1155ListingCreateBatchParams = {
  contract: Address;
  currency?: CurrencyInput;
  items: Erc1155ListingCreateBatchItemInput[];
  splitAddresses?: Address[];
  splitRatios?: number[];
  autoApprove?: boolean;
}

export type Erc1155ListingCreateBatchItem = {
  tokenId: bigint;
  quantity: bigint;
  price: bigint;
  expirationTime: bigint;
}

export type Erc1155ListingCreateBatchResult = {
  contract: Address;
  currencyAddress: Address;
  items: Erc1155ListingCreateBatchItem[];
  splitAddresses: Address[];
  splitRatios: number[];
  approvalTxHash?: Hash;
} & TransactionResult

export type Erc1155ListingCancelParams = {
  contract: Address;
  tokenIds: IntegerInput[];
}

export type Erc1155ListingBuyParams = {
  contract: Address;
  seller: Address;
  tokenId: IntegerInput;
  quantity: IntegerInput;
  price: AmountInput;
  currency?: CurrencyInput;
  recipient?: Address;
  autoApprove?: boolean;
}

export type Erc1155ListingBuyResult = {
  buyer: Address;
  recipient: Address;
  approvalTxHash?: Hash;
} & TransactionResult

export type Erc1155CheckoutReleaseItemInput = {
  kind: 'release';
  contract: Address;
  tokenId: IntegerInput;
  quantity: IntegerInput;
  price?: AmountInput;
  currency?: CurrencyInput;
  proof?: readonly Hex[];
}

export type Erc1155CheckoutListingItemInput = {
  kind: 'listing';
  contract: Address;
  seller: Address;
  tokenId: IntegerInput;
  quantity: IntegerInput;
  price: AmountInput;
  currency?: CurrencyInput;
}

export type Erc1155CheckoutItemInput = Erc1155CheckoutReleaseItemInput | Erc1155CheckoutListingItemInput;

export type Erc1155CheckoutParams = {
  items: Erc1155CheckoutItemInput[];
  recipient?: Address;
  autoApprove?: boolean;
}

export type Erc1155CheckoutPayment = {
  currencyAddress: Address;
  requiredAmount: bigint;
  approvalTxHash?: Hash;
}

export type Erc1155CheckoutItemKind = 'release' | 'listing' | 'unknown';
export type Erc1155CheckoutFailureStageName =
  | 'NONE'
  | 'VALIDATION'
  | 'PAYMENT_COLLECTION'
  | 'MINT'
  | 'TRANSFER'
  | 'PAYOUT'
  | 'UNKNOWN';

export type Erc1155CheckoutDecodedFailure = {
  errorName: string;
  args: readonly unknown[];
}

export type Erc1155CheckoutSummary = {
  payer: Address | null;
  recipient: Address | null;
  filledCount: bigint;
  skippedCount: bigint;
  ethSpent: bigint;
  ethRefunded: bigint;
}

export type Erc1155CheckoutFilledItem = {
  index: number;
  status: 'filled';
  filled: true;
  kind: Erc1155CheckoutItemKind;
  itemKind: number;
  contract: Address;
  tokenId: bigint;
  seller: Address;
  currencyAddress: Address;
  price: bigint;
  quantity: bigint;
  failureStage: number;
  failureStageName: Erc1155CheckoutFailureStageName;
  reason: Hex;
  failureData: Hex;
  totalPaid: bigint;
}

export type Erc1155CheckoutSkippedItem = {
  index: number;
  status: 'skipped';
  filled: false;
  kind: Erc1155CheckoutItemKind;
  itemKind: number;
  contract: Address;
  tokenId: bigint;
  seller: Address;
  currencyAddress: Address;
  price: bigint;
  quantity: bigint;
  failureStage: number;
  failureStageName: Erc1155CheckoutFailureStageName;
  reason: Hex;
  failureData: Hex;
  decodedFailure?: Erc1155CheckoutDecodedFailure;
  totalPaid: bigint;
}

export type Erc1155CheckoutExecution = {
  marketplace: Address;
  summary: Erc1155CheckoutSummary;
  items: Array<Erc1155CheckoutFilledItem | Erc1155CheckoutSkippedItem>;
}

export type Erc1155CheckoutResult = {
  marketplace: Address;
  summary: Erc1155CheckoutSummary;
  items: Array<Erc1155CheckoutFilledItem | Erc1155CheckoutSkippedItem>;
  payments: Erc1155CheckoutPayment[];
  approvalTxHashes: Hash[];
} & TransactionResult

export type Erc1155ListingStatusParams = {
  contract: Address;
  seller: Address;
  tokenId: IntegerInput;
}

export type Erc1155ListingStatus = {
  seller: Address;
  currencyAddress: Address;
  price: bigint;
  quantity: bigint;
  expirationTime: bigint;
  hasListing: boolean;
  isEth: boolean;
  expired: boolean;
  splitAddresses: Address[];
  splitRatios: number[];
  canBuy: boolean | null;
}

export type Erc1155OfferCreateParams = {
  contract: Address;
  tokenId: IntegerInput;
  quantity: IntegerInput;
  price: AmountInput;
  currency?: CurrencyInput;
  expirationTime?: TimestampInput;
  autoApprove?: boolean;
}

export type Erc1155OfferCreateResult = {
  approvalTxHash?: Hash;
} & TransactionResult

export type Erc1155OfferCancelParams = {
  contract: Address;
  tokenId: IntegerInput;
  currency?: CurrencyInput;
}

export type Erc1155OfferAcceptParams = {
  contract: Address;
  tokenId: IntegerInput;
  buyer: Address;
  quantity: IntegerInput;
  price: AmountInput;
  currency?: CurrencyInput;
  splitAddresses?: Address[];
  splitRatios?: number[];
  autoApprove?: boolean;
}

export type Erc1155OfferAcceptResult = {
  approvalTxHash?: Hash;
} & TransactionResult

export type Erc1155OfferStatusParams = {
  contract: Address;
  tokenId: IntegerInput;
  buyer?: Address;
  currency?: CurrencyInput;
}

export type Erc1155OfferStatus = {
  buyer: Address;
  currencyAddress: Address;
  price: bigint;
  quantity: bigint;
  marketplaceFeeRemaining: bigint;
  expirationTime: bigint;
  hasOffer: boolean;
  isEth: boolean;
  expired: boolean;
  canAccept: boolean | null;
  canCancel: boolean | null;
}

export type Erc1155ReleaseConfigureParams = {
  contract: Address;
  tokenId: IntegerInput;
  price: AmountInput;
  currency?: CurrencyInput;
  startTime?: TimestampInput;
  maxMints: IntegerInput;
  splitAddresses?: Address[];
  splitRatios?: number[];
  autoApprove?: boolean;
}

export type Erc1155ReleaseConfigureResult = {
  marketplace: Address;
  contract: Address;
  tokenId: bigint;
  currencyAddress: Address;
  price: bigint;
  startTime: bigint;
  maxMints: bigint;
  splitRecipients: Address[];
  splitRatios: number[];
  approvalTxHash?: Hash;
} & TransactionResult

export type Erc1155ReleaseConfigureBatchItemInput = {
  tokenId: IntegerInput;
  price: AmountInput;
  startTime?: TimestampInput;
  maxMints: IntegerInput;
}

export type Erc1155ReleaseConfigureBatchParams = {
  contract: Address;
  currency?: CurrencyInput;
  items: Erc1155ReleaseConfigureBatchItemInput[];
  splitAddresses?: Address[];
  splitRatios?: number[];
  autoApprove?: boolean;
}

export type Erc1155ReleaseConfigureBatchItem = {
  tokenId: bigint;
  price: bigint;
  startTime: bigint;
  maxMints: bigint;
}

export type Erc1155ReleaseConfigureBatchResult = {
  marketplace: Address;
  contract: Address;
  currencyAddress: Address;
  items: Erc1155ReleaseConfigureBatchItem[];
  splitRecipients: Address[];
  splitRatios: number[];
  approvalTxHash?: Hash;
} & TransactionResult

export type Erc1155ReleaseCancelParams = {
  contract: Address;
  tokenIds: IntegerInput[];
}

export type Erc1155ReleaseCancelResult = {
  marketplace: Address;
  contract: Address;
  tokenIds: bigint[];
} & TransactionResult

export type Erc1155ReleaseMintParams = {
  contract: Address;
  tokenId: IntegerInput;
  quantity: IntegerInput;
  price?: AmountInput;
  currency?: CurrencyInput;
  proof?: readonly Hex[];
  recipient?: Address;
  autoApprove?: boolean;
}

export type Erc1155ReleaseMintResult = {
  marketplace: Address;
  contract: Address;
  tokenId: bigint;
  buyer: Address;
  seller: Address;
  quantity: bigint;
  currencyAddress: Address;
  price: bigint;
  totalPrice: bigint;
  requiredPayment: bigint;
  recipient: Address;
  approvalTxHash?: Hash;
  allowlistRequired: boolean;
} & TransactionResult

export type Erc1155ReleaseAllowlistConfig = {
  marketplace: Address;
  contract: Address;
  tokenId: bigint;
  root: Hex;
  endTimestamp: bigint;
  active: boolean;
  now: bigint;
}

export type Erc1155ReleaseSetAllowlistConfigParams = {
  contract: Address;
  tokenId: IntegerInput;
  root?: Hex;
  artifact?: ReleaseAllowlistArtifact;
  endTime: TimestampInput;
}

export type Erc1155ReleaseSetAllowlistConfigResult = {
  config: Erc1155ReleaseAllowlistConfig;
} & TransactionResult

export type Erc1155ReleaseSetAllowlistConfigBatchItemInput = {
  tokenId: IntegerInput;
  root?: Hex;
  artifact?: ReleaseAllowlistArtifact;
  endTime: TimestampInput;
}

export type Erc1155ReleaseSetAllowlistConfigBatchParams = {
  contract: Address;
  items: Erc1155ReleaseSetAllowlistConfigBatchItemInput[];
}

export type Erc1155ReleaseSetAllowlistConfigBatchResult = {
  configs: Erc1155ReleaseAllowlistConfig[];
} & TransactionResult

export type Erc1155ReleaseSetLimitParams = {
  contract: Address;
  tokenId: IntegerInput;
  limit: IntegerInput;
}

export type Erc1155ReleaseLimitConfig = {
  marketplace: Address;
  contract: Address;
  tokenId: bigint;
  limit: bigint;
  enabled: boolean;
}

export type Erc1155ReleaseSetLimitResult = {
  config: Erc1155ReleaseLimitConfig;
} & TransactionResult

export type Erc1155ReleaseSetLimitBatchItemInput = {
  tokenId: IntegerInput;
  limit: IntegerInput;
}

export type Erc1155ReleaseSetLimitBatchParams = {
  contract: Address;
  items: Erc1155ReleaseSetLimitBatchItemInput[];
}

export type Erc1155ReleaseSetLimitBatchResult = {
  configs: Erc1155ReleaseLimitConfig[];
} & TransactionResult

export type Erc1155ReleaseStatusParams = {
  contract: Address;
  tokenId: IntegerInput;
  account?: Address;
}

export type Erc1155ReleaseStatus = {
  marketplace: Address;
  contract: Address;
  tokenId: bigint;
  configured: boolean;
  seller: Address;
  currencyAddress: Address;
  price: bigint;
  startTime: bigint;
  maxMints: bigint;
  splitRecipients: Address[];
  splitRatios: number[];
  allowlistRoot: Hex;
  allowlistEndTimestamp: bigint;
  allowlistActive: boolean;
  requiresAllowlist: boolean;
  mintLimit: bigint;
  txLimit: bigint;
  account: Address | null;
  accountMints: bigint | null;
  accountTxs: bigint | null;
  maxSupply: bigint | null;
  totalMinted: bigint | null;
  remainingSupply: bigint | null;
  soldOut: boolean | null;
  started: boolean;
  currentlyMintable: boolean;
  isEth: boolean;
  now: bigint;
}

export type Erc1155ReleaseNamespace = {
  allowlist: {
    getConfig: (params: { contract: Address; tokenId: IntegerInput }) => Promise<Erc1155ReleaseAllowlistConfig>;
    setConfig: (params: Erc1155ReleaseSetAllowlistConfigParams) => Promise<Erc1155ReleaseSetAllowlistConfigResult>;
    setConfigBatch: (params: Erc1155ReleaseSetAllowlistConfigBatchParams) => Promise<Erc1155ReleaseSetAllowlistConfigBatchResult>;
    clear: (params: { contract: Address; tokenId: IntegerInput }) => Promise<Erc1155ReleaseSetAllowlistConfigResult>;
    build: (params: { input: string; format: 'csv' | 'json' }) => ReleaseAllowlistArtifact;
    parse: (params: { input: string }) => ReleaseAllowlistArtifact;
    proof: (params: { artifact: ReleaseAllowlistArtifact; address: Address }) => ReleaseAllowlistWalletProof | null;
  };
  limits: {
    getMint: (params: { contract: Address; tokenId: IntegerInput }) => Promise<Erc1155ReleaseLimitConfig>;
    setMint: (params: Erc1155ReleaseSetLimitParams) => Promise<Erc1155ReleaseSetLimitResult>;
    setMintBatch: (params: Erc1155ReleaseSetLimitBatchParams) => Promise<Erc1155ReleaseSetLimitBatchResult>;
    getTx: (params: { contract: Address; tokenId: IntegerInput }) => Promise<Erc1155ReleaseLimitConfig>;
    setTx: (params: Erc1155ReleaseSetLimitParams) => Promise<Erc1155ReleaseSetLimitResult>;
    setTxBatch: (params: Erc1155ReleaseSetLimitBatchParams) => Promise<Erc1155ReleaseSetLimitBatchResult>;
  };
  configure: (params: Erc1155ReleaseConfigureParams) => Promise<Erc1155ReleaseConfigureResult>;
  configureBatch: (params: Erc1155ReleaseConfigureBatchParams) => Promise<Erc1155ReleaseConfigureBatchResult>;
  cancel: (params: Erc1155ReleaseCancelParams) => Promise<Erc1155ReleaseCancelResult>;
  mint: (params: Erc1155ReleaseMintParams) => Promise<Erc1155ReleaseMintResult>;
  status: (params: Erc1155ReleaseStatusParams) => Promise<Erc1155ReleaseStatus>;
}

export type Erc1155ListingNamespace = {
  release: Erc1155ReleaseNamespace;
  create: (params: Erc1155ListingCreateParams) => Promise<Erc1155ListingCreateResult>;
  createBatch: (params: Erc1155ListingCreateBatchParams) => Promise<Erc1155ListingCreateBatchResult>;
  cancel: (params: Erc1155ListingCancelParams) => Promise<TransactionResult>;
  buy: (params: Erc1155ListingBuyParams) => Promise<Erc1155ListingBuyResult>;
  checkout: (params: Erc1155CheckoutParams) => Promise<Erc1155CheckoutResult>;
  status: (params: Erc1155ListingStatusParams) => Promise<Erc1155ListingStatus>;
}

export type Erc1155OfferNamespace = {
  create: (params: Erc1155OfferCreateParams) => Promise<Erc1155OfferCreateResult>;
  cancel: (params: Erc1155OfferCancelParams) => Promise<TransactionResult>;
  accept: (params: Erc1155OfferAcceptParams) => Promise<Erc1155OfferAcceptResult>;
  status: (params: Erc1155OfferStatusParams) => Promise<Erc1155OfferStatus>;
}

export type Erc1155CollectionNamespace = {
  createToken: (params: Erc1155CollectionCreateTokenParams) => Promise<Erc1155CollectionCreateTokenResult>;
  mint: (params: Erc1155CollectionMintParams) => Promise<Erc1155CollectionMintResult>;
  mintBatch: (params: Erc1155CollectionMintBatchParams) => Promise<Erc1155CollectionMintBatchResult>;
  setMinterApproval: (params: Erc1155CollectionSetMinterApprovalParams) => Promise<Erc1155CollectionSetMinterApprovalResult>;
  updateTokenUri: (params: Erc1155CollectionUpdateTokenUriParams) => Promise<Erc1155CollectionUpdateTokenUriResult>;
  disable: (params: Erc1155CollectionDisableParams) => Promise<Erc1155CollectionDisableResult>;
  status: (params: Erc1155CollectionStatusParams) => Promise<Erc1155CollectionStatus>;
}
