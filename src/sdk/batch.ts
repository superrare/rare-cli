import type { PublicClient } from 'viem';
import type { SupportedChain } from '../contracts/addresses.js';
import type { RareClient, RareClientConfig } from './types.js';
import {
  buildBatchTokenTreeArtifact,
  getBatchTokenProof,
  verifyBatchTokenProof,
} from './batch-core.js';
import { createBatchOfferNamespace } from './batch-offer.js';

export function createBatchNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  chain: SupportedChain,
): RareClient['batch'] {
  return {
    buildTree(params) {
      return buildBatchTokenTreeArtifact(params);
    },

    getTreeProof(params) {
      return getBatchTokenProof(params);
    },

    verifyTreeProof(params) {
      return verifyBatchTokenProof(params);
    },

    offer: createBatchOfferNamespace(publicClient, config, chain),
  };
}
