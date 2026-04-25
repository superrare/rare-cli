export { createRareClient } from './client.js';
export type {
  RareClient,
  RareClientConfig,
  QuoteTokenPreservationParams,
  PreserveTokenParams,
  PreserveTokenResult,
} from './client.js';
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
  isSupportedChain,
  supportedChainFromChainId,
} from '../contracts/addresses.js';
export type { SupportedChain } from '../contracts/addresses.js';
export { factoryAbi } from '../contracts/abis/factory.js';
export { auctionAbi } from '../contracts/abis/auction.js';
export { tokenAbi } from '../contracts/abis/token.js';
export type {
  PreservationAsset,
  PreservationFinalizeJobStatus,
  PreservationFinalizeProgressPhase,
  PreservationPaymentLifecycleStatus,
  PreservationPaymentOption,
  PreservationQuote,
  PreservationQuotePaymentStatus,
  PreservationReceipt,
  TokenPreservationSource,
} from './backup-service.js';
