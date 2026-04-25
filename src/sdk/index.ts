export { createRareClient } from './client.js';
export type {
  RareClient,
  RareClientConfig,
  BuyRareQuote,
  BuyTokenParams,
  SellTokenParams,
  TokenTradeQuote,
  TokenTradeResult,
  DeployLiquidMultiCurveParams,
  DeployLiquidMultiCurveResult,
} from './client.js';
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
  contractAddresses,
  chainIds,
  viemChains,
  getContractAddresses,
  isSupportedChain,
} from '../contracts/addresses.js';
export type { SupportedChain } from '../contracts/addresses.js';
export { factoryAbi } from '../contracts/abis/factory.js';
export { auctionAbi } from '../contracts/abis/auction.js';
export { liquidFactoryAbi } from '../contracts/abis/liquid-factory.js';
export { liquidRouterAbi } from '../contracts/abis/liquid-router.js';
export { liquidEditionAbi } from '../contracts/abis/liquid-edition.js';
export { tokenAbi } from '../contracts/abis/token.js';
export { uniswapV4QuoterAbi } from '../contracts/abis/uniswap-v4-quoter.js';
