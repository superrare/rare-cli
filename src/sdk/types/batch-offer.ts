import type { Address, Hash, Hex } from 'viem';
import type { BatchTokenListArtifact, BatchTokenProofArtifact } from '../batch-core.js';
import type { AmountInput, CurrencyInput, IntegerInput, TimestampInput, TransactionResult } from './common.js';

export type BatchOfferRootSource =
  | { root: Hex; artifact?: BatchTokenListArtifact }
  | { artifact: BatchTokenListArtifact; root?: Hex };

export type BatchOfferCreateParams = BatchOfferRootSource & {
  price: AmountInput;
  currency?: CurrencyInput;
  endTime: TimestampInput;
  autoApprove?: boolean;
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

export type BatchOfferRevokeParams =
  | BatchOfferRootSource
  | {
    contract: Address;
    tokenId: IntegerInput;
    root?: Hex;
    artifact?: BatchTokenListArtifact;
  };

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

export type BatchOfferNamespace = {
  create: (params: BatchOfferCreateParams) => Promise<BatchOfferCreateResult>;
  revoke: (params: BatchOfferRevokeParams) => Promise<BatchOfferRevokeResult>;
  accept: (params: BatchOfferAcceptParams) => Promise<BatchOfferAcceptResult>;
  status: (params: BatchOfferStatusParams) => Promise<BatchOfferStatus>;
}
