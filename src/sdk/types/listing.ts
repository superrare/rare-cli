import type { Address, Hash } from 'viem';
import type { AmountInput, CurrencyInput, IntegerInput, TransactionResult } from './common.js';
import type { BatchListingNamespace } from './batch-listing.js';
import type { Erc1155ListingNamespace } from './erc1155.js';
import type { ReleaseNamespace } from './release.js';

export type ListingCreateParams = {
  contract: Address;
  tokenId: IntegerInput;
  currency?: CurrencyInput;
  price: AmountInput;
  target?: Address;
  splitAddresses?: Address[];
  splitRatios?: number[];
  autoApprove?: boolean;
}

export type ListingCreateResult = TransactionResult & {
  approvalTxHash?: Hash;
}

export type ListingCancelParams = {
  contract: Address;
  tokenId: IntegerInput;
  target?: Address;
}

export type ListingBuyParams = {
  contract: Address;
  tokenId: IntegerInput;
  currency?: CurrencyInput;
  price: AmountInput;
  autoApprove?: boolean;
}

export type ListingBuyResult = TransactionResult & {
  approvalTxHash?: Hash;
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

export type ListingMarketplaceNamespace = {
  create: (params: ListingCreateParams) => Promise<ListingCreateResult>;
  cancel: (params: ListingCancelParams) => Promise<TransactionResult>;
  buy: (params: ListingBuyParams) => Promise<ListingBuyResult>;
  status: (params: ListingStatusParams) => Promise<ListingStatus>;
}

export type ListingNamespace = ListingMarketplaceNamespace & {
  erc1155: Erc1155ListingNamespace;
  release: ReleaseNamespace;
  batch: BatchListingNamespace;
}
