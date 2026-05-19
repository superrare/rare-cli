export { createRareClient } from './client.js';

export type * from './types/common.js';
export type * from './types/client.js';
export type * from './types/auction.js';
export type * from './types/offer.js';
export type * from './types/listing.js';
export type * from './types/batch-listing.js';
export type * from './types/batch-offer.js';
export type * from './types/batch-auction.js';
export type * from './types/release.js';
export type * from './types/token.js';
export type * from './types/liquid.js';
export type * from './types/swap.js';
export type * from './types/collection.js';
export type * from './types/utils.js';
export type { CurvePresetKey, LiquidCurvePreview, LiquidCurveSegment } from '../liquid/curve-config.js';
export type { LiquidFactoryConfig } from '../liquid/factory-config.js';

export { NftApprovalRequiredError } from './approvals-shell.js';
export { PaymentApprovalRequiredError } from './payments-shell.js';
export {
  MAX_PAYOUT_SPLIT_RECIPIENTS,
  planPayoutSplits,
  planProvidedPayoutSplits,
} from './splits-core.js';
export type { PayoutSplits } from './splits-core.js';

export {
  buildCollectionMintBatchWrite,
  buildCollectionPrepareLazyMintWrite,
  lazySovereignCollectionContractTypes,
  normalizeLazySovereignCollectionContractType,
  planCollectionMintBatch,
  planCollectionPrepareLazyMint,
} from './collection-core.js';
export {
  planBatchOfferAccept,
  planBatchOfferCreate,
  planBatchOfferRoot,
  resolveBatchOfferRoot,
  shapeBatchOfferStatus,
} from './batch-offer-core.js';
export {
  addMarketplaceFee,
  planBatchAuctionBid,
  planBatchAuctionCreate,
  planBatchAuctionRoot,
  planBatchAuctionStatus,
  planBatchAuctionToken,
  resolveBatchAuctionRoot,
  shapeBatchAuctionStatus,
} from './batch-auction-core.js';
export {
  buildBatchTokenTreeArtifact,
  buildBatchTokenTreeArtifact as buildUtilsTreeArtifact,
  getBatchTokenProof,
  getBatchTokenProof as getUtilsTreeProof,
  hashBatchToken,
  hashBatchToken as hashUtilsTreeToken,
  normalizeBytes32 as normalizeBatchBytes32,
  parseBatchTokenList,
  parseBatchTokenList as parseUtilsTreeTokenList,
  parseBatchTokenListArtifact,
  parseBatchTokenListArtifact as parseUtilsTreeArtifact,
  parseBatchTokenListArtifactOrBuild,
  parseBatchTokenListArtifactOrBuild as parseUtilsTreeArtifactOrBuild,
  parseBatchTokenProofArtifact,
  parseBatchTokenProofArtifact as parseUtilsTreeProofArtifact,
  verifyBatchTokenProof,
  verifyBatchTokenProof as verifyUtilsTreeProof,
} from './batch-core.js';
export {
  buildMintPinMetadataParams,
  isMintMetadataOptionsError,
  parseMintAttribute,
  planMintTokenUri,
} from './mint-core.js';
export type {
  BatchToken,
  BatchTokenListArtifact,
  BatchTokenListInputFormat,
  BatchTokenProofArtifact,
  BatchTokenProofParams,
  BatchTokenProofVerifyParams,
  BatchTokenTreeEntry,
  BuildBatchTokenTreeParams,
  BuildUtilsTreeParams,
  UtilsTreeArtifact,
  UtilsTreeEntry,
  UtilsTreeProofArtifact,
  UtilsTreeProofParams,
  UtilsTreeProofVerifyParams,
  UtilsTreeToken,
} from './batch-core.js';
export type {
  BatchOfferAcceptPlan,
  BatchOfferCreatePlan,
  BatchOfferRootPlan,
} from './batch-offer-core.js';
export type {
  BatchAuctionBidPlan,
  BatchAuctionBidRead,
  BatchAuctionCreatePlan,
  BatchAuctionMerkleConfigRead,
  BatchAuctionReadDetails,
  BatchAuctionRootContext,
  BatchAuctionRootPlan,
  BatchAuctionStatusPlan,
  BatchAuctionTokenPlan,
} from './batch-auction-core.js';
export type { LazySovereignCollectionContractType } from './collection-core.js';
export { buildCollectionId, resolveEventSearchTarget } from './event-search-core.js';
export type { CollectionIdentityParams, EventSearchTarget, EventSearchTargetParams } from './event-search-core.js';
export { buildNftUniversalTokenId } from './nft-core.js';
export type { NftIdentityParams } from './nft-core.js';

export {
  buildReleaseAllowlistArtifact,
  buildReleaseAllowlistArtifactFromInput,
  getReleaseAllowlistProof,
  normalizeReleaseAllowlistProof,
  parseReleaseAllowlistArtifact,
  parseReleaseAllowlistArtifactJson,
  parseReleaseAllowlistCsv,
  parseReleaseAllowlistJson,
  verifyReleaseAllowlistProof,
} from './release-core.js';
export type {
  MintGeneratedMetadataPlan,
  MintMetadataMedia,
  MintMetadataUploadPlan,
  MintMetadataUploadRole,
  MintTokenUriPlan,
  MintTokenUriPlanParams,
} from './mint-core.js';
export type {
  CollectionSearchParams,
  EventSearchParams,
  ImportErc721Params,
  NftAttribute,
  NftMediaEntry,
  NftSearchParams,
  PinMetadataParams,
  SearchPageResponse,
  Nft,
  Collection,
  NftEvent,
  UserProfile,
  Pagination,
} from './api.js';

export {
  canonicalV4Pools,
  contractAddresses,
  chainIds,
  viemChains,
  getCanonicalV4Pools,
  getContractAddresses,
  getBatchListingAddress,
  getErc721ApprovalManagerAddress,
  getRareMinterAddress,
  isSupportedChain,
  requireContractAddress,
} from '../contracts/addresses.js';
export type { CanonicalV4Pool, CanonicalV4Pools, ContractAddresses, SupportedChain } from '../contracts/addresses.js';
export { factoryAbi } from '../contracts/abis/factory.js';
export { sovereignFactoryAbi } from '../contracts/abis/sovereign-factory.js';
export { lazySovereignFactoryAbi } from '../contracts/abis/lazy-sovereign-factory.js';
export { auctionAbi } from '../contracts/abis/auction.js';
export { liquidFactoryAbi } from '../contracts/abis/liquid-factory.js';
export { liquidRouterAbi } from '../contracts/abis/liquid-router.js';
export { liquidEditionAbi } from '../contracts/abis/liquid-edition.js';
export { batchOfferAbi } from '../contracts/abis/batch-offer.js';
export { batchAuctionHouseAbi } from '../contracts/abis/batch-auctionhouse.js';
export { tokenAbi } from '../contracts/abis/token.js';
export { batchListingAbi } from '../contracts/abis/batch-listing.js';
export { collectionMintAbi } from '../contracts/abis/collection-mint.js';
export { uniswapV4QuoterAbi } from '../contracts/abis/uniswap-v4-quoter.js';
export { rareMinterAbi } from '../contracts/abis/rare-minter.js';

export {
  buildMerkleProofArtifact,
  validateRootArtifact,
  validateProofArtifact,
} from './merkle-core.js';
