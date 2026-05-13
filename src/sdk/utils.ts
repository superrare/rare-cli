import type { RareClient } from './types.js';
import {
  buildBatchTokenTreeArtifact,
  getBatchTokenProof,
  verifyBatchTokenProof,
} from './batch-core.js';
import { buildMerkleProofArtifact } from './merkle.js';

export function createUtilsNamespace(): RareClient['utils'] {
  return {
    tree: {
      build(params): ReturnType<RareClient['utils']['tree']['build']> {
        return buildBatchTokenTreeArtifact(params);
      },

      proof(params): ReturnType<RareClient['utils']['tree']['proof']> {
        return getBatchTokenProof(params);
      },

      verify(params): ReturnType<RareClient['utils']['tree']['verify']> {
        return verifyBatchTokenProof(params);
      },
    },

    merkle: {
      proof(params): ReturnType<RareClient['utils']['merkle']['proof']> {
        return buildMerkleProofArtifact(params.artifact, params.contract, params.tokenId, params.buyer);
      },
    },
  };
}
