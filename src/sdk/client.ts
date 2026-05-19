import { getContractAddresses, chainIds } from '../contracts/addresses.js';
import type { Address } from 'viem';
import { createRareApi } from './api.js';
import type { RareClientConfig, RareClient } from './types/client.js';
import { resolveChainFromPublicClient } from './helpers.js';
import { createDeployNamespace } from './deploy.js';
import { createCollectionMint } from './mint.js';
import { createAuctionNamespace } from './auction.js';
import { createOfferNamespace } from './offer.js';
import { createListingNamespace } from './listing.js';
import { createBatchListingNamespace } from './batch-listing.js';
import { createBatchAuctionNamespace } from './batch-auction.js';
import { createBatchOfferNamespace } from './batch-offer.js';
import { createTokenNamespace } from './token.js';
import { createCurrencyNamespace } from './currency.js';
import { createLiquidNamespace } from './liquid.js';
import { createSwapNamespace } from './swap.js';
import { createReleaseNamespace } from './release.js';
import { createCollectionNamespace } from './collection.js';
import { createUtilsNamespace } from './utils.js';
import { buildNftUniversalTokenId } from './nft-core.js';

export type * from './types/client.js';

export function createRareClient(config: RareClientConfig): RareClient {
  const { publicClient } = config;
  const chain = resolveChainFromPublicClient(publicClient);
  const chainId = chainIds[chain];
  const addresses = getContractAddresses(chain);
  const api = createRareApi({
    baseUrl: config.apiBaseUrl,
    fetch: config.apiFetch,
  });
  const release = createReleaseNamespace(publicClient, config, chain, addresses);
  const collectionDeploy = createDeployNamespace(publicClient, config, addresses);
  const collectionMint = createCollectionMint(publicClient, config);
  const batchListingAddresses = {
    get batchListing(): Address {
      if (!addresses.batchListing) {
        throw new Error(
          `Batch listing marketplace is not deployed on "${chain}". Available on: mainnet, sepolia.`,
        );
      }
      return addresses.batchListing;
    },
    get marketplaceSettings(): Address {
      if (!addresses.marketplaceSettings) {
        throw new Error(
          `Marketplace settings is not configured for batch listings on "${chain}". Available on: mainnet, sepolia.`,
        );
      }
      return addresses.marketplaceSettings;
    },
    get erc20ApprovalManager(): Address {
      if (!addresses.erc20ApprovalManager) {
        throw new Error(
          `ERC20 approval manager is not deployed on "${chain}". Available on: mainnet, sepolia.`,
        );
      }
      return addresses.erc20ApprovalManager;
    },
    get erc721ApprovalManager(): Address {
      if (!addresses.erc721ApprovalManager) {
        throw new Error(
          `ERC721 approval manager is not deployed on "${chain}". Available on: mainnet, sepolia.`,
        );
      }
      return addresses.erc721ApprovalManager;
    },
    chain,
    chainId,
  };
  const auction = {
    ...createAuctionNamespace(publicClient, config, chain, addresses),
    batch: createBatchAuctionNamespace(publicClient, config, chain),
  };
  const offer = {
    ...createOfferNamespace(publicClient, config, chain, addresses),
    batch: createBatchOfferNamespace(publicClient, config, chain),
  };
  const listing = {
    ...createListingNamespace(publicClient, config, chain, addresses),
    release,
    batch: createBatchListingNamespace(publicClient, config, batchListingAddresses),
  };

  return {
    chain,
    chainId,
    contracts: {
      factory: addresses.factory,
      auction: addresses.auction,
      sovereignFactory: addresses.sovereignFactory,
      lazySovereignFactory: addresses.lazySovereignFactory,
      rareMinter: addresses.rareMinter,
      lazyBatchMintFactory: addresses.lazyBatchMintFactory,
      batchListing: addresses.batchListing,
      batchOfferCreator: addresses.batchOfferCreator,
      batchAuctionHouse: addresses.batchAuctionHouse,
      marketplaceSettings: addresses.marketplaceSettings,
      erc20ApprovalManager: addresses.erc20ApprovalManager,
      erc721ApprovalManager: addresses.erc721ApprovalManager,
      liquidFactory: addresses.liquidFactory,
      swapRouter: addresses.swapRouter,
      v4Quoter: addresses.v4Quoter,
    },
    liquidEdition: createLiquidNamespace(config, chain, addresses),
    swap: createSwapNamespace(config, chain, chainId, addresses),
    auction,
    offer,
    listing,
    utils: createUtilsNamespace(),
    token: createTokenNamespace(publicClient, chain),
    currency: createCurrencyNamespace(publicClient, chain),
    search: {
      async nfts(params = {}): ReturnType<RareClient['search']['nfts']> {
        assertNoClientChainOverride(params, 'rare.search.nfts', chain);
        const requestParams = { ...params, chainId };
        return api.searchNfts(requestParams);
      },

      async collections(params = {}): ReturnType<RareClient['search']['collections']> {
        assertNoClientChainOverride(params, 'rare.search.collections', chain);
        const requestParams = { ...params, chainId };
        return api.searchCollections(requestParams);
      },
      async events(params): ReturnType<RareClient['search']['events']> {
        assertNoClientChainOverride(params, 'rare.search.events', chain);
        const requestParams = params.collectionId !== undefined
          ? params
          : { ...params, chainId };
        return api.searchEvents(requestParams);
      },
    },
    nft: {
      async get(params): ReturnType<RareClient['nft']['get']> {
        assertNoClientChainOverride(params, 'rare.nft.get', chain);
        return api.getNft(buildNftUniversalTokenId({ ...params, chainId }));
      },
    },
    collection: createCollectionNamespace(
      publicClient,
      config,
      chain,
      {
        async get(id) {
          return api.getCollection(id);
        },
      },
      collectionDeploy,
      collectionMint,
    ),
    user: {
      async get(address): ReturnType<RareClient['user']['get']> {
        return api.getUser(address);
      },
    },
    media: {
      async upload(buffer, filename): ReturnType<RareClient['media']['upload']> {
        return api.uploadMedia(buffer, filename);
      },

      async pinMetadata(opts): ReturnType<RareClient['media']['pinMetadata']> {
        return api.pinMetadata(opts);
      },
    },
    import: {
      async erc721(params): ReturnType<RareClient['import']['erc721']> {
        const owner = params.owner ?? config.account ?? config.walletClient?.account?.address;
        if (!owner) {
          throw new Error('No owner available for import. Pass params.owner or provide config.account/walletClient with an account.');
        }

        await api.importErc721({
          chainId,
          contract: params.contract,
          owner,
        });
      },
    },
  };
}

function assertNoClientChainOverride(
  params: unknown,
  method: string,
  chain: string,
): void {
  if (!isRecord(params)) return;
  if (!Object.prototype.hasOwnProperty.call(params, 'chain') && !Object.prototype.hasOwnProperty.call(params, 'chainId')) {
    return;
  }

  throw new Error(
    `${method} uses the RareClient chain (${chain}). ` +
      'Create another RareClient with a different publicClient to use another chain.',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
