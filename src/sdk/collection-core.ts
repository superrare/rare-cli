import type { Address, Hex } from 'viem';
import type { IntegerInput } from './types.js';
import { toNonNegativeInteger, toPositiveInteger } from './helpers.js';

export const sovereignCollectionContractTypes = [
  'standard',
  'royalty-guard',
  'deadman-royalty-guard',
] as const;

export const lazySovereignCollectionContractTypes = [
  'lazy',
  'lazy-royalty-guard',
  'lazy-deadman-royalty-guard',
] as const;

export type SovereignCollectionContractType = (typeof sovereignCollectionContractTypes)[number];
export type SovereignCollectionContractTypeReadName = 'SOVEREIGN_NFT' | 'ROYALTY_GUARD' | 'ROYALTY_GUARD_DEADMAN';
export type LazySovereignCollectionContractType = (typeof lazySovereignCollectionContractTypes)[number];
export type LazySovereignCollectionContractTypeReadName =
  | 'LAZY_SOVEREIGN_NFT'
  | 'LAZY_ROYALTY_GUARD'
  | 'LAZY_ROYALTY_GUARD_DEADMAN';

export const defaultRoyaltyInfoSalePrice = 10000n;

export interface PlanCreateSovereignCollectionParams {
  name: string;
  symbol: string;
  maxTokens?: IntegerInput;
  contractType?: SovereignCollectionContractType;
}

export interface CreateSovereignCollectionPlan {
  name: string;
  symbol: string;
  maxTokens?: bigint;
  contractType: SovereignCollectionContractType;
  contractTypeReadName?: SovereignCollectionContractTypeReadName;
}

export type CreateSovereignCollectionWrite = {
  functionName: 'createSovereignNFTContract';
  args: [string, string] | [string, string, bigint] | [string, string, bigint, Hex];
};

export interface PlanCreateLazySovereignCollectionParams {
  name: string;
  symbol: string;
  maxTokens: IntegerInput;
  contractType?: LazySovereignCollectionContractType;
}

export interface CreateLazySovereignCollectionPlan {
  name: string;
  symbol: string;
  maxTokens: bigint;
  contractType: LazySovereignCollectionContractType;
  contractTypeReadName: LazySovereignCollectionContractTypeReadName;
}

export type CreateLazySovereignCollectionWrite = {
  functionName: 'createSovereignNFTContract';
  args: [string, string, bigint, Hex];
};

export interface PlanCollectionMintBatchParams {
  contract: Address;
  baseUri: string;
  tokenCount: IntegerInput;
}

export interface CollectionMintBatchPlan {
  contract: Address;
  baseUri: string;
  tokenCount: bigint;
}

export interface PlanCollectionPrepareLazyMintParams {
  contract: Address;
  baseUri: string;
  tokenCount: IntegerInput;
  minter?: Address;
}

export interface CollectionPrepareLazyMintPlan {
  contract: Address;
  baseUri: string;
  tokenCount: bigint;
  minter?: Address;
}

export type CollectionMintBatchWrite = {
  functionName: 'batchMint';
  args: [string, bigint];
};

export type CollectionPrepareLazyMintWrite = {
  functionName: 'prepareMint' | 'prepareMintWithMinter';
  args: [string, bigint] | [string, bigint, Address];
};

export interface PlanCollectionTokenParams {
  contract: Address;
  tokenId: IntegerInput;
}

export interface CollectionTokenPlan {
  contract: Address;
  tokenId: bigint;
}

export interface PlanCollectionRoyaltyInfoParams extends PlanCollectionTokenParams {
  salePrice?: IntegerInput;
}

export interface CollectionRoyaltyInfoPlan extends CollectionTokenPlan {
  salePrice: bigint;
}

export interface PlanCollectionReceiverParams {
  contract: Address;
  receiver: Address;
}

export interface CollectionReceiverPlan {
  contract: Address;
  receiver: Address;
}

export interface PlanCollectionTokenReceiverParams extends PlanCollectionTokenParams {
  receiver: Address;
}

export interface CollectionTokenReceiverPlan extends CollectionTokenPlan {
  receiver: Address;
}

export interface PlanCollectionBaseUriParams {
  contract: Address;
  baseUri: string;
}

export interface CollectionBaseUriPlan {
  contract: Address;
  baseUri: string;
}

export interface PlanCollectionTokenUriParams extends PlanCollectionTokenParams {
  tokenUri: string;
}

export interface CollectionTokenUriPlan extends CollectionTokenPlan {
  tokenUri: string;
}

export interface PlanCollectionContractParams {
  contract: Address;
}

export interface CollectionContractPlan {
  contract: Address;
}

export function normalizeSovereignCollectionContractType(
  input: string | undefined,
): SovereignCollectionContractType | undefined {
  if (input === undefined) {
    return undefined;
  }

  const normalized = input.trim().toLowerCase();
  if (normalized === 'standard' || normalized === 'sovereign' || normalized === 'sovereign-nft') {
    return 'standard';
  }
  if (normalized === 'royalty-guard') {
    return 'royalty-guard';
  }
  if (
    normalized === 'deadman-royalty-guard' ||
    normalized === 'royalty-guard-deadman' ||
    normalized === 'deadman'
  ) {
    return 'deadman-royalty-guard';
  }

  throw new Error(
    `Unsupported Sovereign collection contract type "${input}". Supported: ${sovereignCollectionContractTypes.join(', ')}.`,
  );
}

export function normalizeLazySovereignCollectionContractType(
  input: string | undefined,
): LazySovereignCollectionContractType | undefined {
  if (input === undefined) {
    return undefined;
  }

  const normalized = input.trim().toLowerCase();
  if (
    normalized === 'lazy' ||
    normalized === 'standard' ||
    normalized === 'lazy-sovereign' ||
    normalized === 'lazy-sovereign-nft'
  ) {
    return 'lazy';
  }
  if (normalized === 'lazy-royalty-guard' || normalized === 'royalty-guard') {
    return 'lazy-royalty-guard';
  }
  if (
    normalized === 'lazy-deadman-royalty-guard' ||
    normalized === 'lazy-royalty-guard-deadman' ||
    normalized === 'deadman-royalty-guard' ||
    normalized === 'royalty-guard-deadman' ||
    normalized === 'deadman'
  ) {
    return 'lazy-deadman-royalty-guard';
  }

  throw new Error(
    `Unsupported Lazy Sovereign collection contract type "${input}". Supported: ${lazySovereignCollectionContractTypes.join(', ')}.`,
  );
}

export function planCreateSovereignCollection(
  params: PlanCreateSovereignCollectionParams,
): CreateSovereignCollectionPlan {
  const contractType = params.contractType ?? 'standard';
  const maxTokens = params.maxTokens === undefined
    ? undefined
    : toPositiveInteger(params.maxTokens, 'maxTokens');

  if (contractType !== 'standard' && maxTokens === undefined) {
    throw new Error(`maxTokens is required when creating a ${contractType} Sovereign collection.`);
  }

  return {
    name: params.name,
    symbol: params.symbol,
    maxTokens,
    contractType,
    contractTypeReadName: contractTypeReadName(contractType),
  };
}

export function buildCreateSovereignCollectionWrite(
  plan: CreateSovereignCollectionPlan,
  contractType?: Hex,
): CreateSovereignCollectionWrite {
  if (plan.maxTokens === undefined) {
    return {
      functionName: 'createSovereignNFTContract',
      args: [plan.name, plan.symbol],
    };
  }

  if (plan.contractTypeReadName === undefined) {
    return {
      functionName: 'createSovereignNFTContract',
      args: [plan.name, plan.symbol, plan.maxTokens],
    };
  }

  if (contractType === undefined) {
    throw new Error(`contractType is required for ${plan.contractType} Sovereign collection writes.`);
  }

  return {
    functionName: 'createSovereignNFTContract',
    args: [plan.name, plan.symbol, plan.maxTokens, contractType],
  };
}

export function planCreateLazySovereignCollection(
  params: PlanCreateLazySovereignCollectionParams,
): CreateLazySovereignCollectionPlan {
  const contractType = params.contractType ?? 'lazy';

  return {
    name: params.name,
    symbol: params.symbol,
    maxTokens: toPositiveInteger(params.maxTokens, 'maxTokens'),
    contractType,
    contractTypeReadName: lazyContractTypeReadName(contractType),
  };
}

export function buildCreateLazySovereignCollectionWrite(
  plan: CreateLazySovereignCollectionPlan,
  contractType: Hex,
): CreateLazySovereignCollectionWrite {
  return {
    functionName: 'createSovereignNFTContract',
    args: [plan.name, plan.symbol, plan.maxTokens, contractType],
  };
}

export function planCollectionMintBatch(
  params: PlanCollectionMintBatchParams,
): CollectionMintBatchPlan {
  return {
    contract: params.contract,
    baseUri: params.baseUri,
    tokenCount: toPositiveInteger(params.tokenCount, 'tokenCount'),
  };
}

export function planCollectionPrepareLazyMint(
  params: PlanCollectionPrepareLazyMintParams,
): CollectionPrepareLazyMintPlan {
  const basePlan = {
    contract: params.contract,
    baseUri: params.baseUri,
    tokenCount: toPositiveInteger(params.tokenCount, 'tokenCount'),
  };

  if (params.minter === undefined) {
    return basePlan;
  }

  return {
    ...basePlan,
    minter: params.minter,
  };
}

export function buildCollectionMintBatchWrite(
  plan: CollectionMintBatchPlan,
): CollectionMintBatchWrite {
  return {
    functionName: 'batchMint',
    args: [plan.baseUri, plan.tokenCount],
  };
}

export function buildCollectionPrepareLazyMintWrite(
  plan: CollectionPrepareLazyMintPlan,
): CollectionPrepareLazyMintWrite {
  if (plan.minter === undefined) {
    return {
      functionName: 'prepareMint',
      args: [plan.baseUri, plan.tokenCount],
    };
  }

  return {
    functionName: 'prepareMintWithMinter',
    args: [plan.baseUri, plan.tokenCount, plan.minter],
  };
}

export function planCollectionToken(
  params: PlanCollectionTokenParams,
): CollectionTokenPlan {
  return {
    contract: params.contract,
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
  };
}

export function planCollectionRoyaltyInfo(
  params: PlanCollectionRoyaltyInfoParams,
): CollectionRoyaltyInfoPlan {
  return {
    ...planCollectionToken(params),
    salePrice: params.salePrice === undefined
      ? defaultRoyaltyInfoSalePrice
      : toNonNegativeInteger(params.salePrice, 'salePrice'),
  };
}

export function planCollectionReceiver(
  params: PlanCollectionReceiverParams,
): CollectionReceiverPlan {
  return {
    contract: params.contract,
    receiver: params.receiver,
  };
}

export function planCollectionTokenReceiver(
  params: PlanCollectionTokenReceiverParams,
): CollectionTokenReceiverPlan {
  return {
    ...planCollectionToken(params),
    receiver: params.receiver,
  };
}

export function planCollectionBaseUri(
  params: PlanCollectionBaseUriParams,
): CollectionBaseUriPlan {
  return {
    contract: params.contract,
    baseUri: params.baseUri,
  };
}

export function planCollectionTokenUri(
  params: PlanCollectionTokenUriParams,
): CollectionTokenUriPlan {
  return {
    ...planCollectionToken(params),
    tokenUri: params.tokenUri,
  };
}

export function planCollectionContract(
  params: PlanCollectionContractParams,
): CollectionContractPlan {
  return {
    contract: params.contract,
  };
}

function contractTypeReadName(
  contractType: SovereignCollectionContractType,
): SovereignCollectionContractTypeReadName | undefined {
  if (contractType === 'royalty-guard') {
    return 'ROYALTY_GUARD';
  }
  if (contractType === 'deadman-royalty-guard') {
    return 'ROYALTY_GUARD_DEADMAN';
  }
  return undefined;
}

function lazyContractTypeReadName(
  contractType: LazySovereignCollectionContractType,
): LazySovereignCollectionContractTypeReadName {
  if (contractType === 'lazy-royalty-guard') {
    return 'LAZY_ROYALTY_GUARD';
  }
  if (contractType === 'lazy-deadman-royalty-guard') {
    return 'LAZY_ROYALTY_GUARD_DEADMAN';
  }
  return 'LAZY_SOVEREIGN_NFT';
}
