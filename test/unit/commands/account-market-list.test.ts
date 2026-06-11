import { describe, expect, it } from 'vitest';
import { zeroAddress } from 'viem';
import type { Nft } from '../../../src/sdk/api.js';
import { selectAuctionRows } from '../../../src/commands/account-market-list.js';

const sellerAddress = '0x0000000000000000000000000000000000000001';
const bidderAddress = '0x0000000000000000000000000000000000000002';
const outbidAddress = '0x0000000000000000000000000000000000000003';
const collectionAddress = '0x0000000000000000000000000000000000000100';

describe('account market list command helpers', () => {
  it('keeps taker auction rows returned by the bidder API query even when the bidder is outbid', () => {
    const auction = mockAuction({ sellerAddress, highestBidderAddress: bidderAddress });
    const nft = mockNft([auction]);

    const rows = selectAuctionRows([nft], 'taker', outbidAddress);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ nft, auction });
  });

  it('filters maker auction rows by seller address', () => {
    const makerAuction = mockAuction({ sellerAddress });
    const otherAuction = mockAuction({ sellerAddress: bidderAddress });
    const nft = mockNft([makerAuction, otherAuction]);

    const rows = selectAuctionRows([nft], 'maker', sellerAddress);

    expect(rows.map((row) => row.auction)).toEqual([makerAuction]);
  });
});

function mockNft(auctions: Nft['market']['auctions']): Nft {
  const nft: Nft = {
    universalTokenId: `eip155:1/erc721:${collectionAddress}/1`,
    contractAddress: collectionAddress,
    chainId: '1',
    tokenId: '1',
    type: 'ERC721',
    creator: {
      address: sellerAddress,
      username: null,
      avatar: null,
      fullName: null,
    },
    owner: {
      address: sellerAddress,
      username: null,
      avatar: null,
      fullName: null,
    },
    metadata: {
      name: 'Token',
      description: null,
      tags: [],
      mediaType: null,
      imageUri: null,
      videoUri: null,
    },
    market: {
      listings: [],
      offers: [],
      auctions,
    },
    lastSale: null,
    attributes: [],
    createdAt: 0,
  };
  return nft;
}

function mockAuction(opts: {
  sellerAddress: string;
  highestBidderAddress?: string;
}): Nft['market']['auctions'][number] {
  return {
    contractAddress: collectionAddress,
    type: 'RESERVE_AUCTION',
    state: 'RUNNING',
    startTime: null,
    endTime: null,
    currencyAddress: zeroAddress,
    sellerAddress: opts.sellerAddress,
    currentBid: mockCryptoValue(),
    reservePrice: mockCryptoValue(),
    highestBidder: {
      address: opts.highestBidderAddress ?? bidderAddress,
      username: null,
      avatar: null,
      fullName: null,
    },
  };
}

function mockCryptoValue(): Nft['market']['auctions'][number]['currentBid'] {
  return {
    cryptoAmount: '1000000000000000000',
    usdAmount: null,
    currency: {
      address: zeroAddress,
      symbol: 'ETH',
      decimals: 18,
      chainId: 1,
    },
  };
}
