import { hexToBigInt, isAddressEqual, type Address, type Hex } from 'viem';
import type {
  AuctionBidParams,
  AuctionCancelParams,
  AuctionCreateParams,
  AuctionSettleParams,
  AuctionStatus,
} from './types/auction.js';
import type {
  ListingBuyParams,
  ListingCancelParams,
  ListingCreateParams,
  ListingStatus,
  ListingStatusParams,
} from './types/listing.js';
import type {
  OfferAcceptParams,
  OfferCancelParams,
  OfferCreateParams,
  OfferStatus,
  OfferStatusParams,
} from './types/offer.js';
import { ETH_ADDRESS, PUBLIC_LISTING_TARGET } from '../contracts/addresses.js';
import {
  toNonNegativeInteger,
  toNonNegativeWei,
  toPositiveWei,
} from './amounts-core.js';
import {
  requireInput,
  toUnixTimestamp,
} from './validation-core.js';
import { planPayoutSplits, planProvidedPayoutSplits } from './splits-core.js';

type ResolvedCurrencyParam<T extends { currency?: unknown }> = Omit<T, 'currency'> & {
  currency?: Address;
};

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

export type ListingCreateLocalInputsPlan = Pick<ListingCreatePlan, 'tokenId' | 'price'>;
export type ListingBuyLocalInputsPlan = Pick<ListingBuyPlan, 'tokenId' | 'amount'>;

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

export type OfferCreateLocalInputsPlan = Pick<OfferCreatePlan, 'tokenId' | 'amount'>;
export type OfferAcceptLocalInputsPlan = Pick<OfferAcceptPlan, 'tokenId' | 'amount'>;

export type AuctionCreatePlan = {
  nftAddress: Address;
  tokenId: bigint;
  currency: Address;
  startingPrice: bigint;
  duration: bigint;
  auctionType: 'reserve' | 'scheduled';
  startTime: bigint;
  splitAddresses: Address[];
  splitRatios: number[];
};

export type AuctionBidPlan = {
  tokenId: bigint;
  currency: Address;
  amount: bigint;
};

export type AuctionCreateLocalInputsPlan = Pick<
  AuctionCreatePlan,
  'tokenId' | 'startingPrice' | 'duration' | 'auctionType' | 'startTime'
>;
export type AuctionBidLocalInputsPlan = Pick<AuctionBidPlan, 'tokenId' | 'amount'>;

export type AuctionBidRead = {
  bidder: Address;
  currencyAddress: Address;
  amount: bigint;
  marketplaceFee: number;
};

export type AuctionTypeIds = {
  reserve: Hex;
  scheduled: Hex;
};

const zeroBytes32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export function planListingCreateLocalInputs(
  params: Pick<ListingCreateParams, 'tokenId' | 'price'>,
): ListingCreateLocalInputsPlan {
  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    price: toNonNegativeWei(params.price, 'price'),
  };
}

export function planListingCreate(params: ResolvedCurrencyParam<ListingCreateParams>, accountAddress: Address): ListingCreatePlan {
  const local = planListingCreateLocalInputs(params);
  const splits = planSplits(params.splitAddresses, params.splitRatios, accountAddress);

  return {
    nftAddress: params.contract,
    tokenId: local.tokenId,
    currency: params.currency ?? ETH_ADDRESS,
    price: local.price,
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

export function planListingBuyLocalInputs(
  params: Pick<ListingBuyParams, 'tokenId' | 'price'>,
): ListingBuyLocalInputsPlan {
  const price = requireInput(params.price, 'price');
  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    amount: toPositiveWei(price, 'price'),
  };
}

export function planListingBuy(params: ResolvedCurrencyParam<ListingBuyParams>): ListingBuyPlan {
  return {
    ...planListingBuyLocalInputs(params),
    currency: params.currency ?? ETH_ADDRESS,
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

export function planOfferCreateLocalInputs(
  params: Pick<OfferCreateParams, 'tokenId' | 'price'>,
): OfferCreateLocalInputsPlan {
  const price = requireInput(params.price, 'price');
  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    amount: toPositiveWei(price, 'price'),
  };
}

export function planOfferCreate(params: ResolvedCurrencyParam<OfferCreateParams>): OfferCreatePlan {
  return {
    ...planOfferCreateLocalInputs(params),
    currency: params.currency ?? ETH_ADDRESS,
  };
}

export function planOfferCancel(params: ResolvedCurrencyParam<OfferCancelParams>): { tokenId: bigint; currency: Address } {
  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    currency: params.currency ?? ETH_ADDRESS,
  };
}

export function planOfferAcceptLocalInputs(
  params: Pick<OfferAcceptParams, 'tokenId' | 'price'>,
): OfferAcceptLocalInputsPlan {
  const price = requireInput(params.price, 'price');

  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    amount: toPositiveWei(price, 'price'),
  };
}

export function planOfferAccept(params: ResolvedCurrencyParam<OfferAcceptParams>, accountAddress: Address): OfferAcceptPlan {
  const local = planOfferAcceptLocalInputs(params);
  const splits = planSplits(params.splitAddresses, params.splitRatios, accountAddress);

  return {
    tokenId: local.tokenId,
    currency: params.currency ?? ETH_ADDRESS,
    amount: local.amount,
    splitAddresses: splits.addresses,
    splitRatios: splits.ratios,
  };
}

export function planOfferStatus(params: ResolvedCurrencyParam<OfferStatusParams>): { tokenId: bigint; currency: Address } {
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
  return planPayoutSplits(splitAddresses, splitRatios, accountAddress);
}

export function planProvidedSplits(
  splitAddresses: Address[],
  splitRatios: number[],
): { addresses: Address[]; ratios: number[] } {
  return planProvidedPayoutSplits(splitAddresses, splitRatios);
}

export function planAuctionCreateLocalInputs(
  params: ResolvedCurrencyParam<AuctionCreateParams>,
  nowSeconds: bigint,
): AuctionCreateLocalInputsPlan {
  const auctionType = normalizeAuctionType(params);
  const price = requireInput(params.price, 'price');
  const startTime = auctionType === 'scheduled' ? toUnixTimestamp(params.startTime ?? 0, 'startTime') : 0n;
  const duration = resolveAuctionDuration(params, startTime, nowSeconds);

  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    startingPrice: auctionType === 'scheduled'
      ? toNonNegativeWei(price, 'price')
      : toPositiveWei(price, 'price'),
    duration,
    auctionType,
    startTime,
  };
}

export function planAuctionCreate(
  params: ResolvedCurrencyParam<AuctionCreateParams>,
  accountAddress: Address,
  nowSeconds: bigint,
): AuctionCreatePlan {
  const local = planAuctionCreateLocalInputs(params, nowSeconds);
  const splits = planSplits(params.splitAddresses, params.splitRatios, accountAddress);

  return {
    nftAddress: params.contract,
    currency: params.currency ?? ETH_ADDRESS,
    splitAddresses: splits.addresses,
    splitRatios: splits.ratios,
    ...local,
  };
}

export function planAuctionBidLocalInputs(
  params: Pick<AuctionBidParams, 'tokenId' | 'price'>,
): AuctionBidLocalInputsPlan {
  const price = requireInput(params.price, 'price');
  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    amount: toPositiveWei(price, 'price'),
  };
}

export function planAuctionBid(params: ResolvedCurrencyParam<AuctionBidParams>): AuctionBidPlan {
  return {
    ...planAuctionBidLocalInputs(params),
    currency: params.currency ?? ETH_ADDRESS,
  };
}

function resolveAuctionDuration(params: AuctionCreateParams, startTime: bigint, nowSeconds: bigint): bigint {
  const endTime = toUnixTimestamp(requireInput(params.endTime, 'endTime'), 'endTime');
  const beginsAt = startTime > 0n ? startTime : nowSeconds;
  if (endTime <= beginsAt) {
    throw new Error('endTime must be after the auction start time.');
  }
  return endTime - beginsAt;
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
  opts: {
    currentBid?: AuctionBidRead;
    minimumBidIncreasePercentage?: number;
    auctionTypeIds?: AuctionTypeIds;
  } = {},
): AuctionStatus {
  const hasAuction = !isSameHex(auctionType, zeroBytes32);
  const auctionTypeName = resolveAuctionTypeName(auctionType, opts.auctionTypeIds);
  const started = hasAuction && startingTime > 0n && nowSeconds >= startingTime;
  const endTime = started ? startingTime + lengthOfAuction : null;
  const status: AuctionStatus['status'] = !started
    ? 'PENDING'
    : endTime !== null && nowSeconds >= endTime
      ? 'ENDED'
      : 'RUNNING';
  const currentBid = opts.currentBid?.amount ?? 0n;
  const currentBidder =
    currentBid === 0n ||
    opts.currentBid === undefined ||
    isAddressEqual(opts.currentBid.bidder, ETH_ADDRESS)
      ? null
      : opts.currentBid.bidder;
  const currentBidCurrency =
    currentBid > 0n && opts.currentBid !== undefined ? opts.currentBid.currencyAddress : currency;
  const currentBidMarketplaceFee = opts.currentBid?.marketplaceFee ?? 0;
  const minimumNextBid =
    currentBid > 0n
      ? currentBid + (currentBid * BigInt(opts.minimumBidIncreasePercentage ?? 0)) / 100n
      : minimumBid;
  const settlementEligible = started && endTime !== null && nowSeconds >= endTime;

  return {
    seller,
    creationBlock,
    startingTime,
    lengthOfAuction,
    currency,
    minimumBid,
    auctionType,
    auctionTypeName,
    splitAddresses: [...splitAddresses],
    splitRatios: [...splitRatios],
    isEth: isAddressEqual(currency, ETH_ADDRESS),
    hasAuction,
    started,
    endTime,
    status,
    state: auctionState({ hasAuction, auctionTypeName, started, endTime, nowSeconds }),
    currentBidder,
    currentBid,
    currentBidCurrency,
    currentBidMarketplaceFee,
    minimumNextBid,
    settlementEligible,
  };
}

export function shapeAuctionBidRead(
  bid: readonly [Address, Address, bigint, number] | AuctionBidRead,
): AuctionBidRead {
  if (isRawAuctionBidRead(bid)) {
    const [bidder, currencyAddress, amount, marketplaceFee] = bid;
    return {
      bidder,
      currencyAddress,
      amount,
      marketplaceFee,
    };
  }

  return bid;
}

function isRawAuctionBidRead(
  bid: readonly [Address, Address, bigint, number] | AuctionBidRead,
): bid is readonly [Address, Address, bigint, number] {
  return Array.isArray(bid);
}

function normalizeAuctionType(params: AuctionCreateParams): 'reserve' | 'scheduled' {
  const auctionType: unknown = params.auctionType;
  if (auctionType !== undefined) {
    if (auctionType !== 'reserve' && auctionType !== 'scheduled') {
      throw new Error('auctionType must be "reserve" or "scheduled".');
    }
    if (auctionType === 'reserve' && params.startTime !== undefined) {
      throw new Error('startTime can only be set for scheduled auctions.');
    }
    return auctionType;
  }

  return params.startTime === undefined ? 'reserve' : 'scheduled';
}

function resolveAuctionTypeName(auctionType: Hex, ids: AuctionTypeIds | undefined): AuctionStatus['auctionTypeName'] {
  if (isSameHex(auctionType, zeroBytes32)) {
    return 'none';
  }
  if (ids !== undefined) {
    if (isSameHex(auctionType, ids.reserve)) {
      return 'reserve';
    }
    if (isSameHex(auctionType, ids.scheduled)) {
      return 'scheduled';
    }
  }
  return 'unknown';
}

function isSameHex(left: Hex, right: Hex): boolean {
  return hexToBigInt(left) === hexToBigInt(right);
}

function auctionState(params: {
  hasAuction: boolean;
  auctionTypeName: AuctionStatus['auctionTypeName'];
  started: boolean;
  endTime: bigint | null;
  nowSeconds: bigint;
}): AuctionStatus['state'] {
  if (!params.hasAuction) {
    return 'NONE';
  }
  if (params.endTime !== null && params.nowSeconds >= params.endTime) {
    return 'ENDED';
  }
  if (params.started) {
    return 'ACTIVE';
  }
  if (params.auctionTypeName === 'scheduled') {
    return 'SCHEDULED';
  }
  return 'RESERVE_NOT_MET';
}
