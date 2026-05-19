import type { UtilsNamespace } from './types/utils.js';
import {
  buildBatchTokenTreeArtifact,
  getBatchTokenProof,
  verifyBatchTokenProof,
} from './batch-core.js';
import { buildMerkleProofArtifact } from './merkle-core.js';

export type * from './types/utils.js';

export function createUtilsNamespace(): UtilsNamespace {
  return {
    tree: {
      build(params): ReturnType<UtilsNamespace['tree']['build']> {
        return buildBatchTokenTreeArtifact(params);
      },

      proof(params): ReturnType<UtilsNamespace['tree']['proof']> {
        return getBatchTokenProof(params);
      },

      verify(params): ReturnType<UtilsNamespace['tree']['verify']> {
        return verifyBatchTokenProof(params);
      },
    },

    merkle: {
      proof(params): ReturnType<UtilsNamespace['merkle']['proof']> {
        return buildMerkleProofArtifact(params.artifact, params.contract, params.tokenId, params.buyer);
      },
    },
  };
}
