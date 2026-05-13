import { describe, expect, it } from 'vitest';
import {
  getCollection,
  getNft,
  getNftEvents,
  getTokenPrice,
  searchCollections,
  searchNfts,
} from '../../../src/sdk/api.js';

describe('SDK API live integration', () => {
  it('searches and fetches NFTs from the SuperRare API', async () => {
    const search = await searchNfts({ chainId: 1, page: 1, perPage: 1 });

    expect(search.pagination).toMatchObject({ page: 1, perPage: 1 });
    expect(search.data).toHaveLength(1);
    const [firstNft] = search.data;
    expect(firstNft!.universalTokenId).toEqual(expect.any(String));

    const nft = await getNft(firstNft!.universalTokenId);
    expect(nft.universalTokenId).toBe(firstNft!.universalTokenId);

    const events = await getNftEvents(nft.universalTokenId, { page: 1, perPage: 1 });
    expect(events.pagination).toMatchObject({ page: 1, perPage: 1 });
    expect(Array.isArray(events.data)).toBe(true);
  }, 30_000);

  it('searches collections from the SuperRare API', async () => {
    const search = await searchCollections({ page: 1, perPage: 1 });

    expect(search.pagination).toMatchObject({ page: 1, perPage: 1 });
    expect(search.data).toHaveLength(1);
    const [firstCollection] = search.data;
    expect(firstCollection!.collectionId).toEqual(expect.any(String));

    const collection = await getCollection(firstCollection!.collectionId);
    expect(collection.collectionId).toBe(firstCollection!.collectionId);
  }, 30_000);

  it('fetches token prices from the SuperRare API', async () => {
    await expect(getTokenPrice('RARE')).resolves.toMatchObject({
      symbol: 'RARE',
      decimals: 18,
      chainId: 1,
    });
  }, 30_000);
});
