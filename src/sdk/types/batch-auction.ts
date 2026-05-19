import type { Address, Hash, Hex } from 'viem';
import type { BatchTokenListArtifact, BatchTokenProofArtifact } from '../batch-core.js';
import type { AmountInput, CurrencyInput, IntegerInput, TimestampInput, TransactionResult } from './common.js';

export type BatchAuctionRootSource =
  | { root: Hex; artifact?: BatchTokenListArtifact }
  | { artifact: BatchTokenListArtifact; root?: Hex };

export type BatchAuctionCreateParams = BatchAuctionRootSource & {
  price: AmountInput;
  currency?: CurrencyInput;
  endTime: TimestampInput;
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

export type BatchAuctionRootsParams = {
  creator?: Address;
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
  currency?: CurrencyInput;
  price: AmountInput;
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

export type BatchAuctionNamespace = {
  create: (params: BatchAuctionCreateParams) => Promise<BatchAuctionCreateResult>;
  cancel: (params: BatchAuctionCancelParams) => Promise<BatchAuctionCancelResult>;
  roots: (params?: BatchAuctionRootsParams) => Promise<Hex[]>;
  bid: (params: BatchAuctionBidParams) => Promise<BatchAuctionBidResult>;
  settle: (params: BatchAuctionSettleParams) => Promise<BatchAuctionSettleResult>;
  status: (params: BatchAuctionStatusParams) => Promise<BatchAuctionStatus>;
}
