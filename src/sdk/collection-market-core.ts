import type { Address } from 'viem';
import {
  ETH_ADDRESS,
  toNonNegativeInteger,
  toPositiveWei,
} from './helpers.js';
import type {
  CollectionMarketOfferAcceptParams,
  CollectionMarketOfferCreateParams,
  CollectionMarketOfferStatus,
  CollectionMarketOfferStatusParams,
} from './types.js';

export type CollectionMarketOfferCreatePlan = {
  originCollection: Address;
  currency: Address;
  amount: bigint;
  autoApprove: boolean;
};

export type CollectionMarketOfferAcceptPlan = {
  buyer: Address;
  originCollection: Address;
  tokenId: bigint;
  currency: Address;
  amount: bigint;
  splitAddresses: Address[];
  splitRatios: number[];
  autoApprove: boolean;
};

export type CollectionMarketOfferStatusPlan = {
  buyer: Address;
  originCollection: Address;
  tokenId?: bigint;
  account?: Address;
};

export type CollectionMarketOfferRead = {
  currencyAddress: Address;
  amount: bigint;
  marketplaceFee: bigint;
};

export function shapeCollectionMarketOfferRead(
  offer: readonly [Address, bigint, bigint] | CollectionMarketOfferRead,
): CollectionMarketOfferRead {
  if (Array.isArray(offer)) {
    return {
      currencyAddress: offer[0],
      amount: offer[1],
      marketplaceFee: offer[2],
    };
  }

  return offer as CollectionMarketOfferRead;
}

export function planCollectionMarketOfferCreate(
  params: CollectionMarketOfferCreateParams,
): CollectionMarketOfferCreatePlan {
  return {
    originCollection: params.originCollection,
    currency: params.currency ?? ETH_ADDRESS,
    amount: toPositiveWei(params.amount, 'amount'),
    autoApprove: params.autoApprove ?? true,
  };
}

export function planCollectionMarketOfferCancel(params: {
  originCollection: Address;
}): { originCollection: Address } {
  return {
    originCollection: params.originCollection,
  };
}

export function planCollectionMarketOfferAccept(
  params: CollectionMarketOfferAcceptParams,
  accountAddress: Address,
): CollectionMarketOfferAcceptPlan {
  return {
    buyer: params.buyer,
    originCollection: params.originCollection,
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    currency: params.currency ?? ETH_ADDRESS,
    amount: toPositiveWei(params.amount, 'amount'),
    ...planSplitRecipients(params.splitAddresses, params.splitRatios, accountAddress),
    autoApprove: params.autoApprove ?? true,
  };
}

export function planCollectionMarketOfferStatus(
  params: CollectionMarketOfferStatusParams,
): CollectionMarketOfferStatusPlan {
  return {
    buyer: params.buyer,
    originCollection: params.originCollection,
    tokenId: params.tokenId === undefined ? undefined : toNonNegativeInteger(params.tokenId, 'tokenId'),
    account: params.account,
  };
}

export function shapeCollectionMarketOfferStatus(
  offer: CollectionMarketOfferRead,
  expected: {
    buyer: Address;
    originCollection: Address;
    tokenId?: bigint;
    account?: Address;
    tokenOwner?: Address;
  },
): CollectionMarketOfferStatus {
  const hasOffer = offer.amount > 0n;
  const currentWallet = expected.account;
  const canCancel = Boolean(
    hasOffer &&
    currentWallet !== undefined &&
    currentWallet.toLowerCase() === expected.buyer.toLowerCase(),
  );
  const canAccept = Boolean(
    hasOffer &&
    currentWallet !== undefined &&
    expected.tokenOwner !== undefined &&
    currentWallet.toLowerCase() === expected.tokenOwner.toLowerCase(),
  );

  return {
    buyer: expected.buyer,
    originCollection: expected.originCollection,
    amount: offer.amount,
    currency: offer.currencyAddress,
    marketplaceFee: offer.marketplaceFee,
    requiredPayment: calculateRequiredPaymentFromFeePercentage(offer.amount, offer.marketplaceFee),
    hasOffer,
    state: hasOffer ? 'ACTIVE' : 'NONE',
    isEth: offer.currencyAddress.toLowerCase() === ETH_ADDRESS,
    expiry: null,
    currentWallet,
    tokenId: expected.tokenId,
    tokenOwner: expected.tokenOwner,
    canCancel,
    canAccept,
  };
}

export function calculateCollectionOfferTopUp(params: {
  amount: bigint;
  currency: Address;
  requiredPayment: bigint;
  currentMarketplaceFeePercentage: bigint;
  existingOffer: CollectionMarketOfferRead;
}): bigint {
  const existing = params.existingOffer;
  if (existing.amount === 0n) {
    return params.requiredPayment;
  }

  const sameCurrency = existing.currencyAddress.toLowerCase() === params.currency.toLowerCase();
  const sameMarketplaceFee = existing.marketplaceFee === params.currentMarketplaceFeePercentage;
  if (!sameCurrency || !sameMarketplaceFee) {
    return params.requiredPayment;
  }

  if (existing.amount > params.amount) {
    return 0n;
  }

  const existingPayment = calculateRequiredPaymentFromFeePercentage(existing.amount, existing.marketplaceFee);
  return params.requiredPayment > existingPayment ? params.requiredPayment - existingPayment : 0n;
}

function calculateRequiredPaymentFromFeePercentage(amount: bigint, feePercentage: bigint): bigint {
  return amount + ((amount * feePercentage) / 100n);
}

function planSplitRecipients(
  splitAddresses: Address[] | undefined,
  splitRatios: number[] | undefined,
  accountAddress: Address,
): Pick<CollectionMarketOfferAcceptPlan, 'splitAddresses' | 'splitRatios'> {
  const addresses = splitAddresses ?? [accountAddress];
  const ratios = splitRatios ?? [100];

  if (addresses.length === 0) {
    throw new Error('splitAddresses must include at least one address.');
  }
  if (addresses.length > 5) {
    throw new Error('splitAddresses cannot include more than 5 addresses.');
  }
  if (addresses.length !== ratios.length) {
    throw new Error('splitAddresses and splitRatios must have the same length.');
  }
  const total = ratios.reduce((sum, ratio, index) => {
    if (!Number.isInteger(ratio) || ratio < 0 || ratio > 100) {
      throw new Error(`splitRatios[${index}] must be an integer from 0 to 100.`);
    }
    return sum + ratio;
  }, 0);
  if (total !== 100) {
    throw new Error('splitRatios must sum to 100.');
  }

  return {
    splitAddresses: addresses,
    splitRatios: ratios,
  };
}
