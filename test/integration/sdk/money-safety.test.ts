import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEther, type Address } from 'viem';
import { createRareClient } from '../../../src/sdk/client.js';
import type { RareClient } from '../../../src/sdk/types.js';
import {
  createFakePublicClient,
  createFakeWalletClient,
  erc20Currency,
  makeHash,
  nftContract,
  sellerAddress,
  type FakePublicClient,
  type FakeWalletClient,
} from '../../helpers/fakeViem.js';

const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

type MarketplaceFlow = {
  name: string;
  run: (rare: RareClient, currency?: Address) => Promise<unknown>;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('money-path validation before writes', () => {
  it.each([
    {
      name: 'listing buy amount',
      message: 'amount must be greater than 0.',
      run: (rare: RareClient) =>
        rare.listing.buy({ contract: nftContract, tokenId: '1', amount: '0' }),
    },
    {
      name: 'auction create starting price',
      message: 'startingPrice must be greater than 0.',
      run: (rare: RareClient) =>
        rare.auction.create({
          contract: nftContract,
          tokenId: '1',
          startingPrice: '0',
          duration: '60',
        }),
    },
    {
      name: 'auction create duration',
      message: 'duration must be greater than 0.',
      run: (rare: RareClient) =>
        rare.auction.create({
          contract: nftContract,
          tokenId: '1',
          startingPrice: '1',
          duration: '0',
        }),
    },
    {
      name: 'auction bid amount',
      message: 'amount must be greater than 0.',
      run: (rare: RareClient) =>
        rare.auction.bid({ contract: nftContract, tokenId: '1', amount: '0' }),
    },
    {
      name: 'offer create amount',
      message: 'amount must be greater than 0.',
      run: (rare: RareClient) =>
        rare.offer.create({ contract: nftContract, tokenId: '1', amount: '0' }),
    },
    {
      name: 'offer accept amount',
      message: 'amount must be greater than 0.',
      run: (rare: RareClient) =>
        rare.offer.accept({ contract: nftContract, tokenId: '1', amount: '0' }),
    },
  ])('rejects non-positive $name before reads or writes', async ({ message, run }) => {
    const { rare, publicClient, walletClient } = createTestRare();

    await expect(run(rare)).rejects.toThrow(message);

    expectNoReadsOrWrites(publicClient, walletClient);
  });

  it('rejects negative listing prices before reads or writes', async () => {
    const { rare, publicClient, walletClient } = createTestRare();

    await expect(
      rare.listing.create({ contract: nftContract, tokenId: '1', price: '-0.1' }),
    ).rejects.toThrow('price must be greater than or equal to 0.');

    expectNoReadsOrWrites(publicClient, walletClient);
  });

  it.each([
    {
      name: 'listing create',
      run: (rare: RareClient) =>
        rare.listing.create({ contract: nftContract, tokenId: '-1', price: '1' }),
    },
    {
      name: 'listing cancel',
      run: (rare: RareClient) =>
        rare.listing.cancel({ contract: nftContract, tokenId: '-1' }),
    },
    {
      name: 'listing buy',
      run: (rare: RareClient) =>
        rare.listing.buy({ contract: nftContract, tokenId: '-1', amount: '1' }),
    },
    {
      name: 'auction create',
      run: (rare: RareClient) =>
        rare.auction.create({
          contract: nftContract,
          tokenId: '-1',
          startingPrice: '1',
          duration: '60',
        }),
    },
    {
      name: 'auction bid',
      run: (rare: RareClient) =>
        rare.auction.bid({ contract: nftContract, tokenId: '-1', amount: '1' }),
    },
    {
      name: 'auction settle',
      run: (rare: RareClient) =>
        rare.auction.settle({ contract: nftContract, tokenId: '-1' }),
    },
    {
      name: 'auction cancel',
      run: (rare: RareClient) =>
        rare.auction.cancel({ contract: nftContract, tokenId: '-1' }),
    },
    {
      name: 'offer create',
      run: (rare: RareClient) =>
        rare.offer.create({ contract: nftContract, tokenId: '-1', amount: '1' }),
    },
    {
      name: 'offer cancel',
      run: (rare: RareClient) =>
        rare.offer.cancel({ contract: nftContract, tokenId: '-1' }),
    },
    {
      name: 'offer accept',
      run: (rare: RareClient) =>
        rare.offer.accept({ contract: nftContract, tokenId: '-1', amount: '1' }),
    },
  ])('rejects negative token IDs for $name before reads or writes', async ({ run }) => {
    const { rare, publicClient, walletClient } = createTestRare();

    await expect(run(rare)).rejects.toThrow('tokenId must be greater than or equal to 0.');

    expectNoReadsOrWrites(publicClient, walletClient);
  });
});

describe('money-path side effect guards', () => {
  it.each([
    {
      name: 'listing create',
      marketWrite: 'setSalePrice',
      run: (rare: RareClient) =>
        rare.listing.create({ contract: nftContract, tokenId: '1', price: '1' }),
    },
    {
      name: 'auction create',
      marketWrite: 'configureAuction',
      run: (rare: RareClient) =>
        rare.auction.create({
          contract: nftContract,
          tokenId: '1',
          startingPrice: '1',
          duration: '60',
        }),
    },
  ])('does not send $marketWrite when NFT approval receipt fails', async ({ run }) => {
    const publicClient = createFakePublicClient({
      reads: [false],
      receipts: [
        () => {
          throw new Error('approval reverted');
        },
      ],
    });
    const walletClient = createFakeWalletClient({ hashes: [makeHash(1), makeHash(2)] });
    const rare = createRareClient({ publicClient, walletClient });

    await expect(run(rare)).rejects.toThrow('approval reverted');

    expect(publicClient.readCalls.map((call) => call.functionName)).toEqual(['isApprovedForAll']);
    expect(publicClient.waitCalls).toEqual([makeHash(1)]);
    expect(walletClient.writeCalls.map((call) => call.functionName)).toEqual(['setApprovalForAll']);
  });

  it.each(paymentFlows())('does not send $name when ETH fee lookup fails', async ({ run }) => {
    const publicClient = createFakePublicClient({
      reads: [new Error('settings unavailable')],
    });
    const walletClient = createFakeWalletClient();
    const rare = createRareClient({ publicClient, walletClient });

    await expect(run(rare)).rejects.toThrow('settings unavailable');

    expect(publicClient.readCalls.map((call) => call.functionName)).toEqual(['marketplaceSettings']);
    expect(publicClient.waitCalls).toEqual([]);
    expect(walletClient.writeCalls).toEqual([]);
  });

  it.each(paymentFlows())('does not send $name when ERC20 approval fails', async ({ run }) => {
    const publicClient = createFakePublicClient({ reads: [0n] });
    const walletClient = createFakeWalletClient({ writes: [new Error('approval rejected')] });
    const rare = createRareClient({ publicClient, walletClient });

    await expect(run(rare, erc20Currency)).rejects.toThrow('approval rejected');

    expect(publicClient.readCalls.map((call) => call.functionName)).toEqual(['allowance']);
    expect(publicClient.waitCalls).toEqual([]);
    expect(walletClient.writeCalls.map((call) => call.functionName)).toEqual(['approve']);
  });

  it.each(paymentFlows())('does not approve or attach ETH for $name with enough ERC20 allowance', async ({ run, write }) => {
    const publicClient = createFakePublicClient({ reads: [parseEther('2')] });
    const walletClient = createFakeWalletClient();
    const rare = createRareClient({ publicClient, walletClient });

    await run(rare, erc20Currency);

    expect(publicClient.readCalls.map((call) => call.functionName)).toEqual(['allowance']);
    expect(walletClient.writeCalls.map((call) => call.functionName)).toEqual([write]);
    expect(walletClient.writeCalls[0].value).toBe(0n);
  });

  it('allows zero-price listings because the Bazaar treats them as disabled listings', async () => {
    const publicClient = createFakePublicClient({ reads: [true] });
    const walletClient = createFakeWalletClient();
    const rare = createRareClient({ publicClient, walletClient });

    await rare.listing.create({ contract: nftContract, tokenId: '1', price: '0' });

    expect(walletClient.writeCalls.map((call) => call.functionName)).toEqual(['setSalePrice']);
    expect(walletClient.writeCalls[0].args).toEqual([
      nftContract,
      1n,
      ETH_ADDRESS,
      0n,
      ETH_ADDRESS,
      [sellerAddress],
      [100],
    ]);
  });
});

function createTestRare(): {
  rare: RareClient;
  publicClient: FakePublicClient;
  walletClient: FakeWalletClient;
} {
  const publicClient = createFakePublicClient();
  const walletClient = createFakeWalletClient();
  const rare = createRareClient({ publicClient, walletClient });

  return { rare, publicClient, walletClient };
}

function expectNoReadsOrWrites(publicClient: FakePublicClient, walletClient: FakeWalletClient): void {
  expect(publicClient.readCalls).toEqual([]);
  expect(publicClient.waitCalls).toEqual([]);
  expect(walletClient.writeCalls).toEqual([]);
}

function paymentFlows(): Array<MarketplaceFlow & { write: string }> {
  return [
    {
      name: 'listing buy',
      write: 'buy',
      run: (rare, currency) =>
        rare.listing.buy({ contract: nftContract, tokenId: '1', amount: '1', currency }),
    },
    {
      name: 'auction bid',
      write: 'bid',
      run: (rare, currency) =>
        rare.auction.bid({ contract: nftContract, tokenId: '1', amount: '1', currency }),
    },
    {
      name: 'offer create',
      write: 'offer',
      run: (rare, currency) =>
        rare.offer.create({ contract: nftContract, tokenId: '1', amount: '1', currency }),
    },
  ];
}
