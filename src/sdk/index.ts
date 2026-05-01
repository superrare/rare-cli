export { createRareClient } from './client.js';
export type { RareClient, RareClientConfig } from './types.js';
export type {
  CollectionSearchParams,
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
  contractAddresses,
  chainIds,
  viemChains,
  getContractAddresses,
  getBatchListingAddress,
  isSupportedChain,
} from '../contracts/addresses.js';
export type { SupportedChain } from '../contracts/addresses.js';
export { factoryAbi } from '../contracts/abis/factory.js';
export { auctionAbi } from '../contracts/abis/auction.js';
export { tokenAbi } from '../contracts/abis/token.js';
export { batchListingAbi } from '../contracts/abis/batch-listing.js';

export {
  buildBatchListingTree,
  buildAllowListTree,
  getTokenProof,
  getAddressProof,
  buildRootArtifact,
  buildProofArtifact,
  loadRootArtifact,
  loadProofArtifact,
  loadTokenSet,
  loadAllowList,
  validateRootArtifact,
  validateProofArtifact,
  writeArtifact,
} from './merkle.js';
export type {
  BatchListingTokenEntry,
  BatchListingRootArtifact,
  BatchListingProofArtifact,
  BatchListingCreateParams,
  BatchListingCreateResult,
  BatchListingCancelParams,
  BatchListingBuyParams,
  BatchListingSetAllowListParams,
  BatchListingStatusParams,
  BatchListingStatus,
} from './types.js';
