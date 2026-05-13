import { getContractAddresses, chainIds } from '../contracts/addresses.js';
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
} from './api.js';
import type { RareClientConfig, RareClient } from './types.js';
import { resolveChainFromPublicClient } from './helpers.js';
import { createDeployNamespace } from './deploy.js';
import { createMintNamespace } from './mint.js';
import { createAuctionNamespace } from './auction.js';
import { createOfferNamespace } from './offer.js';
import { createListingNamespace } from './listing.js';
import { createBatchListingNamespace } from './batch-listing.js';
import { createTokenNamespace } from './token.js';
import { createLiquidNamespace } from './liquid.js';
import { createSwapNamespace } from './swap.js';
import { createReleaseNamespace } from './release.js';
import { createCollectionNamespace } from './collection.js';

export type { RareClientConfig, RareClient } from './types.js';

export function createRareClient(config: RareClientConfig): RareClient {
  const { publicClient } = config;
  const chain = resolveChainFromPublicClient(publicClient);
  const chainId = chainIds[chain];
  const addresses = getContractAddresses(chain);
  const release = createReleaseNamespace(publicClient, config, addresses);
  const listing = {
    ...createListingNamespace(publicClient, config, addresses),
    release,
  };

  return {
    chain,
    chainId,
    contracts: {
      factory: addresses.factory,
      auction: addresses.auction,
      sovereignFactory: addresses.sovereignFactory,
      lazySovereignFactory: addresses.lazySovereignFactory,
      spaceFactory: addresses.spaceFactory,
      rareMinter: addresses.rareMinter,
      lazyBatchMintFactory: addresses.lazyBatchMintFactory,
      batchListing: addresses.batchListing,
      marketplaceSettings: addresses.marketplaceSettings,
      erc20ApprovalManager: addresses.erc20ApprovalManager,
      erc721ApprovalManager: addresses.erc721ApprovalManager,
      liquidFactory: addresses.liquidFactory,
      swapRouter: addresses.swapRouter,
      v4Quoter: addresses.v4Quoter,
    },
    deploy: createDeployNamespace(publicClient, config, addresses),
    liquid: createLiquidNamespace(config, chain, addresses),
    mint: createMintNamespace(publicClient, config),
    swap: createSwapNamespace(config, chain, chainId, addresses),
    auction: createAuctionNamespace(publicClient, config, addresses),
    offer: createOfferNamespace(publicClient, config, addresses),
    listing,
    batchListing: createBatchListingNamespace(publicClient, config, {
      get batchListing() {
        if (!addresses.batchListing) {
          throw new Error(
            `Batch listing marketplace is not deployed on "${chain}". Available on: mainnet, sepolia.`,
          );
        }
        return addresses.batchListing;
      },
      get marketplaceSettings() {
        if (!addresses.marketplaceSettings) {
          throw new Error(
            `Marketplace settings is not configured for batch listings on "${chain}". Available on: mainnet, sepolia.`,
          );
        }
        return addresses.marketplaceSettings;
      },
      get erc20ApprovalManager() {
        if (!addresses.erc20ApprovalManager) {
          throw new Error(
            `ERC20 approval manager is not deployed on "${chain}". Available on: mainnet, sepolia.`,
          );
        }
        return addresses.erc20ApprovalManager;
      },
      get erc721ApprovalManager() {
        if (!addresses.erc721ApprovalManager) {
          throw new Error(
            `ERC721 approval manager is not deployed on "${chain}". Available on: mainnet, sepolia.`,
          );
        }
        return addresses.erc721ApprovalManager;
      },
    }),
    token: createTokenNamespace(publicClient, chain),
    search: {
      async nfts(params = {}): ReturnType<RareClient['search']['nfts']> {
        const requestParams = params.chainId ? params : { ...params, chainId };
        return searchNftsApi(requestParams);
      },

      async collections(params = {}): ReturnType<RareClient['search']['collections']> {
        return searchCollectionsApi(params);
      },
    },
    nft: {
      async get(universalTokenId): ReturnType<RareClient['nft']['get']> {
        return getNftApi(universalTokenId);
      },
      async events(universalTokenId, opts): ReturnType<RareClient['nft']['events']> {
        return getNftEventsApi(universalTokenId, opts);
      },
    },
    collection: createCollectionNamespace(publicClient, config, chain, {
      async get(id) {
        return getCollectionApi(id);
      },
      async events(id, opts): ReturnType<RareClient['collection']['events']> {
        return getCollectionEventsApi(id, opts);
      },
    }),
    user: {
      async get(address): ReturnType<RareClient['user']['get']> {
        return getUserApi(address);
      },
    },
    media: {
      async upload(buffer, filename): ReturnType<RareClient['media']['upload']> {
        return uploadMediaApi(buffer, filename);
      },

      async pinMetadata(opts): ReturnType<RareClient['media']['pinMetadata']> {
        return pinMetadataApi(opts);
      },
    },
    import: {
      async erc721(params): ReturnType<RareClient['import']['erc721']> {
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
  };
}
