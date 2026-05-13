import type { RareClient } from './types.js';
import {
  buildBatchTokenTreeArtifact,
  getBatchTokenProof,
  verifyBatchTokenProof,
} from './batch-core.js';

export function createBatchNamespace(): RareClient['batch'] {
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
  };
}
