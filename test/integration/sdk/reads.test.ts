import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEther } from 'viem';
import { createRareClient } from '../../../src/sdk/client.js';
import {
  buyerAddress,
  createFakePublicClient,
  nftContract,
  sellerAddress,
} from '../../helpers/fakeViem.js';

const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
const AUCTION_TYPE = `0x${'11'.repeat(32)}` as const;

afterEach(() => {
  vi.useRealTimers();
});

describe('marketplace status reads', () => {
  it('shapes active and inactive listing status from contract reads', async () => {
    const publicClient = createFakePublicClient({
      reads: [
        [sellerAddress, ETH_ADDRESS, parseEther('1')],
        [sellerAddress, ETH_ADDRESS, 0n],
      ],
    });
    const rare = createRareClient({ publicClient });

    await expect(rare.listing.getStatus({ contract: nftContract, tokenId: '1' })).resolves.toEqual({
      seller: sellerAddress,
      currencyAddress: ETH_ADDRESS,
      amount: parseEther('1'),
      hasListing: true,
      isEth: true,
    });
    await expect(rare.listing.getStatus({ contract: nftContract, tokenId: '2' })).resolves.toMatchObject({
      amount: 0n,
      hasListing: false,
    });
  });

  it('shapes offer status from contract reads', async () => {
    const publicClient = createFakePublicClient({
      reads: [[buyerAddress, parseEther('1'), 123n, 3, true]],
    });
    const rare = createRareClient({ publicClient });

    await expect(rare.offer.getStatus({ contract: nftContract, tokenId: 1 })).resolves.toEqual({
      buyer: buyerAddress,
      amount: parseEther('1'),
      timestamp: 123n,
      marketplaceFee: 3,
      convertible: true,
      hasOffer: true,
    });
  });

  it('classifies auction status as pending, running, or ended', async () => {
    vi.setSystemTime(new Date('2026-05-04T12:00:00Z'));
    const now = BigInt(Math.floor(Date.now() / 1000));
    const publicClient = createFakePublicClient({
      reads: [
        [sellerAddress, 10n, 0n, 60n, ETH_ADDRESS, parseEther('1'), AUCTION_TYPE, [sellerAddress], [100]],
        [sellerAddress, 10n, now - 30n, 60n, ETH_ADDRESS, parseEther('1'), AUCTION_TYPE, [sellerAddress], [100]],
        [sellerAddress, 10n, now - 90n, 60n, ETH_ADDRESS, parseEther('1'), AUCTION_TYPE, [sellerAddress], [100]],
      ],
    });
    const rare = createRareClient({ publicClient });

    await expect(rare.auction.getStatus({ contract: nftContract, tokenId: 1 })).resolves.toMatchObject({
      status: 'PENDING',
      started: false,
      endTime: null,
    });
    await expect(rare.auction.getStatus({ contract: nftContract, tokenId: 1 })).resolves.toMatchObject({
      status: 'RUNNING',
      started: true,
      endTime: now + 30n,
    });
    await expect(rare.auction.getStatus({ contract: nftContract, tokenId: 1 })).resolves.toMatchObject({
      status: 'ENDED',
      started: true,
      endTime: now - 30n,
    });
  });
});

describe('token reads', () => {
  it('reads token contract info', async () => {
    const publicClient = createFakePublicClient({
      reads: ['Rare Test', 'RTST', 12n],
    });
    const rare = createRareClient({ publicClient });

    await expect(rare.token.getContractInfo({ contract: nftContract })).resolves.toEqual({
      contract: nftContract,
      chain: 'sepolia',
      name: 'Rare Test',
      symbol: 'RTST',
      totalSupply: 12n,
    });
    expect(publicClient.readCalls.map((call) => call.functionName)).toEqual(['name', 'symbol', 'totalSupply']);
  });

  it('reads token owner and URI with normalized token ID', async () => {
    const publicClient = createFakePublicClient({
      reads: [sellerAddress, 'ipfs://token-1'],
    });
    const rare = createRareClient({ publicClient });

    await expect(rare.token.getTokenInfo({ contract: nftContract, tokenId: '1' })).resolves.toEqual({
      contract: nftContract,
      tokenId: 1n,
      owner: sellerAddress,
      tokenUri: 'ipfs://token-1',
    });
    expect(publicClient.readCalls.map((call) => call.functionName)).toEqual(['ownerOf', 'tokenURI']);
    expect(publicClient.readCalls.map((call) => call.args)).toEqual([[1n], [1n]]);
  });
});
