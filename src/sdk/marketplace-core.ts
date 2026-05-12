import { isAddressEqual, type Address } from 'viem';
import type {
  AuctionBidParams,
  AuctionCancelParams,
  AuctionCreateParams,
  AuctionSettleParams,
  ListingBuyParams,
  ListingCancelParams,
  ListingCreateParams,
  ListingStatus,
  ListingStatusParams,
  OfferAcceptParams,
  OfferCancelParams,
  OfferCreateParams,
  OfferStatus,
  OfferStatusParams,
  AuctionStatus,
} from './types.js';
import { ETH_ADDRESS, PUBLIC_LISTING_TARGET } from '../contracts/addresses.js';
import {
  toNonNegativeInteger,
  toNonNegativeWei,
  toPositiveInteger,
  toPositiveWei,
} from './helpers.js';
import { parseAddress } from './validation.js';

export type ListingCreatePlan = {
  nftAddress: Address;
  tokenId: bigint;
  currency: Address;
  price: bigint;
  target: Address;
  splitAddresses: Address[];
  splitRatios: number[];
};

export type ListingBuyPlan = {
  tokenId: bigint;
  currency: Address;
  amount: bigint;
};

export type OfferCreatePlan = {
  tokenId: bigint;
  currency: Address;
  amount: bigint;
};

export type OfferAcceptPlan = {
  tokenId: bigint;
  currency: Address;
  amount: bigint;
  splitAddresses: Address[];
  splitRatios: number[];
};

export type AuctionCreatePlan = {
  nftAddress: Address;
  tokenId: bigint;
  currency: Address;
  startingPrice: bigint;
  duration: bigint;
  splitAddresses: Address[];
  splitRatios: number[];
};

export type AuctionBidPlan = {
  tokenId: bigint;
  currency: Address;
  amount: bigint;
};

export function planListingCreate(params: ListingCreateParams, accountAddress: Address): ListingCreatePlan {
  const splits = planSplits(params.splitAddresses, params.splitRatios, accountAddress);

  return {
    nftAddress: params.contract,
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    currency: params.currency ?? ETH_ADDRESS,
    price: toNonNegativeWei(params.price, 'price'),
    target: params.target ?? PUBLIC_LISTING_TARGET,
    splitAddresses: splits.addresses,
    splitRatios: splits.ratios,
  };
}

export function planListingCancel(params: ListingCancelParams): { tokenId: bigint; target: Address } {
  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    target: params.target ?? PUBLIC_LISTING_TARGET,
  };
}

export function planListingBuy(params: ListingBuyParams): ListingBuyPlan {
  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    currency: params.currency ?? ETH_ADDRESS,
    amount: toPositiveWei(params.amount, 'amount'),
  };
}

export function planListingStatus(params: ListingStatusParams): { tokenId: bigint; target: Address } {
  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    target: params.target ?? PUBLIC_LISTING_TARGET,
  };
}

export function shapeListingStatus(
  [
    seller,
    currencyAddress,
    amount,
    splitAddresses,
    splitRatios,
  ]: readonly [
    Address,
    Address,
    bigint,
    readonly Address[],
    readonly number[],
  ],
  opts: {
    target: Address;
    wallet?: Address | null;
  },
): ListingStatus {
  const hasListing = amount > 0n;
  const wallet = opts.wallet ?? null;
  const canBuy =
    wallet === null
      ? null
      : hasListing &&
        !isAddressEqual(wallet, seller) &&
        (isAddressEqual(opts.target, PUBLIC_LISTING_TARGET) || isAddressEqual(opts.target, wallet));

  return {
    seller,
    currencyAddress,
    amount,
    hasListing,
    isEth: isAddressEqual(currencyAddress, ETH_ADDRESS),
    target: opts.target,
    splitAddresses: [...splitAddresses],
    splitRatios: [...splitRatios],
    canBuy,
  };
}

export function planOfferCreate(params: OfferCreateParams): OfferCreatePlan {
  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    currency: params.currency ?? ETH_ADDRESS,
    amount: toPositiveWei(params.amount, 'amount'),
  };
}

export function planOfferCancel(params: OfferCancelParams): { tokenId: bigint; currency: Address } {
  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    currency: params.currency ?? ETH_ADDRESS,
  };
}

export function planOfferAccept(params: OfferAcceptParams, accountAddress: Address): OfferAcceptPlan {
  const splits = planSplits(params.splitAddresses, params.splitRatios, accountAddress);

  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    currency: params.currency ?? ETH_ADDRESS,
    amount: toPositiveWei(params.amount, 'amount'),
    splitAddresses: splits.addresses,
    splitRatios: splits.ratios,
  };
}

export function planOfferStatus(params: OfferStatusParams): { tokenId: bigint; currency: Address } {
  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    currency: params.currency ?? ETH_ADDRESS,
  };
}

export function shapeOfferStatus(
  [buyer, amount, timestamp, marketplaceFee]: readonly [
    Address,
    bigint,
    bigint,
    number,
    boolean,
  ],
  opts: {
    currency?: Address;
    tokenOwner?: Address | null;
    cancellationDelay?: bigint | null;
    wallet?: Address | null;
    nowSeconds: bigint;
  },
): OfferStatus {
  const hasOffer = amount > 0n;
  const tokenOwner = opts.tokenOwner ?? null;
  const cancellableAfter =
    hasOffer && opts.cancellationDelay != null ? timestamp + opts.cancellationDelay + 1n : null;
  const wallet = opts.wallet ?? null;
  const canAccept =
    wallet == null ? null : hasOffer && tokenOwner !== null && isAddressEqual(wallet, tokenOwner);
  const canCancel =
    wallet == null
      ? null
      : hasOffer &&
        isAddressEqual(wallet, buyer) &&
        (cancellableAfter === null || opts.nowSeconds >= cancellableAfter);

  return {
    buyer,
    amount,
    timestamp,
    marketplaceFee,
    hasOffer,
    currency: opts.currency ?? ETH_ADDRESS,
    tokenOwner,
    cancellableAfter,
    canAccept,
    canCancel,
  };
}

export function planSplits(
  splitAddresses: Address[] | undefined,
  splitRatios: number[] | undefined,
  accountAddress: Address,
): { addresses: Address[]; ratios: number[] } {
  if (splitAddresses === undefined && splitRatios === undefined) {
    return { addresses: [accountAddress], ratios: [100] };
  }

  if (splitAddresses === undefined || splitRatios === undefined) {
    throw new Error('splitAddresses and splitRatios must both be provided.');
  }

  return planProvidedSplits(splitAddresses, splitRatios);
}

export function planProvidedSplits(
  splitAddresses: Address[],
  splitRatios: number[],
): { addresses: Address[]; ratios: number[] } {
  if (splitAddresses.length === 0) {
    throw new Error('splitAddresses must include at least 1 address.');
  }

  if (splitAddresses.length > 5) {
    throw new Error('splitAddresses cannot include more than 5 addresses.');
  }

  if (splitAddresses.length !== splitRatios.length) {
    throw new Error('splitAddresses and splitRatios must have the same length.');
  }

  const normalizedAddresses = splitAddresses.map((address) => parseAddress(address, 'splitAddress'));

  const duplicateAddress = normalizedAddresses.find((address, index) =>
    normalizedAddresses.some((otherAddress, otherIndex) =>
      otherIndex < index && isAddressEqual(address, otherAddress),
    ),
  );
  if (duplicateAddress !== undefined) {
    throw new Error(`Duplicate split address: "${duplicateAddress}".`);
  }

  const totalRatio = splitRatios.reduce((total, ratio) => {
    if (!Number.isInteger(ratio) || ratio < 1 || ratio > 100) {
      throw new Error(`Invalid split ratio: "${String(ratio)}". Must be an integer between 1 and 100.`);
    }
    return total + ratio;
  }, 0);

  if (totalRatio !== 100) {
    throw new Error(`splitRatios must sum to 100 (got ${totalRatio}).`);
  }

  return { addresses: normalizedAddresses, ratios: [...splitRatios] };
}

export function planAuctionCreate(params: AuctionCreateParams, accountAddress: Address): AuctionCreatePlan {
  return {
    nftAddress: params.contract,
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    currency: params.currency ?? ETH_ADDRESS,
    startingPrice: toPositiveWei(params.startingPrice, 'startingPrice'),
    duration: toPositiveInteger(params.duration, 'duration'),
    splitAddresses: params.splitAddresses ?? [accountAddress],
    splitRatios: params.splitRatios ?? [100],
  };
}

export function planAuctionBid(params: AuctionBidParams): AuctionBidPlan {
  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    currency: params.currency ?? ETH_ADDRESS,
    amount: toPositiveWei(params.amount, 'amount'),
  };
}

export function planAuctionTokenAction(params: AuctionSettleParams | AuctionCancelParams): { tokenId: bigint } {
  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
  };
}

export function shapeAuctionStatus(
  [
    seller,
    creationBlock,
    startingTime,
    lengthOfAuction,
    currency,
    minimumBid,
    auctionType,
    splitAddresses,
    splitRatios,
  ]: readonly [
    Address,
    bigint,
    bigint,
    bigint,
    Address,
    bigint,
    `0x${string}`,
    readonly Address[],
    readonly number[],
  ],
  nowSeconds: bigint,
): AuctionStatus {
  const started = startingTime > 0n;
  const endTime = started ? startingTime + lengthOfAuction : null;
  const status: AuctionStatus['status'] = !started
    ? 'PENDING'
    : endTime !== null && nowSeconds >= endTime
      ? 'ENDED'
      : 'RUNNING';

  return {
    seller,
    creationBlock,
    startingTime,
    lengthOfAuction,
    currency,
    minimumBid,
    auctionType,
    splitAddresses: [...splitAddresses],
    splitRatios: [...splitRatios],
    isEth: currency === ETH_ADDRESS,
    started,
    endTime,
    status,
  };
}
