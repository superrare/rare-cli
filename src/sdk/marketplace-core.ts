import type { Address, Hex } from 'viem';
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
import {
  ETH_ADDRESS,
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

export function planListingCreate(params: ListingCreateParams, accountAddress: Address): ListingCreatePlan {
  return {
    nftAddress: params.contract,
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    currency: params.currency ?? ETH_ADDRESS,
    price: toNonNegativeWei(params.price, 'price'),
    target: params.target ?? ETH_ADDRESS,
    splitAddresses: params.splitAddresses ?? [accountAddress],
    splitRatios: params.splitRatios ?? [100],
  };
}

export function planListingCancel(params: ListingCancelParams): { tokenId: bigint; target: Address } {
  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    target: params.target ?? ETH_ADDRESS,
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
    target: params.target ?? ETH_ADDRESS,
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

export function shapeOfferStatus([buyer, amount, timestamp, marketplaceFee, convertible]: readonly [
  Address,
  bigint,
  bigint,
  number,
  boolean,
]): OfferStatus {
  return {
    buyer,
    amount,
    timestamp,
    marketplaceFee,
    convertible,
    hasOffer: amount > 0n,
  };
}

export function planAuctionCreate(params: AuctionCreateParams, accountAddress: Address): AuctionCreatePlan {
  const auctionType = normalizeAuctionType(params);

  return {
    nftAddress: params.contract,
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    currency: params.currency ?? ETH_ADDRESS,
    startingPrice: auctionType === 'scheduled'
      ? toNonNegativeWei(params.startingPrice, 'startingPrice')
      : toPositiveWei(params.startingPrice, 'startingPrice'),
    duration: toPositiveInteger(params.duration, 'duration'),
    auctionType,
    startTime: auctionType === 'scheduled'
      ? toPositiveInteger(params.startTime ?? 0, 'startTime')
      : 0n,
    ...planSplitRecipients(params.splitAddresses, params.splitRatios, accountAddress),
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
  opts: {
    currentBid?: AuctionBidRead;
    minimumBidIncreasePercentage?: number;
    auctionTypeIds?: AuctionTypeIds;
  } = {},
): AuctionStatus {
  const hasAuction = auctionType.toLowerCase() !== zeroBytes32;
  const auctionTypeName = resolveAuctionTypeName(auctionType, opts.auctionTypeIds);
  const started = hasAuction && startingTime > 0n && nowSeconds >= startingTime;
  const endTime = started ? startingTime + lengthOfAuction : null;
  let status: AuctionStatus['status'] = 'PENDING';
  if (started) {
    status = endTime !== null && nowSeconds >= endTime ? 'ENDED' : 'RUNNING';
  }
  const currentBid = opts.currentBid?.amount ?? 0n;
  const currentBidder = currentBid === 0n || opts.currentBid === undefined || opts.currentBid.bidder === ETH_ADDRESS
    ? null
    : opts.currentBid.bidder;
  const currentBidCurrency = currentBid > 0n && opts.currentBid !== undefined
    ? opts.currentBid.currencyAddress
    : currency;
  const currentBidMarketplaceFee = opts.currentBid?.marketplaceFee ?? 0;
  const minimumNextBid = currentBid > 0n
    ? currentBid + ((currentBid * BigInt(opts.minimumBidIncreasePercentage ?? 0)) / 100n)
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
    isEth: currency === ETH_ADDRESS,
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
  if (Array.isArray(bid)) {
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

function normalizeAuctionType(params: AuctionCreateParams): 'reserve' | 'scheduled' {
  if (params.auctionType !== undefined) {
    if (params.auctionType !== 'reserve' && params.auctionType !== 'scheduled') {
      throw new Error('auctionType must be "reserve" or "scheduled".');
    }
    return params.auctionType;
  }

  return params.startTime === undefined ? 'reserve' : 'scheduled';
}

function planSplitRecipients(
  splitAddresses: Address[] | undefined,
  splitRatios: number[] | undefined,
  accountAddress: Address,
): Pick<AuctionCreatePlan, 'splitAddresses' | 'splitRatios'> {
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

function resolveAuctionTypeName(auctionType: Hex, ids: AuctionTypeIds | undefined): AuctionStatus['auctionTypeName'] {
  const normalized = auctionType.toLowerCase();
  if (normalized === zeroBytes32) {
    return 'none';
  }
  if (ids !== undefined) {
    if (normalized === ids.reserve.toLowerCase()) {
      return 'reserve';
    }
    if (normalized === ids.scheduled.toLowerCase()) {
      return 'scheduled';
    }
  }
  return 'unknown';
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
