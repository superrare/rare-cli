import { isAddressEqual, type Address } from 'viem';
import { ETH_ADDRESS } from '../contracts/addresses.js';
import type {
  BatchListingProofArtifact,
  BatchListingRootArtifact,
  BatchListingStatus,
} from './types.js';
import { planSplits } from './marketplace-core.js';

export type BatchListingReadConfig = {
  currency: Address;
  amount: bigint;
  splitRecipients: readonly Address[];
  splitRatios: readonly number[];
  nonce: bigint;
};

export type BatchListingAllowListConfig = {
  root: `0x${string}`;
  endTimestamp: bigint;
};

export function uniqueAddresses(addresses: readonly Address[]): Address[] {
  return addresses.reduce<Address[]>(
    (unique, address) => unique.some((existing) => isAddressEqual(existing, address)) ? unique : [...unique, address],
    [],
  );
}

export function planBatchListingRootRegistration(
  artifact: BatchListingRootArtifact,
  accountAddress: Address,
): { splitAddresses: Address[]; splitRatios: number[] } {
  if (artifact.tokens.length < 2) {
    throw new Error('Root artifact must contain at least two tokens; the batch listing contract rejects empty proofs');
  }

  if (artifact.allowList !== undefined && artifact.allowList.addresses.length < 2) {
    throw new Error(
      'Allowlist must contain at least two addresses; the batch listing contract rejects empty allowlist proofs',
    );
  }

  const { splitAddresses, splitRatios } = artifact;
  if (splitAddresses.length === 0 && splitRatios.length === 0) {
    const splits = planSplits(undefined, undefined, accountAddress);
    return { splitAddresses: splits.addresses, splitRatios: splits.ratios };
  }

  const splits = planSplits(splitAddresses, splitRatios, accountAddress);
  return { splitAddresses: splits.addresses, splitRatios: splits.ratios };
}

export function shouldResolveBatchListingAllowListProof(params: {
  allowList: BatchListingAllowListConfig | undefined;
  tokenProof: BatchListingProofArtifact;
  nowTimestamp: bigint | undefined;
}): boolean {
  if (params.allowList === undefined || params.tokenProof.allowListProof !== undefined) {
    return false;
  }

  return params.nowTimestamp === undefined || params.allowList.endTimestamp > params.nowTimestamp;
}

export function shapeBatchListingStatus(params: {
  root: `0x${string}`;
  creator: Address;
  listingConfig: BatchListingReadConfig;
  cancellationNonce: bigint;
  allowList: BatchListingAllowListConfig | undefined;
  tokenStatus: Pick<BatchListingStatus, 'tokenInRoot' | 'tokenNonce'>;
}): BatchListingStatus {
  const hasListing =
    params.listingConfig.amount > 0n &&
    params.cancellationNonce === params.listingConfig.nonce;

  return {
    root: params.root,
    seller: params.creator,
    currencyAddress: params.listingConfig.currency,
    amount: params.listingConfig.amount,
    splitRecipients: [...params.listingConfig.splitRecipients],
    splitRatios: [...params.listingConfig.splitRatios],
    nonce: params.listingConfig.nonce,
    isEth: isAddressEqual(params.listingConfig.currency, ETH_ADDRESS),
    hasListing,
    allowList: params.allowList,
    ...params.tokenStatus,
  };
}
