import {
  type Address,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
  parseEther,
  parseEventLogs,
} from 'viem';
import { getContractAddresses, chainIds, type SupportedChain } from '../contracts/addresses.js';
import { factoryAbi } from '../contracts/abis/factory.js';
import { tokenAbi } from '../contracts/abis/token.js';
import { auctionAbi } from '../contracts/abis/auction.js';
import {
  importErc721 as importErc721Api,
  pinMetadata as pinMetadataApi,
  searchCollections as searchCollectionsApi,
  searchNfts as searchNftsApi,
  uploadMedia as uploadMediaApi,
  type CollectionSearchParams,
  type ImportErc721Params,
  type NftSearchParams,
  type NftMediaEntry,
  type PinMetadataParams,
  type SearchPageResponse,
} from './api.js';

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
  search: {
    nfts(params?: NftSearchParams): Promise<SearchPageResponse>;
    collections(params?: CollectionSearchParams): Promise<SearchPageResponse>;
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

function requireWallet(config: RareClientConfig): { walletClient: WalletClient; account: Address } {
  if (!config.walletClient) {
    throw new Error('walletClient is required for write operations.');
  }

  const account = config.account ?? config.walletClient.account?.address;
  if (!account) {
    throw new Error('No account available for write operations. Pass config.account or provide walletClient with an account.');
  }

  return { walletClient: config.walletClient, account };
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
        const { walletClient, account } = requireWallet(config);
        const useMintTo = Boolean(params.to || params.royaltyReceiver);

        let txHash: Hash;
        if (useMintTo) {
          const receiver = params.to ?? account;
          const royaltyReceiver = params.royaltyReceiver ?? account;
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
        const { walletClient, account } = requireWallet(config);

        const nftAddress = params.contract;
        const currency = params.currency ?? ETH_ADDRESS;
        const tokenId = toInteger(params.tokenId, 'tokenId');
        const startingPrice = toWei(params.startingPrice);
        const duration = toInteger(params.duration, 'duration');
        const splitAddresses = params.splitAddresses ?? [account];
        const splitRatios = params.splitRatios ?? [100];

        let approvalTxHash: Hash | undefined;
        if (params.autoApprove !== false) {
          const isApproved = await publicClient.readContract({
            address: nftAddress,
            abi: approvalAbi,
            functionName: 'isApprovedForAll',
            args: [account, addresses.auction],
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
        const { walletClient, account } = requireWallet(config);

        const currency = params.currency ?? ETH_ADDRESS;
        const amount = toWei(params.amount);
        const isEth = currency === ETH_ADDRESS;

        const txHash = await walletClient.writeContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'bid',
          args: [params.contract, toInteger(params.tokenId, 'tokenId'), currency, amount],
          account,
          chain: undefined,
          value: isEth ? amount : 0n,
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
    search: {
      async nfts(params = {}) {
        const requestParams = params.chainIds ? params : { ...params, chainIds: [chainId] };
        return searchNftsApi(requestParams);
      },

      async collections(params = {}) {
        return searchCollectionsApi(params);
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
    },
  };
}
