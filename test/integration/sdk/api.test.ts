import { afterEach, describe, expect, it, vi } from 'vitest';
import { sellerAddress } from '../../helpers/fakeViem.js';
import { jsonResponse, stubFetch } from '../../helpers/fetch.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('SDK API functions', () => {
  it('searches NFTs with default pagination and supplied filters', async () => {
    const { records } = stubFetch(async () =>
      jsonResponse({
        data: [],
        pagination: { page: 1, perPage: 24, totalCount: 0, totalPages: 0 },
      }),
    );
    const { searchNfts } = await import('../../../src/sdk/api.js');

    const result = await searchNfts({ query: 'rare', ownerAddress: sellerAddress, chainId: 11_155_111 });

    expect(result.data).toEqual([]);
    expect(records).toHaveLength(1);
    const url = new URL(records[0].request.url);
    expect(url.pathname).toBe('/v1/nfts');
    expect(url.searchParams.get('q')).toBe('rare');
    expect(url.searchParams.get('ownerAddress')).toBe(sellerAddress);
    expect(url.searchParams.get('chainId')).toBe('11155111');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('perPage')).toBe('24');
    expect(url.searchParams.get('sortBy')).toBe('recentActivity');
  });

  it('validates and posts ERC-721 import requests with normalized addresses', async () => {
    const { records } = stubFetch(async () => jsonResponse({ imported: true }));
    const { importErc721 } = await import('../../../src/sdk/api.js');

    await importErc721({
      chainId: 11_155_111,
      contract: '0xabc0000000000000000000000000000000000000',
      owner: sellerAddress,
    });

    expect(records).toHaveLength(1);
    expect(records[0].request.method).toBe('POST');
    expect(new URL(records[0].request.url).pathname).toBe('/v1/collections/import');
    expect(records[0].body).toEqual({
      chainId: 11_155_111,
      contractAddress: '0xabc0000000000000000000000000000000000000',
      ownerAddress: sellerAddress.toLowerCase(),
    });
  });

  it('rejects invalid import inputs before making a request', async () => {
    const { fetchMock } = stubFetch(async () => jsonResponse({}));
    const { importErc721 } = await import('../../../src/sdk/api.js');

    await expect(
      importErc721({
        chainId: 0,
        contract: '0xabc0000000000000000000000000000000000000',
        owner: sellerAddress,
      }),
    ).rejects.toThrow('chainId must be a positive integer');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uploads media through initiate, presigned PUT, complete, and generate requests', async () => {
    const { records } = stubFetch(async (request) => {
      const url = new URL(request.url);
      if (request.method === 'PUT') {
        return new Response(null, { status: 200, headers: { etag: '"part-1"' } });
      }

      if (url.pathname === '/v1/nfts/metadata/media/uploads') {
        return jsonResponse({
          partSize: 5,
          presignedUrls: ['https://uploads.example.test/part-1'],
          key: 'media-key',
          uploadId: 'upload-id',
          bucket: 'media-bucket',
        });
      }

      if (url.pathname === '/v1/nfts/metadata/media/uploads/complete') {
        return jsonResponse({ ipfsUrl: 'ipfs://raw-media' });
      }

      if (url.pathname === '/v1/nfts/metadata/media/generate') {
        return jsonResponse({
          media: {
            uri: 'ipfs://generated-media',
            mimeType: 'image/png',
            size: 5,
            dimensions: '640x480',
          },
        });
      }

      throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
    });
    const { uploadMedia } = await import('../../../src/sdk/api.js');

    const result = await uploadMedia(new Uint8Array([1, 2, 3, 4, 5]), 'nested/path/art.png');

    expect(result).toEqual({
      url: 'ipfs://generated-media',
      mimeType: 'image/png',
      size: 5,
      dimensions: { width: 640, height: 480 },
    });
    expect(records.map((record) => `${record.request.method} ${new URL(record.request.url).pathname}`)).toEqual([
      'POST /v1/nfts/metadata/media/uploads',
      'PUT /part-1',
      'POST /v1/nfts/metadata/media/uploads/complete',
      'POST /v1/nfts/metadata/media/generate',
    ]);
    expect(records[0].body).toEqual({ fileSize: 5, filename: 'art.png' });
    expect(records[2].body).toEqual({
      key: 'media-key',
      uploadId: 'upload-id',
      bucket: 'media-bucket',
      parts: [{ ETag: '"part-1"', PartNumber: 1 }],
    });
    expect(records[3].body).toEqual({ uri: 'ipfs://raw-media', mimeType: 'image/png' });
  });

  it('pins metadata with image, optional video, tags, and attributes', async () => {
    const { records } = stubFetch(async () => jsonResponse({ ipfsUrl: 'ipfs://metadata' }));
    const { pinMetadata } = await import('../../../src/sdk/api.js');

    const result = await pinMetadata({
      name: 'Rare Token',
      description: 'A test token',
      image: { url: 'ipfs://image', mimeType: 'image/png', size: 10 },
      video: { url: 'ipfs://video', mimeType: 'video/mp4', size: 20 },
      tags: ['test'],
      attributes: [{ trait_type: 'Level', value: 1 }],
    });

    expect(result).toBe('ipfs://metadata');
    expect(new URL(records[0].request.url).pathname).toBe('/v1/nfts/metadata');
    expect(records[0].body).toEqual({
      name: 'Rare Token',
      description: 'A test token',
      nftMedia: {
        image: { url: 'ipfs://image', mimeType: 'image/png', size: 10 },
        video: { url: 'ipfs://video', mimeType: 'video/mp4', size: 20 },
      },
      tags: ['test'],
      attributes: [{ trait_type: 'Level', value: 1 }],
    });
  });

  it('searches collections with collection defaults', async () => {
    const { records } = stubFetch(async () =>
      jsonResponse({
        data: [],
        pagination: { page: 2, perPage: 10, totalCount: 0, totalPages: 0 },
      }),
    );
    const { searchCollections } = await import('../../../src/sdk/api.js');

    await searchCollections({ query: 'rare', page: 2, perPage: 10 });

    const url = new URL(records[0].request.url);
    expect(url.pathname).toBe('/v1/collections');
    expect(url.searchParams.get('q')).toBe('rare');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('perPage')).toBe('10');
    expect(url.searchParams.get('sortBy')).toBe('newest');
  });

  it('fetches entity endpoints and unwraps response data', async () => {
    const { records } = stubFetch(async (request) => {
      const path = new URL(request.url).pathname;
      if (path === '/v1/nfts/token-1') return jsonResponse({ data: { universalTokenId: 'token-1' } });
      if (path === '/v1/nfts/token-1/events') {
        return jsonResponse({ data: [{ eventType: 'MINT' }], pagination: { page: 1 } });
      }
      if (path === '/v1/collections/collection-1') return jsonResponse({ data: { collectionId: 'collection-1' } });
      if (path === '/v1/collections/collection-1/events') {
        return jsonResponse({ data: [{ eventType: 'SALE' }], pagination: { page: 1 } });
      }
      if (path === `/v1/users/${sellerAddress}`) return jsonResponse({ data: { address: sellerAddress } });
      if (path === '/v1/tokens/price/RARE') {
        return jsonResponse({ data: { symbol: 'RARE', priceUsd: 1, decimals: 18, chainId: 1, address: sellerAddress } });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const {
      getNft,
      getNftEvents,
      getCollection,
      getCollectionEvents,
      getUser,
      getTokenPrice,
    } = await import('../../../src/sdk/api.js');

    await expect(getNft('token-1')).resolves.toEqual({ universalTokenId: 'token-1' });
    await expect(getNftEvents('token-1', { page: 1, perPage: 5 })).resolves.toMatchObject({
      data: [{ eventType: 'MINT' }],
    });
    await expect(getCollection('collection-1')).resolves.toEqual({ collectionId: 'collection-1' });
    await expect(getCollectionEvents('collection-1')).resolves.toMatchObject({
      data: [{ eventType: 'SALE' }],
    });
    await expect(getUser(sellerAddress)).resolves.toEqual({ address: sellerAddress });
    await expect(getTokenPrice('RARE')).resolves.toEqual({
      symbol: 'RARE',
      priceUsd: 1,
      decimals: 18,
      chainId: 1,
      address: sellerAddress,
    });
    expect(records.map((record) => new URL(record.request.url).pathname)).toEqual([
      '/v1/nfts/token-1',
      '/v1/nfts/token-1/events',
      '/v1/collections/collection-1',
      '/v1/collections/collection-1/events',
      `/v1/users/${sellerAddress}`,
      '/v1/tokens/price/RARE',
    ]);
  });
});
