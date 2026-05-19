import { isAddressEqual, type Address, type Hex } from 'viem';
import { ETH_ADDRESS } from '../contracts/addresses.js';
import {
  toNonNegativeInteger,
  toPositiveWei,
  requireInput,
  toUnixTimestamp,
} from './helpers.js';
import { normalizeBytes32, verifyBatchTokenProof } from './batch-core.js';
import { planPayoutSplits } from './splits-core.js';
import type {
  BatchAuctionBidParams,
  BatchAuctionCancelParams,
  BatchAuctionCreateParams,
  BatchAuctionStatus,
  BatchAuctionStatusParams,
} from './types/batch-auction.js';

type ResolvedCurrencyParam<T extends { currency?: unknown }> = Omit<T, 'currency'> & {
  currency?: Address;
};

export type BatchAuctionCreatePlan = {
  root: Hex;
  currency: Address;
  reserveAmount: bigint;
  duration: bigint;
  splitAddresses: Address[];
  splitRatios: number[];
  approvalContracts: Address[];
};

export type BatchAuctionRootPlan = {
  root: Hex;
};

export type BatchAuctionBidPlan = {
  creator: Address;
  root: Hex;
  proof: Hex[];
  contract: Address;
  tokenId: bigint;
  currency: Address;
  amount: bigint;
  requiredPayment: bigint;
};

export type BatchAuctionTokenPlan = {
  contract: Address;
  tokenId: bigint;
};

export type BatchAuctionStatusPlan = BatchAuctionTokenPlan & {
  creator?: Address;
  root?: Hex;
  proof?: Hex[];
};

export type BatchAuctionReadDetails = {
  seller: Address;
  creationBlock: bigint;
  startingTime: bigint;
  duration: bigint;
  currency: Address;
  reserveAmount: bigint;
  splitAddresses: readonly Address[];
  splitRatios: readonly number[];
};

export type BatchAuctionBidRead = {
  bidder: Address;
  currency: Address;
  amount: bigint;
  marketplaceFee: number;
};

export type BatchAuctionMerkleConfigRead = {
  currency: Address;
  reserveAmount: bigint;
  duration: bigint;
  nonce: number;
  splitAddresses: readonly Address[];
  splitRatios: readonly number[];
};

export type BatchAuctionRootContext = {
  creator: Address;
  root: Hex;
  config: BatchAuctionMerkleConfigRead;
  rootNonce: number;
  tokenNonce: number;
};

const zeroAddress = ETH_ADDRESS;
const marketplaceFeePercentage = 3n;

export function planBatchAuctionCreate(
  params: ResolvedCurrencyParam<BatchAuctionCreateParams>,
  accountAddress: Address,
  nowSeconds: bigint,
): BatchAuctionCreatePlan {
  const price = requireInput(params.price, 'price');
  return {
    root: resolveBatchAuctionRoot(params),
    currency: params.currency ?? ETH_ADDRESS,
    reserveAmount: toPositiveWei(price, 'price'),
    duration: resolveBatchAuctionDuration(params, nowSeconds),
    ...planSplitRecipients(params.splitAddresses, params.splitRatios, accountAddress),
    approvalContracts: params.artifact === undefined
      ? []
      : uniqueAddresses(params.artifact.tokens.map((token) => token.contractAddress)),
  };
}

export function planBatchAuctionRoot(params: BatchAuctionCancelParams): BatchAuctionRootPlan {
  return {
    root: resolveBatchAuctionRoot(params),
  };
}

export function planBatchAuctionBid(params: ResolvedCurrencyParam<BatchAuctionBidParams>): BatchAuctionBidPlan {
  const tokenId = toNonNegativeInteger(params.tokenId, 'tokenId');
  const root = resolveBatchAuctionProofRoot(params);
  const proof = resolveBatchAuctionProof(params);

  if (!verifyBatchTokenProof({
    root,
    contractAddress: params.contract,
    tokenId,
    proof,
  })) {
    throw new Error('Batch auction proof is not valid for the requested token.');
  }

  const price = requireInput(params.price, 'price');
  const amount = toPositiveWei(price, 'price');
  return {
    creator: params.creator,
    root,
    proof,
    contract: params.contract,
    tokenId,
    currency: params.currency ?? ETH_ADDRESS,
    amount,
    requiredPayment: addMarketplaceFee(amount),
  };
}

function resolveBatchAuctionDuration(params: BatchAuctionCreateParams, nowSeconds: bigint): bigint {
  const endTime = toUnixTimestamp(requireInput(params.endTime, 'endTime'), 'endTime');
  if (endTime <= nowSeconds) {
    throw new Error('endTime must be in the future.');
  }
  return endTime - nowSeconds;
}

export function planBatchAuctionToken(params: BatchAuctionStatusParams): BatchAuctionTokenPlan {
  return {
    contract: params.contract,
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
  };
}

export function planBatchAuctionStatus(params: BatchAuctionStatusParams): BatchAuctionStatusPlan {
  const tokenId = toNonNegativeInteger(params.tokenId, 'tokenId');
  const root = resolveOptionalStatusRoot(params);
  const proof = resolveOptionalStatusProof(params);

  if (root !== undefined && proof !== undefined && !verifyBatchTokenProof({
    root,
    contractAddress: params.contract,
    tokenId,
    proof,
  })) {
    throw new Error('Batch auction proof is not valid for the requested token.');
  }

  return {
    contract: params.contract,
    tokenId,
    ...(params.creator === undefined ? {} : { creator: params.creator }),
    ...(root === undefined ? {} : { root }),
    ...(proof === undefined ? {} : { proof }),
  };
}

export function shapeBatchAuctionStatus(
  details: BatchAuctionReadDetails,
  currentBid: BatchAuctionBidRead,
  rootContext: BatchAuctionRootContext | undefined,
  nowSeconds: bigint,
): BatchAuctionStatus {
  const hasAuction = details.startingTime > 0n && !isAddressEqual(details.seller, zeroAddress);
  const hasRootConfig = rootContext !== undefined && rootContext.config.duration > 0n;
  const duration = hasAuction ? details.duration : rootContext?.config.duration ?? 0n;
  const startingTime = hasAuction ? details.startingTime : 0n;
  const endTime = hasAuction ? startingTime + duration : null;
  const ended = endTime !== null && nowSeconds >= endTime;
  const currentBidder = currentBid.amount > 0n && !isAddressEqual(currentBid.bidder, zeroAddress)
    ? currentBid.bidder
    : null;
  const seller = hasAuction ? details.seller : rootContext?.creator ?? zeroAddress;
  const currency = hasAuction ? details.currency : rootContext?.config.currency ?? ETH_ADDRESS;
  const reserveAmount = hasAuction ? details.reserveAmount : rootContext?.config.reserveAmount ?? 0n;
  const tokenNonceConsumed = rootContext === undefined
    ? null
    : rootContext.tokenNonce >= rootContext.config.nonce;

  return {
    seller,
    root: rootContext?.root ?? null,
    currency,
    reserveAmount,
    duration,
    creationBlock: details.creationBlock,
    startingTime,
    endTime,
    splitAddresses: resolveStatusSplitAddresses(hasAuction, details, rootContext),
    splitRatios: resolveStatusSplitRatios(hasAuction, details, rootContext),
    hasRootConfig,
    rootNonce: rootContext?.rootNonce ?? null,
    tokenNonce: rootContext?.tokenNonce ?? null,
    tokenNonceConsumed,
    hasAuction,
    started: hasAuction,
    ended,
    settlementEligible: hasAuction && ended && currentBid.amount > 0n,
    currentBidder,
    currentBid: currentBid.amount,
    currentBidCurrency: currentBid.amount > 0n ? currentBid.currency : currency,
    currentBidMarketplaceFee: currentBid.marketplaceFee,
    minimumNextBid: currentBid.amount > 0n ? addMinimumBidIncrease(currentBid.amount) : reserveAmount,
    state: resolveBatchAuctionState({
      hasAuction,
      ended,
      hasRootConfig,
      tokenNonceConsumed,
    }),
    isEth: isAddressEqual(currency, ETH_ADDRESS),
  };
}

export function shapeBatchAuctionDetailsRead(details: readonly [
  Address,
  number,
  bigint,
  bigint,
  Address,
  bigint,
  readonly Address[],
  readonly number[],
]): BatchAuctionReadDetails {
  const [
    seller,
    creationBlock,
    startingTime,
    duration,
    currency,
    reserveAmount,
    splitAddresses,
    splitRatios,
  ] = details;

  return {
    seller,
    creationBlock: BigInt(creationBlock),
    startingTime,
    duration,
    currency,
    reserveAmount,
    splitAddresses,
    splitRatios,
  };
}

export function shapeBatchAuctionCurrentBidRead(currentBid: readonly [
  Address,
  Address,
  bigint,
  number,
]): BatchAuctionBidRead {
  const [bidder, currency, amount, marketplaceFee] = currentBid;
  return {
    bidder,
    currency,
    amount,
    marketplaceFee,
  };
}

export function shapeBatchAuctionMerkleConfigRead(config: {
  currency: Address;
  startingAmount: bigint;
  duration: bigint;
  nonce: number;
  splitAddresses: readonly Address[];
  splitRatios: readonly number[];
}): BatchAuctionMerkleConfigRead {
  return {
    currency: config.currency,
    reserveAmount: config.startingAmount,
    duration: config.duration,
    nonce: config.nonce,
    splitAddresses: config.splitAddresses,
    splitRatios: config.splitRatios,
  };
}

export function addMarketplaceFee(amount: bigint): bigint {
  return amount + ((amount * marketplaceFeePercentage) / 100n);
}

export function resolveBatchAuctionRoot(params: {
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

function resolveBatchAuctionProofRoot(params: BatchAuctionBidParams): Hex {
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

function resolveBatchAuctionProof(params: BatchAuctionBidParams): Hex[] {
  const proof = params.proof ?? params.proofArtifact?.proof;
  if (proof === undefined) {
    throw new Error('Pass a batch token proof artifact, or pass proof as an override.');
  }

  return proof.map((entry, index) => normalizeBytes32(entry, `proof[${index}]`));
}

function resolveOptionalStatusRoot(params: BatchAuctionStatusParams): Hex | undefined {
  const artifact = params.artifact ?? params.proofArtifact;
  if (params.root === undefined && artifact === undefined) {
    return undefined;
  }
  return resolveBatchAuctionRoot({
    ...(params.root === undefined ? {} : { root: params.root }),
    ...(artifact === undefined ? {} : { artifact }),
  });
}

function resolveOptionalStatusProof(params: BatchAuctionStatusParams): Hex[] | undefined {
  const proof = params.proof ?? params.proofArtifact?.proof;
  if (proof === undefined) {
    return undefined;
  }

  return proof.map((entry, index) => normalizeBytes32(entry, `proof[${index}]`));
}

function planSplitRecipients(
  splitAddresses: Address[] | undefined,
  splitRatios: number[] | undefined,
  accountAddress: Address,
): Pick<BatchAuctionCreatePlan, 'splitAddresses' | 'splitRatios'> {
  const splits = planPayoutSplits(splitAddresses, splitRatios, accountAddress);
  return {
    splitAddresses: splits.addresses,
    splitRatios: splits.ratios,
  };
}

function uniqueAddresses(addresses: readonly Address[]): Address[] {
  return addresses.reduce<Address[]>((unique, address) => (
    unique.some((candidate) => isAddressEqual(candidate, address))
      ? unique
      : [...unique, address]
  ), []);
}

function addMinimumBidIncrease(amount: bigint): bigint {
  return amount + ((amount * marketplaceFeePercentage) / 100n);
}

function resolveStatusSplitAddresses(
  hasAuction: boolean,
  details: BatchAuctionReadDetails,
  rootContext: BatchAuctionRootContext | undefined,
): Address[] {
  if (hasAuction) {
    return [...details.splitAddresses];
  }
  if (rootContext === undefined) {
    return [];
  }
  return [...rootContext.config.splitAddresses];
}

function resolveStatusSplitRatios(
  hasAuction: boolean,
  details: BatchAuctionReadDetails,
  rootContext: BatchAuctionRootContext | undefined,
): number[] {
  if (hasAuction) {
    return [...details.splitRatios];
  }
  if (rootContext === undefined) {
    return [];
  }
  return [...rootContext.config.splitRatios];
}

function resolveBatchAuctionState(params: {
  hasAuction: boolean;
  ended: boolean;
  hasRootConfig: boolean;
  tokenNonceConsumed: boolean | null;
}): BatchAuctionStatus['state'] {
  if (params.hasAuction) {
    return params.ended ? 'ENDED' : 'ACTIVE';
  }
  if (params.hasRootConfig && params.tokenNonceConsumed === false) {
    return 'RESERVE_NOT_MET';
  }
  if (params.hasRootConfig && params.tokenNonceConsumed === true) {
    return 'USED';
  }
  if (params.hasRootConfig) {
    return 'CONFIGURED';
  }
  return 'NONE';
}
