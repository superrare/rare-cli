import type { Address } from 'viem';
import type { LazySovereignCollectionContractType } from '../collection-core.js';
import type { Collection } from '../api.js';
import type { IntegerInput, TransactionResult } from './common.js';

export type DeployErc721Params = {
  name: string;
  symbol: string;
  maxTokens?: IntegerInput;
}

export type DeployErc721Result = {
  contract: Address;
} & TransactionResult

export type DeployLazyBatchMintParams = {
  name: string;
  symbol: string;
  maxTokens?: IntegerInput;
}

export type DeployLazyBatchMintResult = {
  contract: Address;
} & TransactionResult

export type DeployLazyErc721Params = {
  name: string;
  symbol: string;
  maxTokens: IntegerInput;
  contractType?: LazySovereignCollectionContractType;
}

export type DeployLazyErc721Result = {
  contract: Address;
  factory: Address;
  contractType: LazySovereignCollectionContractType;
  nextStep: string;
} & TransactionResult

export type CollectionMintBatchParams = {
  contract: Address;
  baseUri: string;
  amount: IntegerInput;
}

export type CollectionMintBatchResult = {
  contract: Address;
  baseUri: string;
  tokenCount: bigint;
  fromTokenId: bigint;
  toTokenId: bigint;
  owner: Address;
} & TransactionResult

export type CollectionPrepareLazyMintParams = {
  contract: Address;
  baseUri: string;
  amount: IntegerInput;
  minter?: Address;
}

export type CollectionPrepareLazyMintResult = {
  contract: Address;
  baseUri: string;
  tokenCount: bigint;
  fromTokenId?: bigint;
  toTokenId?: bigint;
  minter?: Address;
} & TransactionResult

export type CollectionTokenCreatorParams = {
  contract: Address;
  tokenId: IntegerInput;
}

export type CollectionTokenCreatorResult = {
  contract: Address;
  tokenId: bigint;
  creator: Address;
}

export type CollectionRoyaltyInfoParams = {
  contract: Address;
  tokenId: IntegerInput;
  price?: IntegerInput;
}

export type CollectionRoyaltyInfoResult = {
  contract: Address;
  tokenId: bigint;
  salePrice: bigint;
  receiver: Address;
  royaltyAmount: bigint;
  defaultReceiver?: Address;
  defaultPercentage?: bigint;
}

export type CollectionSetDefaultRoyaltyReceiverParams = {
  contract: Address;
  receiver: Address;
}

export type CollectionSetDefaultRoyaltyReceiverResult = {
  contract: Address;
  receiver: Address;
} & TransactionResult

export type CollectionSetTokenRoyaltyReceiverParams = {
  contract: Address;
  tokenId: IntegerInput;
  receiver: Address;
}

export type CollectionSetTokenRoyaltyReceiverResult = {
  contract: Address;
  tokenId: bigint;
  receiver: Address;
} & TransactionResult

export type CollectionRoyaltyRegistryStatusParams = {
  registry?: Address;
  contract: Address;
  tokenId: IntegerInput;
  price?: IntegerInput;
}

export type CollectionRoyaltyRegistryStatusResult = {
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

export type CollectionRoyaltyRegistryReceiverOverrideParams = {
  registry?: Address;
  receiver: Address;
}

export type CollectionRoyaltyRegistryReceiverOverrideResult = {
  registry: Address;
  receiver: Address;
} & TransactionResult

export type CollectionRoyaltyRegistryContractReceiverParams = {
  registry?: Address;
  contract: Address;
  receiver: Address;
}

export type CollectionRoyaltyRegistryContractReceiverResult = {
  registry: Address;
  contract: Address;
  receiver: Address;
} & TransactionResult

export type CollectionRoyaltyRegistryTokenReceiverParams = {
  registry?: Address;
  contract: Address;
  tokenId: IntegerInput;
  receiver: Address;
}

export type CollectionRoyaltyRegistryTokenReceiverResult = {
  registry: Address;
  contract: Address;
  tokenId: bigint;
  receiver: Address;
} & TransactionResult

export type CollectionRoyaltyRegistryContractPercentageParams = {
  registry?: Address;
  contract: Address;
  percentage: IntegerInput;
}

export type CollectionRoyaltyRegistryContractPercentageResult = {
  registry: Address;
  contract: Address;
  percentage: number;
} & TransactionResult

export type CollectionMintConfigParams = {
  contract: Address;
}

export type CollectionMintConfigResult = {
  contract: Address;
  tokenCount: bigint;
  baseUri: string;
  lockedMetadata: boolean;
}

export type CollectionUpdateBaseUriParams = {
  contract: Address;
  baseUri: string;
}

export type CollectionUpdateBaseUriResult = {
  contract: Address;
  baseUri: string;
} & TransactionResult

export type CollectionUpdateTokenUriParams = {
  contract: Address;
  tokenId: IntegerInput;
  tokenUri: string;
}

export type CollectionUpdateTokenUriResult = {
  contract: Address;
  tokenId: bigint;
  tokenUri: string;
} & TransactionResult

export type CollectionLockBaseUriParams = {
  contract: Address;
}

export type CollectionLockBaseUriResult = {
  contract: Address;
  baseUri: string;
} & TransactionResult

export type CollectionMintParams = {
  contract: Address;
  tokenUri: string;
  to?: Address;
  royaltyReceiver?: Address;
}

export type CollectionMintResult = {
  tokenId: bigint;
} & TransactionResult

export type CollectionDeployNamespace = {
  erc721: (params: DeployErc721Params) => Promise<DeployErc721Result>;
  lazyErc721: (params: DeployLazyErc721Params) => Promise<DeployLazyErc721Result>;
  lazyBatchMint: (params: DeployLazyBatchMintParams) => Promise<DeployLazyBatchMintResult>;
}

export type CollectionNamespace = {
  get: (id: string) => Promise<Collection>;
  deploy: CollectionDeployNamespace;
  mint: (params: CollectionMintParams) => Promise<CollectionMintResult>;
  mintBatch: (params: CollectionMintBatchParams) => Promise<CollectionMintBatchResult>;
  prepareLazyMint: (params: CollectionPrepareLazyMintParams) => Promise<CollectionPrepareLazyMintResult>;
  getTokenCreator: (params: CollectionTokenCreatorParams) => Promise<CollectionTokenCreatorResult>;
  royalty: {
    status: (params: CollectionRoyaltyInfoParams) => Promise<CollectionRoyaltyInfoResult>;
    registry: {
      status: (params: CollectionRoyaltyRegistryStatusParams) => Promise<CollectionRoyaltyRegistryStatusResult>;
    };
  };
  metadata: {
    status: (params: CollectionMintConfigParams) => Promise<CollectionMintConfigResult>;
  };
  setDefaultRoyaltyReceiver: (params: CollectionSetDefaultRoyaltyReceiverParams) => Promise<CollectionSetDefaultRoyaltyReceiverResult>;
  setTokenRoyaltyReceiver: (params: CollectionSetTokenRoyaltyReceiverParams) => Promise<CollectionSetTokenRoyaltyReceiverResult>;
  setRoyaltyRegistryReceiverOverride: (params: CollectionRoyaltyRegistryReceiverOverrideParams) => Promise<CollectionRoyaltyRegistryReceiverOverrideResult>;
  setRoyaltyRegistryContractReceiver: (params: CollectionRoyaltyRegistryContractReceiverParams) => Promise<CollectionRoyaltyRegistryContractReceiverResult>;
  setRoyaltyRegistryTokenReceiver: (params: CollectionRoyaltyRegistryTokenReceiverParams) => Promise<CollectionRoyaltyRegistryTokenReceiverResult>;
  setRoyaltyRegistryContractPercentage: (params: CollectionRoyaltyRegistryContractPercentageParams) => Promise<CollectionRoyaltyRegistryContractPercentageResult>;
  updateBaseUri: (params: CollectionUpdateBaseUriParams) => Promise<CollectionUpdateBaseUriResult>;
  updateTokenUri: (params: CollectionUpdateTokenUriParams) => Promise<CollectionUpdateTokenUriResult>;
  lockBaseUri: (params: CollectionLockBaseUriParams) => Promise<CollectionLockBaseUriResult>;
}
