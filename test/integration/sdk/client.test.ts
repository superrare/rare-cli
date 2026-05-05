import { afterEach, describe, expect, it, vi } from 'vitest';
import { getContractAddresses } from '../../../src/contracts/addresses.js';
import type { createRareClient as createRareClientFn } from '../../../src/sdk/client.js';
import { jsonResponse, stubFetch } from '../../helpers/fetch.js';
import {
  createFakePublicClient,
  createFakeWalletClient,
  nftContract,
  sellerAddress,
} from '../../helpers/fakeViem.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('Rare SDK client facade', () => {
  it('resolves chain IDs and contract addresses from the public client chain', async () => {
    const createRareClient = await importFreshRareClient();
    const rare = createRareClient({ publicClient: createFakePublicClient() });

    expect(rare.chain).toBe('sepolia');
    expect(rare.chainId).toBe(11_155_111);
    expect(rare.contracts).toEqual(getContractAddresses('sepolia'));
  });

  it('defaults NFT search requests to the client chain ID', async () => {
    const { records } = stubFetch(async () =>
      jsonResponse({
        data: [],
        pagination: { page: 1, perPage: 24, totalCount: 0, totalPages: 0 },
      }),
    );
    const createRareClient = await importFreshRareClient();
    const rare = createRareClient({ publicClient: createFakePublicClient() });

    await rare.search.nfts({ query: 'rare' });

    const url = new URL(records[0].request.url);
    expect(url.pathname).toBe('/v1/nfts');
    expect(url.searchParams.get('q')).toBe('rare');
    expect(url.searchParams.get('chainId')).toBe('11155111');
  });

  it('does not override an explicit NFT search chain ID', async () => {
    const { records } = stubFetch(async () =>
      jsonResponse({
        data: [],
        pagination: { page: 1, perPage: 24, totalCount: 0, totalPages: 0 },
      }),
    );
    const createRareClient = await importFreshRareClient();
    const rare = createRareClient({ publicClient: createFakePublicClient() });

    await rare.search.nfts({ chainId: 1 });

    expect(new URL(records[0].request.url).searchParams.get('chainId')).toBe('1');
  });

  it('imports ERC-721 collections with an owner from config account or wallet account', async () => {
    const { records } = stubFetch(async () => jsonResponse({ imported: true }));
    const createRareClient = await importFreshRareClient();
    const rare = createRareClient({
      publicClient: createFakePublicClient(),
      walletClient: createFakeWalletClient(),
    });

    await rare.import.erc721({ contract: nftContract });

    expect(records).toHaveLength(1);
    expect(new URL(records[0].request.url).pathname).toBe('/v1/collections/import');
    expect(records[0].body).toEqual({
      chainId: 11_155_111,
      contractAddress: nftContract.toLowerCase(),
      ownerAddress: sellerAddress.toLowerCase(),
    });
  });

  it('requires an owner for SDK import when no wallet or account is configured', async () => {
    const createRareClient = await importFreshRareClient();
    const rare = createRareClient({ publicClient: createFakePublicClient() });

    await expect(rare.import.erc721({ contract: nftContract })).rejects.toThrow(
      'No owner available for import.',
    );
  });
});

async function importFreshRareClient(): Promise<typeof createRareClientFn> {
  return (await import('../../../src/sdk/client.js')).createRareClient;
}
