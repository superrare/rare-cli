import { describe, expect, it } from 'vitest';
import { parseEther } from 'viem';
import {
  planAuctionBid,
  planAuctionCreate,
  planAuctionTokenAction,
  planListingBuy,
  planListingCancel,
  planListingCreate,
  planOfferAccept,
  planOfferCancel,
  planOfferCreate,
  shapeAuctionBidRead,
  shapeAuctionStatus,
  shapeListingStatus,
  shapeOfferStatus,
} from '../../../src/sdk/marketplace-core.js';

const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
const accountAddress = '0x0000000000000000000000000000000000000001' as const;
const buyerAddress = '0x0000000000000000000000000000000000000002' as const;
const nftContract = '0x1000000000000000000000000000000000000000' as const;
const erc20Currency = '0x3000000000000000000000000000000000000000' as const;
const AUCTION_TYPE = `0x${'11'.repeat(32)}` as const;

describe('marketplace transaction planning', () => {
  it('plans listing create defaults and normalized values', () => {
    expect(planListingCreate({ contract: nftContract, tokenId: '1', price: '0.5' }, accountAddress)).toEqual({
      nftAddress: nftContract,
      tokenId: 1n,
      currency: ETH_ADDRESS,
      price: parseEther('0.5'),
      target: ETH_ADDRESS,
      splitAddresses: [accountAddress],
      splitRatios: [100],
    });
  });

  it('allows zero-price listings because the Bazaar treats them as disabled listings', () => {
    expect(planListingCreate({ contract: nftContract, tokenId: '1', price: '0' }, accountAddress).price).toBe(0n);
  });

  it('plans listing cancel and buy inputs', () => {
    expect(planListingCancel({ contract: nftContract, tokenId: '3' })).toEqual({
      tokenId: 3n,
      target: ETH_ADDRESS,
    });
    expect(planListingBuy({ contract: nftContract, tokenId: '4', amount: '1', currency: erc20Currency })).toEqual({
      tokenId: 4n,
      currency: erc20Currency,
      amount: parseEther('1'),
    });
  });

  it('plans auction create, bid, and token actions', () => {
    expect(
      planAuctionCreate(
        {
          contract: nftContract,
          tokenId: '3',
          startingPrice: '2',
          duration: '3600',
        },
        accountAddress,
      ),
    ).toEqual({
      nftAddress: nftContract,
      tokenId: 3n,
      currency: ETH_ADDRESS,
      startingPrice: parseEther('2'),
      duration: 3600n,
      auctionType: 'reserve',
      startTime: 0n,
      splitAddresses: [accountAddress],
      splitRatios: [100],
    });
    expect(planAuctionBid({ contract: nftContract, tokenId: '8', amount: '1' })).toEqual({
      tokenId: 8n,
      currency: ETH_ADDRESS,
      amount: parseEther('1'),
    });
    expect(planAuctionTokenAction({ contract: nftContract, tokenId: 10 })).toEqual({ tokenId: 10n });
  });

  it('plans scheduled auctions and validates seller splits', () => {
    expect(
      planAuctionCreate(
        {
          contract: nftContract,
          tokenId: '3',
          startingPrice: '0',
          duration: '3600',
          startTime: '1778500000',
          splitAddresses: [accountAddress, buyerAddress],
          splitRatios: [75, 25],
        },
        accountAddress,
      ),
    ).toEqual({
      nftAddress: nftContract,
      tokenId: 3n,
      currency: ETH_ADDRESS,
      startingPrice: 0n,
      duration: 3600n,
      auctionType: 'scheduled',
      startTime: 1778500000n,
      splitAddresses: [accountAddress, buyerAddress],
      splitRatios: [75, 25],
    });

    expect(() => planAuctionCreate({
      contract: nftContract,
      tokenId: '1',
      startingPrice: '1',
      duration: '60',
      splitAddresses: [accountAddress, buyerAddress],
      splitRatios: [50],
    }, accountAddress)).toThrow('splitAddresses and splitRatios must have the same length.');

    expect(() => planAuctionCreate({
      contract: nftContract,
      tokenId: '1',
      startingPrice: '1',
      duration: '60',
      splitAddresses: [accountAddress, buyerAddress],
      splitRatios: [50, 40],
    }, accountAddress)).toThrow('splitRatios must sum to 100.');
  });

  it('plans offer create, cancel, and accept inputs', () => {
    expect(planOfferCreate({ contract: nftContract, tokenId: '5', amount: '2', currency: erc20Currency })).toEqual({
      tokenId: 5n,
      currency: erc20Currency,
      amount: parseEther('2'),
      convertible: false,
    });
    expect(planOfferCancel({ contract: nftContract, tokenId: '11' })).toEqual({
      tokenId: 11n,
      currency: ETH_ADDRESS,
    });
    expect(planOfferAccept({ contract: nftContract, tokenId: '12', amount: '1' }, accountAddress)).toEqual({
      tokenId: 12n,
      currency: ETH_ADDRESS,
      amount: parseEther('1'),
      splitAddresses: [accountAddress],
      splitRatios: [100],
    });
  });

  it('rejects unsafe money and token inputs before shell code can read or write', () => {
    expect(() => planListingBuy({ contract: nftContract, tokenId: '1', amount: '0' })).toThrow(
      'amount must be greater than 0.',
    );
    expect(() => planAuctionCreate({ contract: nftContract, tokenId: '1', startingPrice: '0', duration: '60' }, accountAddress)).toThrow(
      'startingPrice must be greater than 0.',
    );
    expect(() => planAuctionCreate({ contract: nftContract, tokenId: '1', startingPrice: '1', duration: '0' }, accountAddress)).toThrow(
      'duration must be greater than 0.',
    );
    expect(() => planOfferCreate({ contract: nftContract, tokenId: '-1', amount: '1' })).toThrow(
      'tokenId must be greater than or equal to 0.',
    );
  });
});

describe('marketplace result shaping', () => {
  it('shapes listing status', () => {
    expect(shapeListingStatus([accountAddress, ETH_ADDRESS, parseEther('1')])).toEqual({
      seller: accountAddress,
      currencyAddress: ETH_ADDRESS,
      amount: parseEther('1'),
      hasListing: true,
      isEth: true,
    });
    expect(shapeListingStatus([accountAddress, ETH_ADDRESS, 0n])).toMatchObject({
      amount: 0n,
      hasListing: false,
    });
  });

  it('shapes offer status', () => {
    expect(shapeOfferStatus([buyerAddress, parseEther('1'), 123n, 3, true])).toEqual({
      buyer: buyerAddress,
      amount: parseEther('1'),
      timestamp: 123n,
      marketplaceFee: 3,
      convertible: true,
      hasOffer: true,
    });
  });

  it('classifies auction status as pending, running, or ended', () => {
    const now = 1_000n;
    const base = [accountAddress, 10n, 0n, 60n, ETH_ADDRESS, parseEther('1'), AUCTION_TYPE, [accountAddress], [100]] as const;

    expect(shapeAuctionStatus(base, now)).toMatchObject({
      status: 'PENDING',
      state: 'RESERVE_NOT_MET',
      started: false,
      endTime: null,
      currentBid: 0n,
      minimumNextBid: parseEther('1'),
      settlementEligible: false,
    });
    expect(shapeAuctionStatus(
      [accountAddress, 10n, now - 30n, 60n, ETH_ADDRESS, parseEther('1'), AUCTION_TYPE, [accountAddress], [100]],
      now,
      {
        currentBid: {
          bidder: buyerAddress,
          currencyAddress: ETH_ADDRESS,
          amount: parseEther('2'),
          marketplaceFee: 3,
        },
        minimumBidIncreasePercentage: 10,
      },
    )).toMatchObject({
      status: 'RUNNING',
      state: 'ACTIVE',
      started: true,
      endTime: now + 30n,
      currentBidder: buyerAddress,
      currentBid: parseEther('2'),
      minimumNextBid: parseEther('2.2'),
    });
    expect(shapeAuctionStatus([accountAddress, 10n, now - 90n, 60n, ETH_ADDRESS, parseEther('1'), AUCTION_TYPE, [accountAddress], [100]], now)).toMatchObject({
      status: 'ENDED',
      state: 'ENDED',
      started: true,
      endTime: now - 30n,
      settlementEligible: true,
    });
  });

  it('shapes raw auction bid reads', () => {
    expect(shapeAuctionBidRead([buyerAddress, erc20Currency, parseEther('1'), 3])).toEqual({
      bidder: buyerAddress,
      currencyAddress: erc20Currency,
      amount: parseEther('1'),
      marketplaceFee: 3,
    });
  });
});
