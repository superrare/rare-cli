import type {
  BuildUtilsTreeParams,
  UtilsTreeArtifact,
  UtilsTreeProofArtifact,
  UtilsTreeProofParams,
  UtilsTreeProofVerifyParams,
} from '../batch-core.js';
import type { UtilsMerkleProofArtifact, UtilsMerkleProofParams } from './batch-listing.js';

export type {
  BuildUtilsTreeParams,
  UtilsTreeArtifact,
  UtilsTreeProofArtifact,
  UtilsTreeProofParams,
  UtilsTreeProofVerifyParams,
} from '../batch-core.js';
export type { UtilsMerkleProofArtifact, UtilsMerkleProofParams } from './batch-listing.js';

export type UtilsNamespace = {
  tree: {
    build: (params: BuildUtilsTreeParams) => UtilsTreeArtifact;
    proof: (params: UtilsTreeProofParams) => UtilsTreeProofArtifact;
    verify: (params: UtilsTreeProofVerifyParams) => boolean;
  };
  merkle: {
    proof: (params: UtilsMerkleProofParams) => UtilsMerkleProofArtifact;
  };
}
