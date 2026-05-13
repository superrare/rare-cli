import { describe, expect, it } from 'vitest';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { getContractAddresses } from '../../../src/contracts/addresses.js';
import { createRareClient } from '../../../src/sdk/client.js';
import { createTestSepoliaPublicClient, hasTestRpcUrl } from '../../helpers/liveViem.js';

const describeLive = hasTestRpcUrl() ? describe : describe.skip;

describeLive('Rare SDK client live integration', () => {
  it('uses a real viem Sepolia public client for chain and contract resolution', async () => {
    const publicClient = createTestSepoliaPublicClient();
    const rare = createRareClient({ publicClient });

    await expect(publicClient.getChainId()).resolves.toBe(11_155_111);
    expect(rare.chain).toBe('sepolia');
    expect(rare.chainId).toBe(11_155_111);
    expect(rare.contracts).toEqual(getContractAddresses('sepolia'));
  }, 30_000);

  it('defaults NFT search requests to the real client chain ID', async () => {
    const rare = createRareClient({ publicClient: createTestSepoliaPublicClient() });

    const result = await rare.search.nfts({ page: 1, perPage: 2 });

    expect(result.pagination).toMatchObject({ page: 1, perPage: 2 });
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.every((nft) => Number(nft.chainId) === 11_155_111)).toBe(true);
  }, 30_000);

  it('does not override an explicit NFT search chain ID', async () => {
    const rare = createRareClient({ publicClient: createTestSepoliaPublicClient() });

    const result = await rare.search.nfts({ chainId: 1, page: 1, perPage: 2 });

    expect(result.pagination).toMatchObject({ page: 1, perPage: 2 });
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.every((nft) => Number(nft.chainId) === 1)).toBe(true);
  }, 30_000);

  it('requires an owner for SDK import before posting to the API', async () => {
    const rare = createRareClient({ publicClient: createTestSepoliaPublicClient() });

    await expect(
      rare.import.erc721({ contract: '0x1000000000000000000000000000000000000000' }),
    ).rejects.toThrow('No owner available for import.');
  });

  it('rejects lazy batch mint deploys on chains without a configured lazy factory before requiring a wallet', async () => {
    const rare = createRareClient({
      publicClient: createPublicClient({
        chain: baseSepolia,
        transport: http('http://127.0.0.1:8545'),
      }),
    });

    await expect(
      rare.deploy.lazyBatchMint({ name: 'Unsupported Lazy Collection', symbol: 'ULC' }),
    ).rejects.toThrow('Lazy batch mint factory is not deployed on this chain.');
  });
});
