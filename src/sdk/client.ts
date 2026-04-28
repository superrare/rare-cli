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
import { createTokenNamespace } from './token.js';

export type { RareClientConfig, RareClient } from './types.js';

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
    deploy: createDeployNamespace(publicClient, config, addresses),
    mint: createMintNamespace(publicClient, config),
    auction: createAuctionNamespace(publicClient, config, addresses),
    offer: createOfferNamespace(publicClient, config, addresses),
    listing: createListingNamespace(publicClient, config, addresses),
    token: createTokenNamespace(publicClient, chain),
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
  };
}
