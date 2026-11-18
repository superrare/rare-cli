/**
 * Compatibility shim for the former SDK utilities entry point.
 *
 * @deprecated Import from `@rareprotocol/rare-sdk/utils` instead. This
 * re-export remains only for existing `@rareprotocol/rare-cli/utils` consumers.
 */
export * from '@rareprotocol/rare-sdk/utils';

// Keep the CLI 2.x compatibility surface stable while the SDK adopts
// domain-oriented utility names.
export {
  buildBatchTokenTree as buildUtilsTree,
  getBatchTokenProof as getUtilsTreeProof,
  verifyBatchTokenProof as verifyUtilsTreeProof,
  buildMerkleProof as buildUtilsMerkleProof,
  parseBatchTokenTreeInput as parseUtilsTreeInput,
  parseBatchTokenProof as parseUtilsTreeProof,
  validateBatchTokenProofTarget as validateUtilsTreeProofTarget,
  normalizeMerkleRoot as normalizeUtilsMerkleRoot,
  normalizeTokenId as normalizeUtilsTokenId,
  parseBatchListingArtifact as parseUtilsBatchListingArtifact,
  buildBatchListingArtifact as buildUtilsBatchListingArtifact,
  validateMerkleRootArtifact as validateUtilsMerkleRootArtifact,
  validateMerkleProofArtifact as validateUtilsMerkleProofArtifact,
  buildReleaseAllowlistArtifact as buildUtilsReleaseAllowlist,
  getReleaseAllowlistProof as getUtilsReleaseAllowlistProof,
  normalizeReleaseAllowlistProof as normalizeUtilsReleaseAllowlistProof,
  normalizeReleasePrice as normalizeUtilsReleasePrice,
  normalizeReleaseStartTime as normalizeUtilsReleaseStartTime,
  normalizeReleaseAllowlistConfig as validateUtilsReleaseAllowlistConfig,
  parseReleaseAllowlistArtifact as parseUtilsReleaseAllowlistArtifact,
} from '@rareprotocol/rare-sdk/utils';

export type {
  BuildBatchTokenTreeParams as BuildUtilsTreeParams,
  BatchTokenTreeArtifact as UtilsTreeArtifact,
  BatchTokenTreeProofArtifact as UtilsTreeProofArtifact,
  BatchTokenTreeProofParams as UtilsTreeProofParams,
  BatchTokenTreeProofVerifyParams as UtilsTreeProofVerifyParams,
  ParseCurveConfigParams as UtilsParseCurveConfigParams,
  BuildBatchListingArtifactParams as UtilsBuildBatchListingArtifactParams,
  BuildBatchListingArtifactResult as UtilsBuildBatchListingArtifactResult,
  NormalizeReleaseAllowlistConfigParams as UtilsValidateReleaseAllowlistParams,
  NormalizedReleaseAllowlistConfig as UtilsValidatedReleaseAllowlist,
} from '@rareprotocol/rare-sdk/utils';
