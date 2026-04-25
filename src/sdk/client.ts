import {
  type Address,
  type Hash,
  erc20Abi,
  maxUint256,
  parseEventLogs,
} from 'viem';
import { ETH_ADDRESS, getContractAddresses, chainIds, type SupportedChain } from '../contracts/addresses.js';
import { factoryAbi } from '../contracts/abis/factory.js';
import { tokenAbi } from '../contracts/abis/token.js';
import { auctionAbi } from '../contracts/abis/auction.js';
import type { CurvePresetKey, LiquidCurvePreview, LiquidCurveSegment } from '../liquid/curve-config.js';
import type { LiquidFactoryConfig } from '../liquid/factory-config.js';
import {
  importErc721 as importErc721Api,
  pinMetadata as pinMetadataApi,
  searchCollections as searchCollectionsApi,
  searchNfts as searchNftsApi,
  uploadMedia as uploadMediaApi,
  getNft as getNftApi,
  getNftEvents as getNftEventsApi,
  getCollection as getCollectionApi,
  getCollectionEvents as getCollectionEventsApi,
  getUser as getUserApi,
  getTokenPrice as getTokenPriceApi,
  type CollectionSearchParams,
  type ImportErc721Params,
  type NftSearchParams,
  type NftMediaEntry,
  type NftAttribute,
  type PinMetadataParams,
  type SearchPageResponse,
  type Nft,
  type Collection,
  type NftEvent,
  type UserProfile,
  type Pagination,
} from './api.js';
import { createLiquidNamespace } from './liquid.js';
import { createSwapNamespace } from './swap.js';
import {
  resolveChainFromPublicClient,
  requireWallet,
  toInteger,
  toWei,
  type AmountInput,
  type IntegerInput,
  type RareClientConfig,
  type TransactionResult,
} from './internal.js';

export type { AmountInput, IntegerInput, RareClientConfig, TransactionResult } from './internal.js';

const approvalAbi = [
  {
    inputs: [{ name: 'owner', type: 'address' }, { name: 'operator', type: 'address' }],
    name: 'isApprovedForAll',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }],
    name: 'setApprovalForAll',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export interface DeployErc721Params {
  name: string;
  symbol: string;
  maxTokens?: IntegerInput;
}

export interface DeployErc721Result extends TransactionResult {
  contract: Address | undefined;
}

export interface MintToParams {
  contract: Address;
  tokenUri: string;
  to?: Address;
  royaltyReceiver?: Address;
}

export interface MintToResult extends TransactionResult {
  tokenId: bigint | undefined;
}

export interface AuctionCreateParams {
  contract: Address;
  tokenId: IntegerInput;
  startingPrice: AmountInput;
  duration: IntegerInput;
  currency?: Address;
  splitAddresses?: Address[];
  splitRatios?: number[];
  autoApprove?: boolean;
}

export interface AuctionBidParams {
  contract: Address;
  tokenId: IntegerInput;
  amount: AmountInput;
  currency?: Address;
}

export interface AuctionSettleParams {
  contract: Address;
  tokenId: IntegerInput;
}

export interface AuctionCancelParams {
  contract: Address;
  tokenId: IntegerInput;
}

export interface AuctionStatusParams {
  contract: Address;
  tokenId: IntegerInput;
}

export interface AuctionStatus {
  seller: Address;
  creationBlock: bigint;
  startingTime: bigint;
  lengthOfAuction: bigint;
  currency: Address;
  minimumBid: bigint;
  auctionType: `0x${string}`;
  splitAddresses: Address[];
  splitRatios: number[];
  isEth: boolean;
  started: boolean;
  endTime: bigint | null;
  status: 'PENDING' | 'RUNNING' | 'ENDED';
}

// Marketplace settings ABI for fee calculation
const marketplaceSettingsAbi = [
  {
    inputs: [{ name: '_amount', type: 'uint256' }],
    name: 'calculateMarketplaceFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export interface OfferCreateParams {
  contract: Address;
  tokenId: IntegerInput;
  currency?: Address;
  amount: AmountInput;
  convertible?: boolean;
}

export interface OfferCancelParams {
  contract: Address;
  tokenId: IntegerInput;
  currency?: Address;
}

export interface OfferAcceptParams {
  contract: Address;
  tokenId: IntegerInput;
  currency?: Address;
  amount: AmountInput;
  splitAddresses?: Address[];
  splitRatios?: number[];
}

export interface OfferStatusParams {
  contract: Address;
  tokenId: IntegerInput;
  currency?: Address;
}

export interface OfferStatus {
  buyer: Address;
  amount: bigint;
  timestamp: bigint;
  marketplaceFee: number;
  convertible: boolean;
  hasOffer: boolean;
}

export interface ListingCreateParams {
  contract: Address;
  tokenId: IntegerInput;
  currency?: Address;
  price: AmountInput;
  target?: Address;
  splitAddresses?: Address[];
  splitRatios?: number[];
  autoApprove?: boolean;
}

export interface ListingCancelParams {
  contract: Address;
  tokenId: IntegerInput;
  target?: Address;
}

export interface ListingBuyParams {
  contract: Address;
  tokenId: IntegerInput;
  currency?: Address;
  amount: AmountInput;
}

export interface ListingStatusParams {
  contract: Address;
  tokenId: IntegerInput;
  target?: Address;
}

export interface ListingStatus {
  seller: Address;
  currencyAddress: Address;
  amount: bigint;
  hasListing: boolean;
  isEth: boolean;
}

export interface TokenContractInfo {
  contract: Address;
  chain: SupportedChain;
  name: string;
  symbol: string;
  totalSupply: bigint;
}

export interface TokenInfo {
  contract: Address;
  tokenId: bigint;
  owner: Address;
  tokenUri: string;
}

export interface GeneratePresetCurvesParams {
  preset: CurvePresetKey;
  rarePriceUsd: number;
}

export interface ValidateLiquidCurvesParams {
  curves: LiquidCurveSegment[];
}

export interface DeployLiquidMultiCurveParams {
  name: string;
  symbol: string;
  tokenUri: string;
  initialRareLiquidity?: AmountInput;
  curves: LiquidCurveSegment[];
}

export interface DeployLiquidMultiCurveResult extends TransactionResult {
  contract: Address | undefined;
  tokenUri: string;
  curves: LiquidCurveSegment[];
}

export interface RouterBuyParams {
  token: Address;
  ethAmount: AmountInput;
  minTokensOut: AmountInput;
  commands: `0x${string}`;
  inputs: readonly `0x${string}`[];
  recipient?: Address;
  deadline?: IntegerInput;
}

export interface RouterSellParams {
  token: Address;
  tokenAmount: AmountInput;
  minEthOut: AmountInput;
  commands: `0x${string}`;
  inputs: readonly `0x${string}`[];
  recipient?: Address;
  deadline?: IntegerInput;
}

export interface RouterSwapParams {
  tokenIn: Address;
  amountIn: AmountInput;
  tokenOut: Address;
  minAmountOut: AmountInput;
  commands: `0x${string}`;
  inputs: readonly `0x${string}`[];
  recipient?: Address;
  deadline?: IntegerInput;
}

export interface BuyRareParams {
  ethAmount: AmountInput;
  minRareOut?: AmountInput;
  slippageBps?: IntegerInput;
  recipient?: Address;
  deadline?: IntegerInput;
}

export interface BuyTokenParams {
  token: Address;
  ethAmount: AmountInput;
  minTokensOut?: AmountInput;
  slippageBps?: IntegerInput;
  recipient?: Address;
  deadline?: IntegerInput;
}

export interface SellTokenParams {
  token: Address;
  tokenAmount: AmountInput;
  minEthOut?: AmountInput;
  slippageBps?: IntegerInput;
  recipient?: Address;
  deadline?: IntegerInput;
}

export type TokenTradeRouteSource = 'liquid-edition' | 'known-pool' | 'uniswap-api';
export type TokenTradeExecution = 'liquid-router' | 'uniswap-api';

export interface TokenTradeQuote {
  amountIn: bigint;
  estimatedAmountOut: bigint;
  minAmountOut: bigint;
  tokenIn: Address;
  tokenOut: Address;
  inputDecimals: number;
  outputDecimals: number;
  slippageBps: number;
  routeSource: TokenTradeRouteSource;
  execution: TokenTradeExecution;
  routeDescription: string;
  commands?: `0x${string}`;
  inputs?: readonly `0x${string}`[];
}

export interface TokenTradeResult extends TransactionResult {
  estimatedAmountOut: bigint;
  minAmountOut: bigint;
  routeSource: TokenTradeRouteSource;
  execution: TokenTradeExecution;
  commands?: `0x${string}`;
  inputs?: readonly `0x${string}`[];
  approvalTxHash?: Hash;
  approvalResetTxHash?: Hash;
}

export interface BuyRareQuote {
  ethAmount: bigint;
  rareAddress: Address;
  estimatedRareOut: bigint;
  minRareOut: bigint;
  slippageBps: number;
  commands: `0x${string}`;
  inputs: readonly `0x${string}`[];
}

export interface BuyRareResult extends TransactionResult {
  estimatedRareOut: bigint;
  minRareOut: bigint;
  commands: `0x${string}`;
  inputs: readonly `0x${string}`[];
}

export interface RareClient {
  chain: SupportedChain;
  chainId: number;
  contracts: {
    factory: Address;
    auction: Address;
    liquidFactory?: Address;
    swapRouter?: Address;
    v4Quoter?: Address;
  };
  deploy: {
    erc721(params: DeployErc721Params): Promise<DeployErc721Result>;
  };
  liquid: {
    getFactoryConfig(): Promise<LiquidFactoryConfig>;
    generatePresetCurves(params: GeneratePresetCurvesParams): Promise<LiquidCurveSegment[]>;
    validateCurves(params: ValidateLiquidCurvesParams): Promise<LiquidCurvePreview>;
    deployMultiCurve(params: DeployLiquidMultiCurveParams): Promise<DeployLiquidMultiCurveResult>;
  };
  mint: {
    mintTo(params: MintToParams): Promise<MintToResult>;
  };
  swap: {
    buy(params: RouterBuyParams): Promise<TransactionResult>;
    sell(params: RouterSellParams): Promise<TransactionResult>;
    swap(params: RouterSwapParams): Promise<TransactionResult>;
    quoteBuyToken(params: BuyTokenParams): Promise<TokenTradeQuote>;
    buyToken(params: BuyTokenParams): Promise<TokenTradeResult>;
    quoteSellToken(params: SellTokenParams): Promise<TokenTradeQuote>;
    sellToken(params: SellTokenParams): Promise<TokenTradeResult>;
    quoteBuyRare(params: BuyRareParams): Promise<BuyRareQuote>;
    buyRare(params: BuyRareParams): Promise<BuyRareResult>;
  };
  auction: {
    create(params: AuctionCreateParams): Promise<TransactionResult & { approvalTxHash?: Hash }>;
    bid(params: AuctionBidParams): Promise<TransactionResult>;
    settle(params: AuctionSettleParams): Promise<TransactionResult>;
    cancel(params: AuctionCancelParams): Promise<TransactionResult>;
    getStatus(params: AuctionStatusParams): Promise<AuctionStatus>;
  };
  offer: {
    create(params: OfferCreateParams): Promise<TransactionResult>;
    cancel(params: OfferCancelParams): Promise<TransactionResult>;
    accept(params: OfferAcceptParams): Promise<TransactionResult>;
    getStatus(params: OfferStatusParams): Promise<OfferStatus>;
  };
  listing: {
    create(params: ListingCreateParams): Promise<TransactionResult & { approvalTxHash?: Hash }>;
    cancel(params: ListingCancelParams): Promise<TransactionResult>;
    buy(params: ListingBuyParams): Promise<TransactionResult>;
    getStatus(params: ListingStatusParams): Promise<ListingStatus>;
  };
  search: {
    nfts(params?: NftSearchParams): Promise<SearchPageResponse<Nft>>;
    collections(params?: CollectionSearchParams): Promise<SearchPageResponse<Collection>>;
  };
  nft: {
    get(universalTokenId: string): Promise<Nft>;
    events(universalTokenId: string, opts?: { page?: number; perPage?: number; eventType?: string | string[]; sortBy?: 'newest' | 'oldest' }): Promise<SearchPageResponse<NftEvent>>;
  };
  collection: {
    get(id: string): Promise<Collection>;
    events(id: string, opts?: { page?: number; perPage?: number; eventType?: string | string[]; sortBy?: 'newest' | 'oldest' }): Promise<SearchPageResponse<NftEvent>>;
  };
  user: {
    get(address: string): Promise<UserProfile>;
  };
  media: {
    upload(buffer: Uint8Array, filename: string): Promise<NftMediaEntry>;
    pinMetadata(opts: PinMetadataParams): Promise<string>;
  };
  import: {
    erc721(params: ImportErc721Params): Promise<void>;
  };
  token: {
    getContractInfo(params: { contract: Address }): Promise<TokenContractInfo>;
    getTokenInfo(params: { contract: Address; tokenId: IntegerInput }): Promise<TokenInfo>;
    getPrice(symbol: string): Promise<{ symbol: string; priceUsd: number; decimals: number; chainId: number; address: string }>;
  };
}

export function createRareClient(config: RareClientConfig): RareClient {
  const { publicClient } = config;
  const chain = resolveChainFromPublicClient(publicClient);
  const chainId = chainIds[chain];
  const addresses = getContractAddresses(chain);

  return {
    chain,
    chainId,
    contracts: {
      factory: addresses.factory,
      auction: addresses.auction,
      liquidFactory: addresses.liquidFactory,
      swapRouter: addresses.swapRouter,
      v4Quoter: addresses.v4Quoter,
    },
    deploy: {
      async erc721(params) {
        const { walletClient, account } = requireWallet(config);
        let txHash: Hash;
        if (params.maxTokens !== undefined) {
          txHash = await walletClient.writeContract({
            address: addresses.factory,
            abi: factoryAbi,
            functionName: 'createSovereignBatchMint',
            args: [params.name, params.symbol, toInteger(params.maxTokens, 'maxTokens')],
            account,
            chain: undefined,
          });
        } else {
          txHash = await walletClient.writeContract({
            address: addresses.factory,
            abi: factoryAbi,
            functionName: 'createSovereignBatchMint',
            args: [params.name, params.symbol],
            account,
            chain: undefined,
          });
        }

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        const logs = parseEventLogs({
          abi: factoryAbi,
          logs: receipt.logs,
          eventName: 'SovereignBatchMintCreated',
        });

        return {
          txHash,
          receipt,
          contract: logs[0]?.args.contractAddress,
        };
      },
    },
    liquid: createLiquidNamespace(config, chain, addresses),
    mint: {
      async mintTo(params) {
        const { walletClient, account, accountAddress } = requireWallet(config);
        const useMintTo = Boolean(params.to || params.royaltyReceiver);

        let txHash: Hash;
        if (useMintTo) {
          const receiver = params.to ?? accountAddress;
          const royaltyReceiver = params.royaltyReceiver ?? accountAddress;
          txHash = await walletClient.writeContract({
            address: params.contract,
            abi: tokenAbi,
            functionName: 'mintTo',
            args: [params.tokenUri, receiver, royaltyReceiver],
            account,
            chain: undefined,
          });
        } else {
          txHash = await walletClient.writeContract({
            address: params.contract,
            abi: tokenAbi,
            functionName: 'addNewToken',
            args: [params.tokenUri],
            account,
            chain: undefined,
          });
        }

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        const logs = parseEventLogs({
          abi: tokenAbi,
          logs: receipt.logs,
          eventName: 'Transfer',
        });

        return {
          txHash,
          receipt,
          tokenId: logs[0]?.args.tokenId,
        };
      },
    },
    swap: createSwapNamespace(config, chain, chainId, addresses),
    auction: {
      async create(params) {
        const { walletClient, account, accountAddress } = requireWallet(config);

        const nftAddress = params.contract;
        const currency = params.currency ?? ETH_ADDRESS;
        const tokenId = toInteger(params.tokenId, 'tokenId');
        const startingPrice = toWei(params.startingPrice);
        const duration = toInteger(params.duration, 'duration');
        const splitAddresses = params.splitAddresses ?? [accountAddress];
        const splitRatios = params.splitRatios ?? [100];

        let approvalTxHash: Hash | undefined;
        if (params.autoApprove !== false) {
          const isApproved = await publicClient.readContract({
            address: nftAddress,
            abi: approvalAbi,
            functionName: 'isApprovedForAll',
            args: [accountAddress, addresses.auction],
          });

          if (!isApproved) {
            approvalTxHash = await walletClient.writeContract({
              address: nftAddress,
              abi: approvalAbi,
              functionName: 'setApprovalForAll',
              args: [addresses.auction, true],
              account,
              chain: undefined,
            });

            await publicClient.waitForTransactionReceipt({ hash: approvalTxHash });
          }
        }

        const auctionType = await publicClient.readContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'COLDIE_AUCTION',
        });

        const txHash = await walletClient.writeContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'configureAuction',
          args: [
            auctionType,
            nftAddress,
            tokenId,
            startingPrice,
            currency,
            duration,
            0n,
            splitAddresses,
            splitRatios,
          ],
          account,
          chain: undefined,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        return {
          txHash,
          receipt,
          approvalTxHash,
        };
      },

      async bid(params) {
        const { walletClient, account, accountAddress } = requireWallet(config);

        const currency = params.currency ?? ETH_ADDRESS;
        const amount = toWei(params.amount);
        const isEth = currency === ETH_ADDRESS;

        let value = 0n;
        if (isEth) {
          const settingsAddress = await publicClient.readContract({
            address: addresses.auction,
            abi: auctionAbi,
            functionName: 'marketplaceSettings',
          });
          const fee = await publicClient.readContract({
            address: settingsAddress,
            abi: marketplaceSettingsAbi,
            functionName: 'calculateMarketplaceFee',
            args: [amount],
          });
          value = amount + fee;
        } else {
          try {
            const allowance = await publicClient.readContract({
              address: currency,
              abi: erc20Abi,
              functionName: 'allowance',
              args: [accountAddress, addresses.auction],
            });
            if (BigInt(allowance as any) < amount) {
              const approveTx = await walletClient.writeContract({
                address: currency,
                abi: erc20Abi,
                functionName: 'approve',
                args: [addresses.auction, maxUint256],
                account,
                chain: undefined,
              });
              await publicClient.waitForTransactionReceipt({ hash: approveTx });
            }
          } catch {
            // If allowance check fails, approve anyway
            const approveTx = await walletClient.writeContract({
              address: currency,
              abi: erc20Abi,
              functionName: 'approve',
              args: [addresses.auction, maxUint256],
              account,
              chain: undefined,
            });
            await publicClient.waitForTransactionReceipt({ hash: approveTx });
          }
        }

        const txHash = await walletClient.writeContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'bid',
          args: [params.contract, toInteger(params.tokenId, 'tokenId'), currency, amount],
          account,
          chain: undefined,
          value,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        return { txHash, receipt };
      },

      async settle(params) {
        const { walletClient, account } = requireWallet(config);

        const txHash = await walletClient.writeContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'settleAuction',
          args: [params.contract, toInteger(params.tokenId, 'tokenId')],
          account,
          chain: undefined,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        return { txHash, receipt };
      },

      async cancel(params) {
        const { walletClient, account } = requireWallet(config);

        const txHash = await walletClient.writeContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'cancelAuction',
          args: [params.contract, toInteger(params.tokenId, 'tokenId')],
          account,
          chain: undefined,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        return { txHash, receipt };
      },

      async getStatus(params) {
        const result = await publicClient.readContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'getAuctionDetails',
          args: [params.contract, toInteger(params.tokenId, 'tokenId')],
        });

        const [
          seller,
          creationBlock,
          startingTime,
          lengthOfAuction,
          currency,
          minimumBid,
          auctionType,
          splitAddresses,
          splitRatios,
        ] = result;

        const started = startingTime > 0n;
        const endTime = started ? startingTime + lengthOfAuction : null;
        const now = BigInt(Math.floor(Date.now() / 1000));
        let status: AuctionStatus['status'] = 'PENDING';
        if (started) {
          status = endTime !== null && now >= endTime ? 'ENDED' : 'RUNNING';
        }

        return {
          seller,
          creationBlock,
          startingTime,
          lengthOfAuction,
          currency,
          minimumBid,
          auctionType,
          splitAddresses: [...splitAddresses],
          splitRatios: [...splitRatios],
          isEth: currency === ETH_ADDRESS,
          started,
          endTime,
          status,
        };
      },
    },
    offer: {
      async create(params) {
        const { walletClient, account, accountAddress } = requireWallet(config);

        const currency = params.currency ?? ETH_ADDRESS;
        const amount = toWei(params.amount);
        const isEth = currency === ETH_ADDRESS;
        const convertible = params.convertible ?? false;

        let value = 0n;
        if (isEth) {
          const settingsAddress = await publicClient.readContract({
            address: addresses.auction,
            abi: auctionAbi,
            functionName: 'marketplaceSettings',
          });
          const fee = await publicClient.readContract({
            address: settingsAddress,
            abi: marketplaceSettingsAbi,
            functionName: 'calculateMarketplaceFee',
            args: [amount],
          });
          value = amount + fee;
        } else {
          try {
            const allowance = await publicClient.readContract({
              address: currency,
              abi: erc20Abi,
              functionName: 'allowance',
              args: [accountAddress, addresses.auction],
            });
            if (BigInt(allowance as any) < amount) {
              const approveTx = await walletClient.writeContract({
                address: currency,
                abi: erc20Abi,
                functionName: 'approve',
                args: [addresses.auction, maxUint256],
                account,
                chain: undefined,
              });
              await publicClient.waitForTransactionReceipt({ hash: approveTx });
            }
          } catch {
            // If allowance check fails, approve anyway
            const approveTx = await walletClient.writeContract({
              address: currency,
              abi: erc20Abi,
              functionName: 'approve',
              args: [addresses.auction, maxUint256],
              account,
              chain: undefined,
            });
            await publicClient.waitForTransactionReceipt({ hash: approveTx });
          }
        }

        const txHash = await walletClient.writeContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'offer',
          args: [params.contract, toInteger(params.tokenId, 'tokenId'), currency, amount, convertible],
          account,
          chain: undefined,
          value,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        return { txHash, receipt };
      },

      async cancel(params) {
        const { walletClient, account } = requireWallet(config);

        const currency = params.currency ?? ETH_ADDRESS;

        const txHash = await walletClient.writeContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'cancelOffer',
          args: [params.contract, toInteger(params.tokenId, 'tokenId'), currency],
          account,
          chain: undefined,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        return { txHash, receipt };
      },

      async accept(params) {
        const { walletClient, account, accountAddress } = requireWallet(config);

        const currency = params.currency ?? ETH_ADDRESS;
        const amount = toWei(params.amount);
        const splitAddresses = params.splitAddresses ?? [accountAddress];
        const splitRatios = params.splitRatios ?? [100];

        const txHash = await walletClient.writeContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'acceptOffer',
          args: [params.contract, toInteger(params.tokenId, 'tokenId'), currency, amount, splitAddresses, splitRatios],
          account,
          chain: undefined,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        return { txHash, receipt };
      },

      async getStatus(params) {
        const currency = params.currency ?? ETH_ADDRESS;

        const [buyer, amount, timestamp, marketplaceFee, convertible] = await publicClient.readContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'tokenCurrentOffers',
          args: [params.contract, toInteger(params.tokenId, 'tokenId'), currency],
        });

        const hasOffer = amount > 0n;

        return { buyer, amount, timestamp, marketplaceFee, convertible, hasOffer };
      },
    },
    listing: {
      async create(params) {
        const { walletClient, account, accountAddress } = requireWallet(config);

        const currency = params.currency ?? ETH_ADDRESS;
        const price = toWei(params.price);
        const target = params.target ?? ETH_ADDRESS;
        const splitAddresses = params.splitAddresses ?? [accountAddress];
        const splitRatios = params.splitRatios ?? [100];
        const nftAddress = params.contract;

        let approvalTxHash: Hash | undefined;
        if (params.autoApprove !== false) {
          const isApproved = await publicClient.readContract({
            address: nftAddress,
            abi: approvalAbi,
            functionName: 'isApprovedForAll',
            args: [accountAddress, addresses.auction],
          });

          if (!isApproved) {
            approvalTxHash = await walletClient.writeContract({
              address: nftAddress,
              abi: approvalAbi,
              functionName: 'setApprovalForAll',
              args: [addresses.auction, true],
              account,
              chain: undefined,
            });

            await publicClient.waitForTransactionReceipt({ hash: approvalTxHash });
          }
        }

        const txHash = await walletClient.writeContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'setSalePrice',
          args: [nftAddress, toInteger(params.tokenId, 'tokenId'), currency, price, target, splitAddresses, splitRatios],
          account,
          chain: undefined,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        return { txHash, receipt, approvalTxHash };
      },

      async cancel(params) {
        const { walletClient, account } = requireWallet(config);

        const target = params.target ?? ETH_ADDRESS;

        const txHash = await walletClient.writeContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'removeSalePrice',
          args: [params.contract, toInteger(params.tokenId, 'tokenId'), target],
          account,
          chain: undefined,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        return { txHash, receipt };
      },

      async buy(params) {
        const { walletClient, account, accountAddress } = requireWallet(config);

        const currency = params.currency ?? ETH_ADDRESS;
        const amount = toWei(params.amount);
        const isEth = currency === ETH_ADDRESS;

        let value = 0n;
        if (isEth) {
          const settingsAddress = await publicClient.readContract({
            address: addresses.auction,
            abi: auctionAbi,
            functionName: 'marketplaceSettings',
          });
          const fee = await publicClient.readContract({
            address: settingsAddress,
            abi: marketplaceSettingsAbi,
            functionName: 'calculateMarketplaceFee',
            args: [amount],
          });
          value = amount + fee;
        } else {
          try {
            const allowance = await publicClient.readContract({
              address: currency,
              abi: erc20Abi,
              functionName: 'allowance',
              args: [accountAddress, addresses.auction],
            });
            if (BigInt(allowance as any) < amount) {
              const approveTx = await walletClient.writeContract({
                address: currency,
                abi: erc20Abi,
                functionName: 'approve',
                args: [addresses.auction, maxUint256],
                account,
                chain: undefined,
              });
              await publicClient.waitForTransactionReceipt({ hash: approveTx });
            }
          } catch {
            // If allowance check fails, approve anyway
            const approveTx = await walletClient.writeContract({
              address: currency,
              abi: erc20Abi,
              functionName: 'approve',
              args: [addresses.auction, maxUint256],
              account,
              chain: undefined,
            });
            await publicClient.waitForTransactionReceipt({ hash: approveTx });
          }
        }

        const txHash = await walletClient.writeContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'buy',
          args: [params.contract, toInteger(params.tokenId, 'tokenId'), currency, amount],
          account,
          chain: undefined,
          value,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        return { txHash, receipt };
      },

      async getStatus(params) {
        const target = params.target ?? ETH_ADDRESS;

        const [seller, currencyAddress, amount] = await publicClient.readContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'tokenSalePrices',
          args: [params.contract, toInteger(params.tokenId, 'tokenId'), target],
        });

        const hasListing = amount > 0n;
        const isEth = currencyAddress === ETH_ADDRESS;

        return { seller, currencyAddress, amount, hasListing, isEth };
      },
    },
    search: {
      async nfts(params = {}) {
        const requestParams = params.chainId ? params : { ...params, chainId };
        return searchNftsApi(requestParams);
      },

      async collections(params = {}) {
        return searchCollectionsApi(params);
      },
    },
    nft: {
      async get(universalTokenId) {
        return getNftApi(universalTokenId);
      },
      async events(universalTokenId, opts) {
        return getNftEventsApi(universalTokenId, opts);
      },
    },
    collection: {
      async get(id) {
        return getCollectionApi(id);
      },
      async events(id, opts) {
        return getCollectionEventsApi(id, opts);
      },
    },
    user: {
      async get(address) {
        return getUserApi(address);
      },
    },
    media: {
      async upload(buffer, filename) {
        return uploadMediaApi(buffer, filename);
      },

      async pinMetadata(opts) {
        return pinMetadataApi(opts);
      },
    },
    import: {
      async erc721(params) {
        const owner = params.owner ?? config.account ?? config.walletClient?.account?.address;
        if (!owner) {
          throw new Error('No owner available for import. Pass params.owner or provide config.account/walletClient with an account.');
        }

        await importErc721Api({
          chainId,
          contract: params.contract,
          owner,
        });
      },
    },
    token: {
      async getContractInfo(params) {
        const [name, symbol, totalSupply] = await Promise.all([
          publicClient.readContract({
            address: params.contract,
            abi: tokenAbi,
            functionName: 'name',
          }),
          publicClient.readContract({
            address: params.contract,
            abi: tokenAbi,
            functionName: 'symbol',
          }),
          publicClient.readContract({
            address: params.contract,
            abi: tokenAbi,
            functionName: 'totalSupply',
          }),
        ]);

        return {
          contract: params.contract,
          chain,
          name,
          symbol,
          totalSupply,
        };
      },

      async getTokenInfo(params) {
        const tokenId = toInteger(params.tokenId, 'tokenId');
        const [owner, tokenUri] = await Promise.all([
          publicClient.readContract({
            address: params.contract,
            abi: tokenAbi,
            functionName: 'ownerOf',
            args: [tokenId],
          }),
          publicClient.readContract({
            address: params.contract,
            abi: tokenAbi,
            functionName: 'tokenURI',
            args: [tokenId],
          }),
        ]);

        return {
          contract: params.contract,
          tokenId,
          owner,
          tokenUri,
        };
      },

      async getPrice(symbol) {
        return getTokenPriceApi(symbol);
      },
    },
  };
}
