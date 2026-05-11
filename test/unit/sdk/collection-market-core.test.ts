import { describe, expect, it } from 'vitest';
import { parseEther } from 'viem';
import {
  calculateCollectionOfferTopUp,
  planCollectionMarketListingBuy,
  planCollectionMarketListingCancel,
  planCollectionMarketListingSet,
  planCollectionMarketListingStatus,
  planCollectionMarketOfferAccept,
  planCollectionMarketOfferCancel,
  planCollectionMarketOfferCreate,
  planCollectionMarketOfferStatus,
  shapeCollectionMarketListingStatus,
  shapeCollectionMarketOfferRead,
  shapeCollectionMarketOfferStatus,
  shapeCollectionMarketSalePriceRead,
} from '../../../src/sdk/collection-market-core.js';

const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
const accountAddress = '0x0000000000000000000000000000000000000001' as const;
const buyerAddress = '0x0000000000000000000000000000000000000002' as const;
const sellerAddress = '0x0000000000000000000000000000000000000003' as const;
const collectionAddress = '0x1000000000000000000000000000000000000000' as const;
const erc20Currency = '0x3000000000000000000000000000000000000000' as const;

describe('collection market offer planning', () => {
  it('plans create, cancel, accept, and status inputs', () => {
    expect(planCollectionMarketOfferCreate({
      originCollection: collectionAddress,
      amount: '0.5',
    })).toEqual({
      originCollection: collectionAddress,
      currency: ETH_ADDRESS,
      amount: parseEther('0.5'),
      autoApprove: true,
    });

    expect(planCollectionMarketOfferCancel({ originCollection: collectionAddress })).toEqual({
      originCollection: collectionAddress,
    });

    expect(planCollectionMarketOfferAccept({
      buyer: buyerAddress,
      originCollection: collectionAddress,
      tokenId: '12',
      currency: erc20Currency,
      amount: '2',
      splitAddresses: [accountAddress, sellerAddress],
      splitRatios: [75, 25],
      autoApprove: false,
    }, accountAddress)).toEqual({
      buyer: buyerAddress,
      originCollection: collectionAddress,
      tokenId: 12n,
      currency: erc20Currency,
      amount: parseEther('2'),
      splitAddresses: [accountAddress, sellerAddress],
      splitRatios: [75, 25],
      autoApprove: false,
    });

    expect(planCollectionMarketOfferStatus({
      buyer: buyerAddress,
      originCollection: collectionAddress,
      tokenId: '9',
      account: sellerAddress,
    })).toEqual({
      buyer: buyerAddress,
      originCollection: collectionAddress,
      tokenId: 9n,
      account: sellerAddress,
    });
  });

  it('rejects unsafe offer amounts, token IDs, and split values', () => {
    expect(() => planCollectionMarketOfferCreate({
      originCollection: collectionAddress,
      amount: '0',
    })).toThrow('amount must be greater than 0.');

    expect(() => planCollectionMarketOfferAccept({
      buyer: buyerAddress,
      originCollection: collectionAddress,
      tokenId: '-1',
      amount: '1',
    }, accountAddress)).toThrow('tokenId must be greater than or equal to 0.');

    expect(() => planCollectionMarketOfferAccept({
      buyer: buyerAddress,
      originCollection: collectionAddress,
      tokenId: '1',
      amount: '1',
      splitAddresses: [accountAddress, sellerAddress],
      splitRatios: [60, 30],
    }, accountAddress)).toThrow('splitRatios must sum to 100.');
  });
});

describe('collection market offer shaping', () => {
  it('shapes raw offer reads', () => {
    expect(shapeCollectionMarketOfferRead([erc20Currency, parseEther('1'), 3n])).toEqual({
      currencyAddress: erc20Currency,
      amount: parseEther('1'),
      marketplaceFee: 3n,
    });
  });

  it('shapes active ETH status with wallet affordances', () => {
    expect(shapeCollectionMarketOfferStatus(
      {
        currencyAddress: ETH_ADDRESS,
        amount: parseEther('1'),
        marketplaceFee: 3n,
      },
      {
        buyer: buyerAddress,
        originCollection: collectionAddress,
        tokenId: 4n,
        account: sellerAddress,
        tokenOwner: sellerAddress,
      },
    )).toEqual({
      buyer: buyerAddress,
      originCollection: collectionAddress,
      amount: parseEther('1'),
      currency: ETH_ADDRESS,
      marketplaceFee: 3n,
      requiredPayment: parseEther('1.03'),
      hasOffer: true,
      state: 'ACTIVE',
      isEth: true,
      expiry: null,
      currentWallet: sellerAddress,
      tokenId: 4n,
      tokenOwner: sellerAddress,
      canCancel: false,
      canAccept: true,
    });
  });

  it('shapes empty status and buyer cancellation rights', () => {
    expect(shapeCollectionMarketOfferStatus(
      {
        currencyAddress: ETH_ADDRESS,
        amount: 0n,
        marketplaceFee: 0n,
      },
      {
        buyer: buyerAddress,
        originCollection: collectionAddress,
        account: buyerAddress,
      },
    )).toMatchObject({
      hasOffer: false,
      state: 'NONE',
      canCancel: false,
      canAccept: false,
    });

    expect(shapeCollectionMarketOfferStatus(
      {
        currencyAddress: erc20Currency,
        amount: parseEther('2'),
        marketplaceFee: 1n,
      },
      {
        buyer: buyerAddress,
        originCollection: collectionAddress,
        account: buyerAddress,
      },
    )).toMatchObject({
      hasOffer: true,
      state: 'ACTIVE',
      canCancel: true,
      canAccept: false,
      isEth: false,
    });
  });

  it('calculates the exact top-up required when replacing an existing offer', () => {
    expect(calculateCollectionOfferTopUp({
      amount: parseEther('2'),
      currency: ETH_ADDRESS,
      requiredPayment: parseEther('2.06'),
      currentMarketplaceFeePercentage: 3n,
      existingOffer: {
        currencyAddress: ETH_ADDRESS,
        amount: parseEther('1'),
        marketplaceFee: 3n,
      },
    })).toBe(parseEther('1.03'));

    expect(calculateCollectionOfferTopUp({
      amount: parseEther('0.5'),
      currency: ETH_ADDRESS,
      requiredPayment: parseEther('0.515'),
      currentMarketplaceFeePercentage: 3n,
      existingOffer: {
        currencyAddress: ETH_ADDRESS,
        amount: parseEther('1'),
        marketplaceFee: 3n,
      },
    })).toBe(0n);

    expect(calculateCollectionOfferTopUp({
      amount: parseEther('2'),
      currency: erc20Currency,
      requiredPayment: parseEther('2.06'),
      currentMarketplaceFeePercentage: 3n,
      existingOffer: {
        currencyAddress: ETH_ADDRESS,
        amount: parseEther('1'),
        marketplaceFee: 3n,
      },
    })).toBe(parseEther('2.06'));
  });
});

describe('collection market listing planning', () => {
  it('plans set, cancel, buy, and status inputs', () => {
    expect(planCollectionMarketListingSet({
      originCollection: collectionAddress,
      amount: '1.5',
      splitAddresses: [accountAddress, sellerAddress],
      splitRatios: [80, 20],
      autoApprove: false,
    }, accountAddress)).toEqual({
      originCollection: collectionAddress,
      currency: ETH_ADDRESS,
      amount: parseEther('1.5'),
      splitAddresses: [accountAddress, sellerAddress],
      splitRatios: [80, 20],
      autoApprove: false,
    });

    expect(planCollectionMarketListingCancel({ originCollection: collectionAddress })).toEqual({
      originCollection: collectionAddress,
    });

    expect(planCollectionMarketListingBuy({
      seller: sellerAddress,
      originCollection: collectionAddress,
      tokenId: '7',
      amount: '1.5',
      currency: erc20Currency,
      autoApprove: false,
    })).toEqual({
      seller: sellerAddress,
      originCollection: collectionAddress,
      tokenId: 7n,
      currency: erc20Currency,
      amount: parseEther('1.5'),
      autoApprove: false,
    });

    expect(planCollectionMarketListingStatus({
      seller: sellerAddress,
      originCollection: collectionAddress,
      tokenId: '7',
      account: buyerAddress,
    })).toEqual({
      seller: sellerAddress,
      originCollection: collectionAddress,
      tokenId: 7n,
      account: buyerAddress,
    });
  });

  it('rejects unsafe listing amounts, token IDs, and split values', () => {
    expect(() => planCollectionMarketListingSet({
      originCollection: collectionAddress,
      amount: '0',
    }, accountAddress)).toThrow('amount must be greater than 0.');

    expect(() => planCollectionMarketListingBuy({
      seller: sellerAddress,
      originCollection: collectionAddress,
      tokenId: '-1',
      amount: '1',
    })).toThrow('tokenId must be greater than or equal to 0.');

    expect(() => planCollectionMarketListingSet({
      originCollection: collectionAddress,
      amount: '1',
      splitAddresses: [accountAddress, sellerAddress],
      splitRatios: [50],
    }, accountAddress)).toThrow('splitAddresses and splitRatios must have the same length.');
  });
});

describe('collection market listing shaping', () => {
  it('shapes raw sale price reads', () => {
    expect(shapeCollectionMarketSalePriceRead([
      erc20Currency,
      parseEther('1'),
      [sellerAddress],
      [100],
    ])).toEqual({
      currencyAddress: erc20Currency,
      amount: parseEther('1'),
      splitRecipients: [sellerAddress],
      splitRatios: [100],
    });
  });

  it('shapes active listing status with buy and cancel affordances', () => {
    expect(shapeCollectionMarketListingStatus(
      {
        currencyAddress: ETH_ADDRESS,
        amount: parseEther('1'),
        splitRecipients: [sellerAddress],
        splitRatios: [100],
      },
      {
        seller: sellerAddress,
        originCollection: collectionAddress,
        marketplaceFee: 3n,
        requiredPayment: parseEther('1.03'),
        tokenId: 4n,
        account: buyerAddress,
        tokenOwner: sellerAddress,
      },
    )).toEqual({
      seller: sellerAddress,
      originCollection: collectionAddress,
      amount: parseEther('1'),
      currency: ETH_ADDRESS,
      splitRecipients: [sellerAddress],
      splitRatios: [100],
      marketplaceFee: 3n,
      requiredPayment: parseEther('1.03'),
      hasListing: true,
      state: 'ACTIVE',
      isEth: true,
      currentWallet: buyerAddress,
      tokenId: 4n,
      tokenOwner: sellerAddress,
      canCancel: false,
      canBuy: true,
    });
  });

  it('shapes empty status and seller cancellation rights', () => {
    expect(shapeCollectionMarketListingStatus(
      {
        currencyAddress: ETH_ADDRESS,
        amount: 0n,
        splitRecipients: [],
        splitRatios: [],
      },
      {
        seller: sellerAddress,
        originCollection: collectionAddress,
        marketplaceFee: 0n,
        requiredPayment: 0n,
        account: sellerAddress,
      },
    )).toMatchObject({
      hasListing: false,
      state: 'NONE',
      canCancel: false,
      canBuy: false,
    });

    expect(shapeCollectionMarketListingStatus(
      {
        currencyAddress: erc20Currency,
        amount: parseEther('2'),
        splitRecipients: [sellerAddress],
        splitRatios: [100],
      },
      {
        seller: sellerAddress,
        originCollection: collectionAddress,
        marketplaceFee: 1n,
        requiredPayment: parseEther('2.02'),
        account: sellerAddress,
        tokenOwner: sellerAddress,
      },
    )).toMatchObject({
      hasListing: true,
      state: 'ACTIVE',
      canCancel: true,
      canBuy: false,
      isEth: false,
    });
  });
});
