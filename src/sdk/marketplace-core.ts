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
  convertible: boolean;
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
  return {
    nftAddress: params.contract,
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    currency: params.currency ?? ETH_ADDRESS,
    price: toNonNegativeWei(params.price, 'price'),
    target: params.target ?? PUBLIC_LISTING_TARGET,
    splitAddresses: params.splitAddresses ?? [accountAddress],
    splitRatios: params.splitRatios ?? [100],
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

export function shapeListingStatus([seller, currencyAddress, amount]: readonly [
  Address,
  Address,
  bigint,
]): ListingStatus {
  return {
    seller,
    currencyAddress,
    amount,
    hasListing: amount > 0n,
    isEth: currencyAddress === ETH_ADDRESS,
  };
}

export function planOfferCreate(params: OfferCreateParams): OfferCreatePlan {
  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    currency: params.currency ?? ETH_ADDRESS,
    amount: toPositiveWei(params.amount, 'amount'),
    convertible: params.convertible ?? false,
  };
}

export function planOfferCancel(params: OfferCancelParams): { tokenId: bigint; currency: Address } {
  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    currency: params.currency ?? ETH_ADDRESS,
  };
}

export function planOfferAccept(params: OfferAcceptParams, accountAddress: Address): OfferAcceptPlan {
  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    currency: params.currency ?? ETH_ADDRESS,
    amount: toPositiveWei(params.amount, 'amount'),
    splitAddresses: params.splitAddresses ?? [accountAddress],
    splitRatios: params.splitRatios ?? [100],
  };
}

export function planOfferStatus(params: OfferStatusParams): { tokenId: bigint; currency: Address } {
  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    currency: params.currency ?? ETH_ADDRESS,
  };
}

export function shapeOfferStatus(
  [buyer, amount, timestamp, marketplaceFee, convertible]: readonly [
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
    nowSeconds?: bigint;
  } = {},
): OfferStatus {
  const hasOffer = amount > 0n;
  const tokenOwner = opts.tokenOwner ?? null;
  const cancellableAfter =
    hasOffer && opts.cancellationDelay != null ? timestamp + opts.cancellationDelay : null;
  const wallet = opts.wallet ?? null;
  const canAccept =
    wallet == null ? null : hasOffer && tokenOwner !== null && isAddressEqual(wallet, tokenOwner);
  const canCancel =
    wallet == null
      ? null
      : hasOffer &&
        isAddressEqual(wallet, buyer) &&
        (cancellableAfter === null || (opts.nowSeconds ?? BigInt(Math.floor(Date.now() / 1000))) >= cancellableAfter);

  return {
    buyer,
    amount,
    timestamp,
    marketplaceFee,
    convertible,
    hasOffer,
    currency: opts.currency ?? ETH_ADDRESS,
    tokenOwner,
    cancellableAfter,
    canAccept,
    canCancel,
  };
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
