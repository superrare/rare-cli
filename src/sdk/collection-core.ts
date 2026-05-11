import type { Hex } from 'viem';
import type { IntegerInput } from './types.js';
import { toPositiveInteger } from './helpers.js';

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
