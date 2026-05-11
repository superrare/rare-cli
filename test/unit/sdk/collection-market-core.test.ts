import { describe, expect, it } from 'vitest';
import { parseEther } from 'viem';
import {
  calculateCollectionOfferTopUp,
  planCollectionMarketOfferAccept,
  planCollectionMarketOfferCancel,
  planCollectionMarketOfferCreate,
  planCollectionMarketOfferStatus,
  shapeCollectionMarketOfferStatus,
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
