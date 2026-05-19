import { getAddress, type Address } from 'viem';
import { chainIds, isSupportedChain, type SupportedChain } from '../contracts/addresses.js';
import { toInteger } from './amounts-core.js';
import { buildNftUniversalTokenId } from './nft-core.js';
import type { IntegerInput } from './types/common.js';

export type EventSearchTargetParams = {
  chain?: SupportedChain;
  chainId?: IntegerInput;
  contract?: Address;
  tokenId?: IntegerInput;
  collectionId?: string;
}

export type CollectionIdentityParams = {
  chain?: SupportedChain;
  chainId?: IntegerInput;
  contract: Address;
}

export type EventSearchTarget =
  | { kind: 'nft'; universalTokenId: string }
  | { kind: 'collection'; collectionId: string };

export function resolveEventSearchTarget(params: EventSearchTargetParams): EventSearchTarget {
  if (params.collectionId !== undefined) {
    if (params.contract !== undefined || params.tokenId !== undefined) {
      throw new Error('Pass either collectionId or NFT filters, not both.');
    }
    return { kind: 'collection', collectionId: params.collectionId };
  }

  if (params.contract === undefined) {
    throw new Error('Pass collectionId, or pass contract with chain/chainId.');
  }

  if (params.tokenId !== undefined) {
    return {
      kind: 'nft',
      universalTokenId: buildNftUniversalTokenId({
        chain: params.chain,
        chainId: params.chainId,
        contract: params.contract,
        tokenId: params.tokenId,
      }),
    };
  }

  return {
    kind: 'collection',
    collectionId: buildCollectionId({
      chain: params.chain,
      chainId: params.chainId,
      contract: params.contract,
    }),
  };
}

export function buildCollectionId(params: CollectionIdentityParams): string {
  const chainId = resolveChainId(params);
  return `${chainId.toString()}-${getAddress(params.contract).toLocaleLowerCase('en-US')}`;
}

function resolveChainId(params: { chain?: SupportedChain; chainId?: IntegerInput }): bigint {
  if (params.chainId !== undefined) {
    const chainId = toInteger(params.chainId, 'chainId');
    if (chainId <= 0n) {
      throw new Error('chainId must be greater than 0.');
    }
    return chainId;
  }

  if (params.chain !== undefined) {
    if (!isSupportedChain(params.chain)) {
      throw new Error(`Unsupported chain: ${params.chain}`);
    }
    return BigInt(chainIds[params.chain]);
  }

  throw new Error('Pass chainId or chain.');
}
