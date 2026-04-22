import {
  type Address,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
  erc20Abi,
  parseEther,
  parseEventLogs,
  maxUint256,
} from 'viem';
import {
  getContractAddresses,
  chainIds,
  supportedChainFromChainId,
  type SupportedChain,
} from '../contracts/addresses.js';
import { factoryAbi } from '../contracts/abis/factory.js';
import { tokenAbi } from '../contracts/abis/token.js';
import { auctionAbi } from '../contracts/abis/auction.js';
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
import {
  createPreservationUploadSession,
  finalizeTokenPreservation,
  quoteTokenPreservation as quoteTokenPreservationApi,
  uploadPreservationAssets,
  paymentNetworkForChain,
  type PreservationFinalizeJobStatus,
  type PreservationUploadProgress,
  type PreservationQuote,
  type PreservationReceipt,
} from './backup-service.js';
import { parseUniversalTokenId, resolveTokenPreservation } from './backup-resolver.js';
import { createX402PaymentFetch } from './x402-client.js';

const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

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

type IntegerInput = bigint | number | string;
type AmountInput = bigint | number | string;
type WalletAccount = NonNullable<WalletClient['account']>;

export interface RareClientConfig {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  account?: Address;
}

export interface TransactionResult {
  txHash: Hash;
  receipt: TransactionReceipt;
}

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

export type BackupPublicClientResolver = (chain: SupportedChain) => PublicClient;

export interface QuoteTokenPreservationParams {
  serviceUrl: string;
  contract?: Address;
  tokenId?: IntegerInput;
  universalTokenId?: string;
  sourceChain?: SupportedChain;
  paymentChain?: SupportedChain;
  gatewayUrl?: string;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
  publicClientResolver?: BackupPublicClientResolver;
}

export interface PreserveTokenParams extends QuoteTokenPreservationParams {
  paymentWalletClient?: WalletClient;
  paymentRpcUrl?: string;
  paymentFetch?: typeof fetch;
  onUploadProgress?: (progress: PreservationUploadProgress) => void;
  onFinalizeStatusUpdate?: (status: PreservationFinalizeJobStatus) => void;
}

export interface PreserveTokenResult {
  quote: PreservationQuote;
  receipt: PreservationReceipt;
}

export interface RareClient {
  chain: SupportedChain;
  chainId: number;
  contracts: {
    factory: Address;
    auction: Address;
  };
  deploy: {
    erc721(params: DeployErc721Params): Promise<DeployErc721Result>;
  };
  mint: {
    mintTo(params: MintToParams): Promise<MintToResult>;
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
  backup: {
    quoteTokenPreservation(params: QuoteTokenPreservationParams): Promise<PreservationQuote>;
    preserveToken(params: PreserveTokenParams): Promise<PreserveTokenResult>;
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

function resolveChainFromPublicClient(publicClient: PublicClient): SupportedChain {
  const chainId = publicClient.chain?.id;
  if (!chainId) {
    throw new Error('Unable to resolve chain from publicClient.chain.id. Create your public client with an explicit chain.');
  }

  for (const [chain, id] of Object.entries(chainIds)) {
    if (id === chainId) {
      return chain as SupportedChain;
    }
  }

  throw new Error(`Unsupported chain id: ${chainId}. Supported chain ids: ${Object.values(chainIds).join(', ')}`);
}

function requireWallet(config: RareClientConfig): {
  walletClient: WalletClient;
  account: Address | WalletAccount;
  accountAddress: Address;
} {
  if (!config.walletClient) {
    throw new Error('walletClient is required for write operations.');
  }

  const walletAccount = config.walletClient.account;

  if (config.account) {
    if (walletAccount && walletAccount.address.toLowerCase() === config.account.toLowerCase()) {
      return {
        walletClient: config.walletClient,
        account: walletAccount,
        accountAddress: walletAccount.address,
      };
    }

    return {
      walletClient: config.walletClient,
      account: config.account,
      accountAddress: config.account,
    };
  }

  if (!walletAccount) {
    throw new Error('No account available for write operations. Pass config.account or provide walletClient with an account.');
  }

  return {
    walletClient: config.walletClient,
    account: walletAccount,
    accountAddress: walletAccount.address,
  };
}

function toInteger(value: IntegerInput, field: string): bigint {
  if (typeof value === 'bigint') return value;

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error(`${field} must be an integer.`);
    }
    return BigInt(value);
  }

  try {
    return BigInt(value);
  } catch {
    throw new Error(`${field} must be an integer.`);
  }
}

function toWei(value: AmountInput): bigint {
  if (typeof value === 'bigint') {
    return value;
  }

  return parseEther(String(value));
}

function resolveBackupSourceChain(params: QuoteTokenPreservationParams, defaultChain: SupportedChain): SupportedChain {
  if (params.universalTokenId) {
    return parseUniversalTokenId(params.universalTokenId).chain;
  }

  return params.sourceChain ?? defaultChain;
}

function resolveBackupPublicClient(
  config: RareClientConfig,
  params: QuoteTokenPreservationParams,
  sourceChain: SupportedChain,
): PublicClient {
  if (sourceChain === resolveChainFromPublicClient(config.publicClient)) {
    return config.publicClient;
  }

  const resolved = params.publicClientResolver?.(sourceChain);
  if (!resolved) {
    throw new Error(
      `No public client available for "${sourceChain}". Pass params.publicClientResolver(chain) to use backup flows across chains.`
    );
  }

  return resolved;
}

function resolveBackupPaymentAccount(
  config: RareClientConfig,
  params: PreserveTokenParams,
  paymentChain: SupportedChain,
): { account: WalletAccount; rpcUrl: string } {
  const walletClient = params.paymentWalletClient ?? config.walletClient;
  if (!walletClient) {
    throw new Error('paymentWalletClient is required for preservation payments.');
  }

  const account = walletClient.account;
  if (!account) {
    throw new Error('paymentWalletClient must include an account for preservation payments.');
  }

  const configuredChain = walletClient.chain?.id ? supportedChainFromChainId(walletClient.chain.id) : undefined;
  if (configuredChain && configuredChain !== paymentChain) {
    throw new Error(
      `paymentWalletClient is configured for "${configuredChain}", but preservation payment chain is "${paymentChain}".`
    );
  }

  const rpcUrl = params.paymentRpcUrl ?? extractRpcUrl(walletClient);
  if (!rpcUrl) {
    throw new Error(
      `No RPC URL available for preservation payment chain "${paymentChain}". Pass params.paymentRpcUrl.`
    );
  }

  return { account, rpcUrl };
}

function extractRpcUrl(walletClient: WalletClient): string | undefined {
  const transport = walletClient.transport as
    | { url?: string; value?: { url?: string }; config?: { url?: string } }
    | undefined;
  return transport?.url ?? transport?.value?.url ?? transport?.config?.url;
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
    backup: {
      async quoteTokenPreservation(params) {
        const sourceChain = resolveBackupSourceChain(params, chain);
        const paymentChain = params.paymentChain ?? sourceChain;
        const sourcePublicClient = resolveBackupPublicClient(config, params, sourceChain);
        const resolved = await resolveTokenPreservation({
          publicClient: sourcePublicClient,
          chain: sourceChain,
          contract: params.contract,
          tokenId: params.tokenId,
          universalTokenId: params.universalTokenId,
          gatewayUrl: params.gatewayUrl,
          maxBytes: params.maxBytes,
          fetchImpl: params.fetchImpl,
        });

        return quoteTokenPreservationApi({
          serviceUrl: params.serviceUrl,
          request: {
            source: resolved.source,
            assets: resolved.assets.map(({ assetId, role, originalUri, filename, mimeType, size, sha256 }) => ({
              assetId,
              role,
              originalUri,
              filename,
              mimeType,
              size,
              sha256,
            })),
            preferredPaymentChain: paymentChain,
          },
          fetchImpl: params.fetchImpl,
        });
      },

      async preserveToken(params) {
        const sourceChain = resolveBackupSourceChain(params, chain);
        const paymentChain = params.paymentChain ?? sourceChain;
        const sourcePublicClient = resolveBackupPublicClient(config, params, sourceChain);
        const resolved = await resolveTokenPreservation({
          publicClient: sourcePublicClient,
          chain: sourceChain,
          contract: params.contract,
          tokenId: params.tokenId,
          universalTokenId: params.universalTokenId,
          gatewayUrl: params.gatewayUrl,
          maxBytes: params.maxBytes,
          fetchImpl: params.fetchImpl,
        });

        const quote = await quoteTokenPreservationApi({
          serviceUrl: params.serviceUrl,
          request: {
            source: resolved.source,
            assets: resolved.assets.map(({ assetId, role, originalUri, filename, mimeType, size, sha256 }) => ({
              assetId,
              role,
              originalUri,
              filename,
              mimeType,
              size,
              sha256,
            })),
            preferredPaymentChain: paymentChain,
          },
          fetchImpl: params.fetchImpl,
        });

        const selectedNetwork = paymentNetworkForChain(paymentChain);
        if (!quote.acceptedPayments.some((option) => option.network === selectedNetwork)) {
          throw new Error(
            `Preservation service does not advertise a payment option for "${paymentChain}" (${selectedNetwork}).`
          );
        }

        const { account, rpcUrl } = resolveBackupPaymentAccount(config, params, paymentChain);
        const paymentFetch =
          params.paymentFetch ??
          createX402PaymentFetch({
            paymentChain,
            rpcUrl,
            account,
            fetchImpl: params.fetchImpl,
          });

        const uploadSession = await createPreservationUploadSession({
          serviceUrl: params.serviceUrl,
          quoteId: quote.quoteId,
          fetchImpl: paymentFetch,
        });

        await uploadPreservationAssets(
          params.serviceUrl,
          uploadSession,
          resolved.assets,
          params.fetchImpl,
          params.onUploadProgress,
        );

        const receipt = await finalizeTokenPreservation({
          serviceUrl: params.serviceUrl,
          quoteId: quote.quoteId,
          uploadToken: uploadSession.uploadToken,
          fetchImpl: params.fetchImpl,
          onStatusUpdate: params.onFinalizeStatusUpdate,
        });

        return {
          quote,
          receipt,
        };
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
