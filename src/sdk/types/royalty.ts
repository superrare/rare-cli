import type { Address, TransactionReceipt } from 'viem';
import type { IntegerInput } from './common.js';

export type RoyaltyStatusParams = {
  contract: Address;
  tokenId: IntegerInput;
  price?: IntegerInput;
};

export type RoyaltyRecipient = {
  receiver: Address;
  amount: bigint;
};

export type RoyaltyStatusResult = {
  contract: Address;
  tokenId: bigint;
  price: bigint;
  recipients: RoyaltyRecipient[];
  totalAmount: bigint;
  lookupAddress: Address;
  overrideActive: boolean;
};

export type RoyaltyOverrideParams = {
  contract: Address;
  lookupAddress: Address;
};

export type RoyaltyOverrideResult = {
  txHash: `0x${string}`;
  receipt: TransactionReceipt;
  contract: Address;
  lookupAddress: Address;
};

export type RoyaltyNamespace = {
  status: (params: RoyaltyStatusParams) => Promise<RoyaltyStatusResult>;
  setOverride: (params: RoyaltyOverrideParams) => Promise<RoyaltyOverrideResult>;
};
