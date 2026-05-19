import {
  buildBatchTokenTreeArtifact,
  getBatchTokenProof,
  verifyBatchTokenProof,
} from './batch-core.js';
import { buildMerkleProofArtifact } from './merkle-core.js';
import type {
  BuildUtilsTreeParams,
  UtilsTreeArtifact,
  UtilsTreeProofArtifact,
  UtilsTreeProofParams,
  UtilsTreeProofVerifyParams,
} from './types/utils.js';
import type { UtilsMerkleProofArtifact, UtilsMerkleProofParams } from './types/utils.js';

export type {
  BuildUtilsTreeParams,
  UtilsTreeArtifact,
  UtilsTreeProofArtifact,
  UtilsTreeProofParams,
  UtilsTreeProofVerifyParams,
  UtilsMerkleProofArtifact,
  UtilsMerkleProofParams,
} from './types/utils.js';

export function buildUtilsTree(params: BuildUtilsTreeParams): UtilsTreeArtifact {
  return buildBatchTokenTreeArtifact(params);
}

export function getUtilsTreeProof(params: UtilsTreeProofParams): UtilsTreeProofArtifact {
  return getBatchTokenProof(params);
}

export function verifyUtilsTreeProof(params: UtilsTreeProofVerifyParams): boolean {
  return verifyBatchTokenProof(params);
}

export function buildUtilsMerkleProof(params: UtilsMerkleProofParams): UtilsMerkleProofArtifact {
  return buildMerkleProofArtifact(params.artifact, params.contract, params.tokenId, params.buyer);
}
