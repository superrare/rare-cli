export { createRareClient } from './client.js';
export type {
  RareClient,
  RareClientConfig,
  BuyRareQuote,
  BuyTokenParams,
  SellTokenParams,
  TokenTradeQuote,
  TokenTradeResult,
  GeneratePresetCurvesParams,
  GeneratePresetCurvesResult,
  ValidateLiquidCurvesParams,
  DeployLiquidEditionParams,
  DeployLiquidEditionResult,
} from './types.js';
export type { CurvePresetKey, LiquidCurvePreview, LiquidCurveSegment } from '../liquid/curve-config.js';
export type { LiquidFactoryConfig } from '../liquid/factory-config.js';
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
  canonicalV4Pools,
  contractAddresses,
  chainIds,
  viemChains,
  getCanonicalV4Pools,
  getContractAddresses,
  getBatchListingAddress,
  getErc721ApprovalManagerAddress,
  isSupportedChain,
} from '../contracts/addresses.js';
export type { CanonicalV4Pool, CanonicalV4Pools, ContractAddresses, SupportedChain } from '../contracts/addresses.js';
export { factoryAbi } from '../contracts/abis/factory.js';
export { auctionAbi } from '../contracts/abis/auction.js';
export { liquidFactoryAbi } from '../contracts/abis/liquid-factory.js';
export { liquidRouterAbi } from '../contracts/abis/liquid-router.js';
export { liquidEditionAbi } from '../contracts/abis/liquid-edition.js';
export { tokenAbi } from '../contracts/abis/token.js';
export { batchListingAbi } from '../contracts/abis/batch-listing.js';
export { uniswapV4QuoterAbi } from '../contracts/abis/uniswap-v4-quoter.js';

export {
  buildProofArtifact,
  loadRootArtifact,
  loadProofArtifact,
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
