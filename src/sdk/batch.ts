import type { RareClient } from './types.js';
import {
  buildBatchTokenTreeArtifact,
  getBatchTokenProof,
  verifyBatchTokenProof,
} from './batch-core.js';

export function createBatchNamespace(): RareClient['batch'] {
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
  };
}
