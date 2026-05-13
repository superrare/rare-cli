import type { PublicClient } from 'viem';
import type { SupportedChain } from '../contracts/addresses.js';
import type { RareClient, RareClientConfig } from './types.js';
import {
  buildBatchTokenTreeArtifact,
  getBatchTokenProof,
  verifyBatchTokenProof,
} from './batch-core.js';
import { createBatchOfferNamespace } from './batch-offer.js';
import { createBatchAuctionNamespace } from './batch-auction.js';

export function createBatchNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  chain: SupportedChain,
): RareClient['batch'] {
  return {
    buildTree(params): ReturnType<RareClient['batch']['buildTree']> {
      return buildBatchTokenTreeArtifact(params);
    },

    getTreeProof(params): ReturnType<RareClient['batch']['getTreeProof']> {
      return getBatchTokenProof(params);
    },

    verifyTreeProof(params): ReturnType<RareClient['batch']['verifyTreeProof']> {
      return verifyBatchTokenProof(params);
    },

    offer: createBatchOfferNamespace(publicClient, config, chain),
    auction: createBatchAuctionNamespace(publicClient, config, chain),
  };
}
