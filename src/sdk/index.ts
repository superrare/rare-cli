export { createRareClient } from './client.js';
export type { RareClient, RareClientConfig } from './client.js';
export type {
  CollectionSearchParams,
  ImportErc721Params,
  NftAttribute,
  NftMediaEntry,
  NftSearchParams,
  PinMetadataParams,
  SearchPageResponse,
} from './api.js';

export {
  contractAddresses,
  chainIds,
  viemChains,
  getContractAddresses,
  isSupportedChain,
} from '../contracts/addresses.js';
export type { SupportedChain } from '../contracts/addresses.js';
export { factoryAbi } from '../contracts/abis/factory.js';
export { auctionAbi } from '../contracts/abis/auction.js';
export { tokenAbi } from '../contracts/abis/token.js';
