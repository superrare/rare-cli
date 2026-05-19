import type { Address, Hash } from 'viem';
import type { AmountInput, CurrencyInput, TimestampInput, TransactionResult, IntegerInput } from './common.js';
import type { BatchAuctionNamespace } from './batch-auction.js';

export type AuctionCreateParams = {
  contract: Address;
  tokenId: IntegerInput;
  price: AmountInput;
  endTime: TimestampInput;
  currency?: CurrencyInput;
  auctionType?: 'reserve' | 'scheduled';
  startTime?: TimestampInput;
  splitAddresses?: Address[];
  splitRatios?: number[];
  autoApprove?: boolean;
}

export type AuctionCreateResult = TransactionResult & {
  approvalTxHash?: Hash;
  auctionType: 'reserve' | 'scheduled';
  startTime: bigint;
}

export type AuctionBidParams = {
  contract: Address;
  tokenId: IntegerInput;
  price: AmountInput;
  currency?: CurrencyInput;
  autoApprove?: boolean;
}

export type AuctionBidResult = TransactionResult & {
  approvalTxHash?: Hash;
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

export type AuctionMarketplaceNamespace = {
  create: (params: AuctionCreateParams) => Promise<AuctionCreateResult>;
  bid: (params: AuctionBidParams) => Promise<AuctionBidResult>;
  settle: (params: AuctionSettleParams) => Promise<TransactionResult>;
  cancel: (params: AuctionCancelParams) => Promise<TransactionResult>;
  status: (params: AuctionStatusParams) => Promise<AuctionStatus>;
}

export type AuctionNamespace = AuctionMarketplaceNamespace & {
  batch: BatchAuctionNamespace;
}
