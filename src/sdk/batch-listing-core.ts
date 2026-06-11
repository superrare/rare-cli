import { isAddressEqual, type Address } from 'viem';
import { ETH_ADDRESS } from '../contracts/addresses.js';
import type {
  BatchListingProofArtifact,
  BatchListingRootArtifact,
  BatchListingStatus,
} from './types/batch-listing.js';
import type { BatchTokenListArtifact } from './batch-core.js';
import { validateRootArtifact } from './merkle-core.js';
import { planPayoutSplits, planProvidedPayoutSplits } from './splits-core.js';

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

export type BatchListingCreateArtifactPlan =
  | {
      kind: 'root-artifact';
      artifact: BatchListingRootArtifact;
      currencyOverride?: Address;
      amountOverride?: string;
      splitAddresses?: Address[];
      splitRatios?: number[];
    }
  | {
      kind: 'token-tree';
      artifact: BatchTokenListArtifact;
      currency: Address;
      amount: string;
      splitAddresses?: Address[];
      splitRatios?: number[];
    };

export function uniqueAddresses(addresses: readonly Address[]): Address[] {
  return addresses.reduce<Address[]>(
    (unique, address) => unique.some((existing) => isAddressEqual(existing, address)) ? unique : [...unique, address],
    [],
  );
}

export function parseBatchListingCreateRootArtifactInput(
  value: unknown,
): BatchListingRootArtifact | undefined {
  if (!isRecord(value)) {
    validateRootArtifact(value);
    throw new Error('unreachable: non-object root artifact validation did not throw');
  }

  if (isBatchTokenTreeInputObject(value)) {
    return undefined;
  }

  validateRootArtifact(value);
  return value;
}

export function planBatchListingCreateArtifact(
  plan: BatchListingCreateArtifactPlan,
): BatchListingRootArtifact {
  const splitOverride = planOptionalSplitOverride(plan.splitAddresses, plan.splitRatios);
  const artifact = plan.kind === 'root-artifact'
    ? planBatchListingCreateRootArtifact(plan, splitOverride)
    : planBatchListingCreateTokenTreeArtifact(plan, splitOverride);

  planBatchListingRootRegistrationLocalInputs(artifact);
  return artifact;
}

export function planBatchListingRootRegistration(
  artifact: BatchListingRootArtifact,
  accountAddress: Address,
): { splitAddresses: Address[]; splitRatios: number[] } {
  const local = planBatchListingRootRegistrationLocalInputs(artifact);
  if (local !== undefined) {
    return local;
  }

  const splits = planPayoutSplits(undefined, undefined, accountAddress);
  return { splitAddresses: splits.addresses, splitRatios: splits.ratios };
}

function planBatchListingCreateRootArtifact(
  plan: Extract<BatchListingCreateArtifactPlan, { kind: 'root-artifact' }>,
  splitOverride: PayoutSplitOverride | undefined,
): BatchListingRootArtifact {
  if (plan.currencyOverride !== undefined && plan.amountOverride === undefined) {
    throw new Error('--currency requires --price when overriding a batch listing root artifact.');
  }

  return {
    ...plan.artifact,
    currency: plan.currencyOverride ?? plan.artifact.currency,
    amount: plan.amountOverride ?? plan.artifact.amount,
    ...(splitOverride === undefined
      ? {}
      : {
          splitAddresses: splitOverride.addresses,
          splitRatios: splitOverride.ratios,
        }),
  };
}

function planBatchListingCreateTokenTreeArtifact(
  plan: Extract<BatchListingCreateArtifactPlan, { kind: 'token-tree' }>,
  splitOverride: PayoutSplitOverride | undefined,
): BatchListingRootArtifact {
  return {
    root: plan.artifact.root,
    currency: plan.currency,
    amount: plan.amount,
    splitAddresses: splitOverride?.addresses ?? [],
    splitRatios: splitOverride?.ratios ?? [],
    tokens: plan.artifact.tokens.map((token) => ({
      contract: token.contractAddress,
      tokenId: token.tokenId,
    })),
  };
}

type PayoutSplitOverride = {
  addresses: Address[];
  ratios: number[];
};

function planOptionalSplitOverride(
  splitAddresses: Address[] | undefined,
  splitRatios: number[] | undefined,
): PayoutSplitOverride | undefined {
  if (splitAddresses === undefined && splitRatios === undefined) {
    return undefined;
  }
  if (splitAddresses === undefined || splitRatios === undefined) {
    throw new Error('splitAddresses and splitRatios must both be provided.');
  }

  return planProvidedPayoutSplits(splitAddresses, splitRatios);
}

function isBatchTokenTreeInputObject(value: Record<string, unknown>): boolean {
  if (value.type === 'rare-batch-token-list') {
    return true;
  }
  if (
    'currency' in value ||
    'amount' in value ||
    'splitAddresses' in value ||
    'splitRatios' in value ||
    !Array.isArray(value.tokens)
  ) {
    return false;
  }

  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function planBatchListingRootRegistrationLocalInputs(
  artifact: BatchListingRootArtifact,
): { splitAddresses: Address[]; splitRatios: number[] } | undefined {
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
    return undefined;
  }

  const splits = planProvidedPayoutSplits(splitAddresses, splitRatios);
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

export type BatchListingBuyProofPolicyValidation =
  | { isValid: true }
  | { isValid: false; error: 'empty-token-proof' | 'empty-active-allowlist-proof'; errorMessage: string };

export function validateBatchListingBuyProofPolicy(params: {
  allowList: BatchListingAllowListConfig | undefined;
  tokenProof: Pick<BatchListingProofArtifact, 'proof' | 'allowListProof'>;
  nowTimestamp: bigint | undefined;
}): BatchListingBuyProofPolicyValidation {
  if (params.tokenProof.proof.length === 0) {
    return {
      isValid: false,
      error: 'empty-token-proof',
      errorMessage: 'Proof artifact proof must not be empty; the batch listing contract rejects empty token proofs',
    };
  }

  if (
    params.allowList !== undefined &&
    params.tokenProof.allowListProof?.length === 0 &&
    (params.nowTimestamp === undefined || params.allowList.endTimestamp > params.nowTimestamp)
  ) {
    return {
      isValid: false,
      error: 'empty-active-allowlist-proof',
      errorMessage:
        'Proof artifact allowListProof must not be empty while the batch listing allowlist is active; ' +
        'the batch listing contract rejects empty allowlist proofs',
    };
  }

  return { isValid: true };
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
