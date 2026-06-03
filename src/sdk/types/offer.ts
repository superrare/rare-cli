import type { Address, Hash } from 'viem';
import type { AmountInput, CurrencyInput, IntegerInput, TransactionResult } from './common.js';
import type { BatchOfferNamespace } from './batch-offer.js';
import type { Erc1155OfferNamespace } from './erc1155.js';

export type OfferCreateParams = {
  contract: Address;
  tokenId: IntegerInput;
  currency?: CurrencyInput;
  price: AmountInput;
  autoApprove?: boolean;
}

export type OfferCreateResult = TransactionResult & {
  approvalTxHash?: Hash;
}

export type OfferCancelParams = {
  contract: Address;
  tokenId: IntegerInput;
  currency?: CurrencyInput;
}

export type OfferAcceptParams = {
  contract: Address;
  tokenId: IntegerInput;
  currency?: CurrencyInput;
  price: AmountInput;
  splitAddresses?: Address[];
  splitRatios?: number[];
  autoApprove?: boolean;
}

export type OfferAcceptResult = TransactionResult & {
  approvalTxHash?: Hash;
}

export type OfferStatusParams = {
  contract: Address;
  tokenId: IntegerInput;
  currency?: CurrencyInput;
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

export type OfferMarketplaceNamespace = {
  create: (params: OfferCreateParams) => Promise<OfferCreateResult>;
  cancel: (params: OfferCancelParams) => Promise<TransactionResult>;
  accept: (params: OfferAcceptParams) => Promise<OfferAcceptResult>;
  status: (params: OfferStatusParams) => Promise<OfferStatus>;
}

export type OfferNamespace = OfferMarketplaceNamespace & {
  erc1155: Erc1155OfferNamespace;
  batch: BatchOfferNamespace;
}
