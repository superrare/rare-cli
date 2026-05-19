import { isAddressEqual, type Address, type Hex } from 'viem';
import { ETH_ADDRESS } from '../contracts/addresses.js';
import {
  toNonNegativeInteger,
  toPositiveWei,
  requireInput,
  toUnixTimestamp,
} from './helpers.js';
import { normalizeBytes32, verifyBatchTokenProof } from './batch-core.js';
import type {
  BatchOfferAcceptParams,
  BatchOfferCreateParams,
  BatchOfferStatus,
  BatchOfferStatusParams,
  BatchOfferRevokeParams,
} from './types.js';

export type BatchOfferCreatePlan = {
  root: Hex;
  amount: bigint;
  currency: Address;
  expiry: bigint;
};

export type BatchOfferRootPlan = {
  root: Hex;
};

export type BatchOfferAcceptPlan = {
  creator: Address;
  root: Hex;
  proof: Hex[];
  contract: Address;
  tokenId: bigint;
  splitAddresses: Address[];
  splitRatios: number[];
  autoApprove: boolean;
};

export type BatchOfferRead = {
  creator: Address;
  rootHash: Hex;
  amount: bigint;
  currency: Address;
  expiry: bigint;
  feePercentage?: bigint;
};

type BatchOfferReadTuple = readonly [Address, Hex, bigint, Address, bigint, bigint?];

const zeroAddress = ETH_ADDRESS;
const zeroBytes32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export function planBatchOfferCreate(
  params: BatchOfferCreateParams,
  nowSeconds?: bigint,
): BatchOfferCreatePlan {
  const expiry = toUnixTimestamp(
    requireInput(params.endTime, 'endTime'),
    'endTime',
  );
  if (nowSeconds !== undefined && expiry <= nowSeconds) {
    throw new Error('expiry must be in the future.');
  }

  const price = requireInput(params.price, 'price');

  return {
    root: resolveBatchOfferRoot(params),
    amount: toPositiveWei(price, 'price'),
    currency: params.currency ?? ETH_ADDRESS,
    expiry,
  };
}

export function planBatchOfferRoot(params: BatchOfferRevokeParams | BatchOfferStatusParams): BatchOfferRootPlan {
  return {
    root: resolveBatchOfferRoot(params),
  };
}

export function planBatchOfferAccept(
  params: BatchOfferAcceptParams,
  accountAddress: Address,
): BatchOfferAcceptPlan {
  const tokenId = toNonNegativeInteger(params.tokenId, 'tokenId');
  const root = resolveBatchOfferProofRoot(params);
  const proof = resolveBatchOfferProof(params);

  if (!verifyBatchTokenProof({
    root,
    contractAddress: params.contract,
    tokenId,
    proof,
  })) {
    throw new Error('Batch offer proof is not valid for the requested token.');
  }

  return {
    creator: params.creator,
    root,
    proof,
    contract: params.contract,
    tokenId,
    ...planSplitRecipients(params.splitAddresses, params.splitRatios, accountAddress),
    autoApprove: params.autoApprove ?? true,
  };
}

export function shapeBatchOfferStatus(
  offer: BatchOfferRead,
  expected: {
    creator: Address;
    root: Hex;
  },
  nowSeconds: bigint,
): BatchOfferStatus {
  const hasOffer = (
    !isAddressEqual(offer.creator, zeroAddress) &&
    offer.rootHash !== zeroBytes32 &&
    offer.amount > 0n
  );
  const expired = hasOffer && offer.expiry <= nowSeconds;
  const state: BatchOfferStatus['state'] = !hasOffer
    ? 'NONE'
    : expired
      ? 'EXPIRED'
      : 'ACTIVE';

  return {
    creator: hasOffer ? offer.creator : expected.creator,
    root: hasOffer ? offer.rootHash : expected.root,
    amount: offer.amount,
    currency: offer.currency,
    expiry: offer.expiry,
    feePercentage: offer.feePercentage ?? 0n,
    hasOffer,
    expired,
    revoked: hasOffer ? false : null,
    fillable: hasOffer && !expired,
    state,
    isEth: isAddressEqual(offer.currency, ETH_ADDRESS),
  };
}

export function shapeBatchOfferRead(value: BatchOfferReadTuple | BatchOfferRead): BatchOfferRead {
  if ('creator' in value) {
    return value;
  }

  const [creator, rootHash, amount, currency, expiry, feePercentage] = value;
  return {
    creator,
    rootHash,
    amount,
    currency,
    expiry,
    feePercentage,
  };
}

export function resolveBatchOfferRoot(params: {
  root?: Hex;
  artifact?: { root: Hex };
}): Hex {
  if (params.root !== undefined && params.artifact !== undefined) {
    const root = normalizeBytes32(params.root, 'root');
    if (root !== normalizeBytes32(params.artifact.root, 'artifact root')) {
      throw new Error('root does not match artifact root.');
    }
    return root;
  }
  if (params.root !== undefined) {
    return normalizeBytes32(params.root, 'root');
  }
  if (params.artifact !== undefined) {
    return normalizeBytes32(params.artifact.root, 'artifact root');
  }
  throw new Error('Pass a batch token artifact, or pass root as an override.');
}

function resolveBatchOfferProofRoot(params: BatchOfferAcceptParams): Hex {
  if (params.root !== undefined && params.proofArtifact !== undefined) {
    const root = normalizeBytes32(params.root, 'root');
    if (root !== normalizeBytes32(params.proofArtifact.root, 'proof artifact root')) {
      throw new Error('root does not match proof artifact root.');
    }
    return root;
  }
  if (params.root !== undefined) {
    return normalizeBytes32(params.root, 'root');
  }
  if (params.proofArtifact !== undefined) {
    return normalizeBytes32(params.proofArtifact.root, 'proof artifact root');
  }
  throw new Error('Pass a batch token proof artifact, or pass root as an override.');
}

function resolveBatchOfferProof(params: BatchOfferAcceptParams): Hex[] {
  const proof = params.proof ?? params.proofArtifact?.proof;
  if (proof === undefined) {
    throw new Error('Pass a batch token proof artifact, or pass proof as an override.');
  }

  return proof.map((entry, index) => normalizeBytes32(entry, `proof[${index}]`));
}

function planSplitRecipients(
  splitAddresses: Address[] | undefined,
  splitRatios: number[] | undefined,
  accountAddress: Address,
): Pick<BatchOfferAcceptPlan, 'splitAddresses' | 'splitRatios'> {
  const addresses = splitAddresses ?? [accountAddress];
  const ratios = splitRatios ?? [100];

  if (addresses.length === 0) {
    throw new Error('splitAddresses must include at least one address.');
  }
  if (addresses.length > 5) {
    throw new Error('splitAddresses cannot include more than 5 addresses.');
  }
  if (addresses.length !== ratios.length) {
    throw new Error('splitAddresses and splitRatios must have the same length.');
  }
  const total = ratios.reduce((sum, ratio, index) => {
    if (!Number.isInteger(ratio) || ratio < 0 || ratio > 100) {
      throw new Error(`splitRatios[${index}] must be an integer from 0 to 100.`);
    }
    return sum + ratio;
  }, 0);
  if (total !== 100) {
    throw new Error('splitRatios must sum to 100.');
  }

  return {
    splitAddresses: addresses,
    splitRatios: ratios,
  };
}
