import { isAddressEqual, zeroAddress, type Address, type Hex } from 'viem';
import type { IntegerInput } from './types.js';
import {
  requireInput,
  toNonNegativeInteger,
  toPositiveInteger,
  toSafeIntegerNumber,
} from './helpers.js';

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

export type PlanCreateSovereignCollectionParams = {
  name: string;
  symbol: string;
  maxTokens?: IntegerInput;
  contractType?: SovereignCollectionContractType;
}

export type CreateSovereignCollectionPlan = {
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

export type PlanCreateLazySovereignCollectionParams = {
  name: string;
  symbol: string;
  maxTokens: IntegerInput;
  contractType?: LazySovereignCollectionContractType;
}

export type CreateLazySovereignCollectionPlan = {
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

export type PlanCollectionMintBatchParams = {
  contract: Address;
  baseUri: string;
  amount: IntegerInput;
}

export type CollectionMintBatchPlan = {
  contract: Address;
  baseUri: string;
  tokenCount: bigint;
}

export type PlanCollectionPrepareLazyMintParams = {
  contract: Address;
  baseUri: string;
  amount: IntegerInput;
  minter?: Address;
}

export type CollectionPrepareLazyMintPlan = {
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

export type CollectionPrepareMintEventArgs =
  | { baseURI: string; numberOfTokens: bigint }
  | { baseURI: string; startTokenId: bigint; endTokenId: bigint };

export type CollectionPrepareMintEventShape = {
  baseUri: string;
  tokenCount: bigint;
  fromTokenId?: bigint;
  toTokenId?: bigint;
};

export type PlanCollectionTokenParams = {
  contract: Address;
  tokenId: IntegerInput;
}

export type CollectionTokenPlan = {
  contract: Address;
  tokenId: bigint;
}

export type PlanCollectionRoyaltyInfoParams = {
  price?: IntegerInput;
} & PlanCollectionTokenParams

export type CollectionRoyaltyInfoPlan = {
  salePrice: bigint;
} & CollectionTokenPlan

export type PlanCollectionReceiverParams = {
  contract: Address;
  receiver: Address;
}

export type CollectionReceiverPlan = {
  contract: Address;
  receiver: Address;
}

export type PlanCollectionTokenReceiverParams = {
  receiver: Address;
} & PlanCollectionTokenParams

export type CollectionTokenReceiverPlan = {
  receiver: Address;
} & CollectionTokenPlan

export type PlanCollectionRoyaltyRegistryStatusParams = {
  registry?: Address;
  price?: IntegerInput;
} & PlanCollectionTokenParams

export type CollectionRoyaltyRegistryStatusPlan = {
  registry?: Address;
  salePrice: bigint;
} & CollectionTokenPlan

export type CollectionRoyaltyRegistryStatusRead = {
  creatorRegistry: Address;
  receiver: Address;
  royaltyPercentage: number;
  royaltyAmount: bigint;
  contractPercentageSet: boolean;
  contractPercentage: number;
  contractReceiver: Address;
  tokenReceiver: Address;
}

export type CollectionRoyaltyRegistryStatus = {
  registry: Address;
  contract: Address;
  tokenId: bigint;
  salePrice: bigint;
  creatorRegistry: Address;
  receiver: Address;
  royaltyPercentage: number;
  royaltyAmount: bigint;
  configuredContractPercentage?: number;
  contractReceiver?: Address;
  tokenReceiver?: Address;
}

export type PlanCollectionRoyaltyRegistryReceiverOverrideParams = {
  registry?: Address;
  receiver: Address;
}

export type CollectionRoyaltyRegistryReceiverOverridePlan = {
  registry?: Address;
  receiver: Address;
}

export type PlanCollectionRoyaltyRegistryContractReceiverParams = {
  registry?: Address;
} & PlanCollectionReceiverParams

export type CollectionRoyaltyRegistryContractReceiverPlan = {
  registry?: Address;
} & CollectionReceiverPlan

export type PlanCollectionRoyaltyRegistryTokenReceiverParams = {
  registry?: Address;
} & PlanCollectionTokenReceiverParams

export type CollectionRoyaltyRegistryTokenReceiverPlan = {
  registry?: Address;
} & CollectionTokenReceiverPlan

export type PlanCollectionRoyaltyRegistryContractPercentageParams = {
  registry?: Address;
  contract: Address;
  percentage: IntegerInput;
}

export type CollectionRoyaltyRegistryContractPercentagePlan = {
  registry?: Address;
  contract: Address;
  percentage: number;
}

export type CollectionRoyaltyRegistryReceiverOverrideWrite = {
  functionName: 'setRoyaltyReceiverOverride';
  args: [Address];
};

export type CollectionRoyaltyRegistryContractReceiverWrite = {
  functionName: 'setRoyaltyReceiverForContract';
  args: [Address, Address];
};

export type CollectionRoyaltyRegistryTokenReceiverWrite = {
  functionName: 'setRoyaltyReceiverForToken';
  args: [Address, Address, bigint];
};

export type CollectionRoyaltyRegistryContractPercentageWrite = {
  functionName: 'setPercentageForSetERC721ContractRoyalty';
  args: [Address, number];
};

export type PlanCollectionBaseUriParams = {
  contract: Address;
  baseUri: string;
}

export type CollectionBaseUriPlan = {
  contract: Address;
  baseUri: string;
}

export type PlanCollectionTokenUriParams = {
  tokenUri: string;
} & PlanCollectionTokenParams

export type CollectionTokenUriPlan = {
  tokenUri: string;
} & CollectionTokenPlan

export type PlanCollectionContractParams = {
  contract: Address;
}

export type CollectionContractPlan = {
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
  const amount = requireInput(params.amount, 'amount');
  return {
    contract: params.contract,
    baseUri: params.baseUri,
    tokenCount: toPositiveInteger(amount, 'amount'),
  };
}

export function planCollectionPrepareLazyMint(
  params: PlanCollectionPrepareLazyMintParams,
): CollectionPrepareLazyMintPlan {
  const amount = requireInput(params.amount, 'amount');
  const basePlan = {
    contract: params.contract,
    baseUri: params.baseUri,
    tokenCount: toPositiveInteger(amount, 'amount'),
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

export function shapeCollectionPrepareMintEvent(
  args: CollectionPrepareMintEventArgs,
): CollectionPrepareMintEventShape {
  if ('numberOfTokens' in args) {
    return {
      baseUri: args.baseURI,
      tokenCount: args.numberOfTokens,
    };
  }

  if (args.endTokenId < args.startTokenId) {
    throw new Error('PrepareMint endTokenId must be greater than or equal to startTokenId.');
  }

  return {
    baseUri: args.baseURI,
    tokenCount: args.endTokenId - args.startTokenId + 1n,
    fromTokenId: args.startTokenId,
    toTokenId: args.endTokenId,
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
    salePrice: params.price === undefined
      ? defaultRoyaltyInfoSalePrice
      : toNonNegativeInteger(params.price, 'price'),
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

export function planCollectionRoyaltyRegistryStatus(
  params: PlanCollectionRoyaltyRegistryStatusParams,
): CollectionRoyaltyRegistryStatusPlan {
  return {
    ...planCollectionToken(params),
    registry: params.registry,
    salePrice: params.price === undefined
      ? defaultRoyaltyInfoSalePrice
      : toNonNegativeInteger(params.price, 'price'),
  };
}

export function shapeCollectionRoyaltyRegistryStatus(
  plan: CollectionRoyaltyRegistryStatusPlan & { registry: Address },
  read: CollectionRoyaltyRegistryStatusRead,
): CollectionRoyaltyRegistryStatus {
  return {
    registry: plan.registry,
    contract: plan.contract,
    tokenId: plan.tokenId,
    salePrice: plan.salePrice,
    creatorRegistry: read.creatorRegistry,
    receiver: read.receiver,
    royaltyPercentage: read.royaltyPercentage,
    royaltyAmount: read.royaltyAmount,
    ...(read.contractPercentageSet ? { configuredContractPercentage: read.contractPercentage } : {}),
    ...optionalAddress('contractReceiver', read.contractReceiver),
    ...optionalAddress('tokenReceiver', read.tokenReceiver),
  };
}

export function planCollectionRoyaltyRegistryReceiverOverride(
  params: PlanCollectionRoyaltyRegistryReceiverOverrideParams,
): CollectionRoyaltyRegistryReceiverOverridePlan {
  return {
    registry: params.registry,
    receiver: params.receiver,
  };
}

export function planCollectionRoyaltyRegistryContractReceiver(
  params: PlanCollectionRoyaltyRegistryContractReceiverParams,
): CollectionRoyaltyRegistryContractReceiverPlan {
  return {
    ...planCollectionReceiver(params),
    registry: params.registry,
  };
}

export function planCollectionRoyaltyRegistryTokenReceiver(
  params: PlanCollectionRoyaltyRegistryTokenReceiverParams,
): CollectionRoyaltyRegistryTokenReceiverPlan {
  return {
    ...planCollectionTokenReceiver(params),
    registry: params.registry,
  };
}

export function planCollectionRoyaltyRegistryContractPercentage(
  params: PlanCollectionRoyaltyRegistryContractPercentageParams,
): CollectionRoyaltyRegistryContractPercentagePlan {
  return {
    registry: params.registry,
    contract: params.contract,
    percentage: toRoyaltyPercentage(params.percentage),
  };
}

export function buildCollectionRoyaltyRegistryReceiverOverrideWrite(
  plan: CollectionRoyaltyRegistryReceiverOverridePlan,
): CollectionRoyaltyRegistryReceiverOverrideWrite {
  return {
    functionName: 'setRoyaltyReceiverOverride',
    args: [plan.receiver],
  };
}

export function buildCollectionRoyaltyRegistryContractReceiverWrite(
  plan: CollectionRoyaltyRegistryContractReceiverPlan,
): CollectionRoyaltyRegistryContractReceiverWrite {
  return {
    functionName: 'setRoyaltyReceiverForContract',
    args: [plan.receiver, plan.contract],
  };
}

export function buildCollectionRoyaltyRegistryTokenReceiverWrite(
  plan: CollectionRoyaltyRegistryTokenReceiverPlan,
): CollectionRoyaltyRegistryTokenReceiverWrite {
  return {
    functionName: 'setRoyaltyReceiverForToken',
    args: [plan.receiver, plan.contract, plan.tokenId],
  };
}

export function buildCollectionRoyaltyRegistryContractPercentageWrite(
  plan: CollectionRoyaltyRegistryContractPercentagePlan,
): CollectionRoyaltyRegistryContractPercentageWrite {
  return {
    functionName: 'setPercentageForSetERC721ContractRoyalty',
    args: [plan.contract, plan.percentage],
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

function toRoyaltyPercentage(value: IntegerInput): number {
  const percentage = toSafeIntegerNumber(value, 'percentage');
  if (percentage < 0 || percentage > 100) {
    throw new Error('percentage must be between 0 and 100.');
  }

  return percentage;
}

function optionalAddress(
  key: 'contractReceiver' | 'tokenReceiver',
  address: Address,
): { contractReceiver?: Address; tokenReceiver?: Address } {
  if (isAddressEqual(address, zeroAddress)) {
    return {};
  }

  if (key === 'contractReceiver') {
    return { contractReceiver: address };
  }

  return { tokenReceiver: address };
}
