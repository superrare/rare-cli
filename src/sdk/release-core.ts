import {
  isAddress,
  parseEther,
  parseUnits,
  type Address,
} from 'viem';
import type {
  AmountInput,
  ReleaseConfigureParams,
  ReleaseStatus,
  TimestampInput,
} from './types.js';
import { ETH_ADDRESS, toInteger } from './helpers.js';

export const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export type RawDirectSaleConfig = {
  seller: Address;
  currencyAddress: Address;
  price: bigint;
  startTime: bigint;
  maxMints: bigint;
  splitRecipients: readonly Address[];
  splitRatios: readonly number[];
};

export type RawAllowlistConfig = {
  root: `0x${string}`;
  endTimestamp: bigint;
};

export type RawStakingMinimum = {
  amount: bigint;
  endTimestamp: bigint;
};

export type ReleaseConfigurePlan = {
  contract: Address;
  currencyAddress: Address;
  price: bigint;
  startTime: bigint;
  maxMints: bigint;
  splitRecipients: Address[];
  splitRatios: number[];
};

export type ReleaseSplitAccumulator = {
  addresses: Address[];
  ratios: number[];
};

export function requireRareMinterAddress(address: Address | undefined): Address {
  if (!address) {
    throw new Error('RareMinter is not configured for this chain. Supported RareMinter chains: mainnet, sepolia.');
  }
  return address;
}

export function assertReleaseContractOwner(opts: {
  contract: Address;
  accountAddress: Address;
  owner: Address;
}): void {
  const { contract, accountAddress, owner } = opts;
  if (owner.toLowerCase() !== accountAddress.toLowerCase()) {
    throw new Error(
      `Connected wallet ${accountAddress} is not the owner of collection ${contract}. ` +
        `Contract owner is ${owner}.`,
    );
  }
}

export function normalizeReleaseStartTime(
  value: TimestampInput | undefined,
  nowSeconds: bigint,
): bigint {
  let startTime: bigint;

  if (value === undefined) {
    startTime = nowSeconds;
  } else if (value instanceof Date) {
    const milliseconds = value.getTime();
    if (!Number.isFinite(milliseconds)) {
      throw new Error('startTime must be a valid date.');
    }
    startTime = BigInt(Math.floor(milliseconds / 1000));
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^-?\d+$/.test(trimmed)) {
      startTime = BigInt(trimmed);
    } else {
      const milliseconds = Date.parse(trimmed);
      if (Number.isNaN(milliseconds)) {
        throw new Error('startTime must be a unix timestamp or ISO date string.');
      }
      startTime = BigInt(Math.floor(milliseconds / 1000));
    }
  } else {
    startTime = toInteger(value, 'startTime');
  }

  if (startTime < 0n) {
    throw new Error('startTime must be greater than or equal to 0.');
  }
  return startTime;
}

export function normalizeReleasePrice(opts: {
  currencyAddress: Address;
  amount: AmountInput;
  currencyDecimals: number | null;
}): bigint {
  const { currencyAddress, amount, currencyDecimals } = opts;

  if (typeof amount === 'bigint') {
    if (amount < 0n) {
      throw new Error('price must be greater than or equal to 0.');
    }
    return amount;
  }

  const parsed = currencyAddress === ETH_ADDRESS
    ? parseEther(String(amount))
    : parseUnits(String(amount), requireCurrencyDecimals(currencyDecimals));

  if (parsed < 0n) {
    throw new Error('price must be greater than or equal to 0.');
  }
  return parsed;
}

export function resolveReleaseSplits(opts: {
  splitAddresses?: Address[];
  splitRatios?: number[];
  defaultRecipient: Address;
}): { splitRecipients: Address[]; splitRatios: number[] } {
  const { splitAddresses, splitRatios, defaultRecipient } = opts;
  const hasAddresses = splitAddresses !== undefined;
  const hasRatios = splitRatios !== undefined;

  if (!hasAddresses && !hasRatios) {
    return {
      splitRecipients: [defaultRecipient],
      splitRatios: [100],
    };
  }

  if (!splitAddresses || !splitRatios) {
    throw new Error('splitAddresses and splitRatios must be provided together.');
  }

  if (splitAddresses.length === 0) {
    throw new Error('At least one split recipient is required.');
  }

  if (splitAddresses.length !== splitRatios.length) {
    throw new Error('splitAddresses and splitRatios must have the same length.');
  }

  const seen = new Set<string>();
  let sum = 0;

  for (let i = 0; i < splitAddresses.length; i++) {
    const address = splitAddresses[i]!;
    const lower = address.toLowerCase();
    if (seen.has(lower)) {
      throw new Error(`Duplicate split recipient: "${address}".`);
    }
    seen.add(lower);

    const ratio = splitRatios[i]!;
    if (!Number.isInteger(ratio) || ratio < 1 || ratio > 100) {
      throw new Error(`Invalid split ratio "${ratio}". Ratios must be integers between 1 and 100.`);
    }
    sum += ratio;
  }

  if (sum !== 100) {
    throw new Error(`Split ratios must sum to 100 (got ${sum}).`);
  }

  return {
    splitRecipients: [...splitAddresses],
    splitRatios: [...splitRatios],
  };
}

export function planReleaseConfigure(
  params: ReleaseConfigureParams,
  opts: {
    accountAddress: Address;
    nowSeconds: bigint;
    currencyDecimals: number | null;
  },
): ReleaseConfigurePlan {
  const currencyAddress = params.currency ?? ETH_ADDRESS;
  const price = normalizeReleasePrice({
    currencyAddress,
    amount: params.price,
    currencyDecimals: opts.currencyDecimals,
  });
  const startTime = normalizeReleaseStartTime(params.startTime, opts.nowSeconds);
  const maxMints = toInteger(params.maxMints, 'maxMints');
  if (maxMints < 1n || maxMints > 100n) {
    throw new Error('maxMints must be an integer between 1 and 100.');
  }
  const { splitRecipients, splitRatios } = resolveReleaseSplits({
    splitAddresses: params.splitAddresses,
    splitRatios: params.splitRatios,
    defaultRecipient: opts.accountAddress,
  });

  return {
    contract: params.contract,
    currencyAddress,
    price,
    startTime,
    maxMints,
    splitRecipients,
    splitRatios,
  };
}

export function collectReleaseSplit(
  value: string,
  previous: ReleaseSplitAccumulator | undefined,
): ReleaseSplitAccumulator {
  const idx = value.indexOf('=');
  if (idx <= 0 || idx === value.length - 1) {
    throw new Error(`Invalid --split format: "${value}". Expected ADDRESS=RATIO (e.g. 0xabc...=70).`);
  }

  const address = value.slice(0, idx).trim();
  const ratioInput = value.slice(idx + 1).trim();
  if (!isAddress(address)) {
    throw new Error(`Invalid address in --split: "${address}".`);
  }

  const addresses = previous ? [...previous.addresses] : [];
  const ratios = previous ? [...previous.ratios] : [];
  if (addresses.some((candidate) => candidate.toLowerCase() === address.toLowerCase())) {
    throw new Error(`Duplicate address in --split: "${address}".`);
  }

  const ratio = Number(ratioInput);
  if (!Number.isInteger(ratio) || ratio < 1 || ratio > 100) {
    throw new Error(`Invalid ratio in --split: "${ratioInput}". Must be an integer between 1 and 100.`);
  }

  return {
    addresses: [...addresses, address as Address],
    ratios: [...ratios, ratio],
  };
}

export function finalizeReleaseSplitAccumulator(
  accumulator: ReleaseSplitAccumulator | undefined,
): { addresses: Address[]; ratios: number[] } | undefined {
  if (!accumulator || accumulator.addresses.length === 0) return undefined;

  const sum = accumulator.ratios.reduce((total, ratio) => total + ratio, 0);
  if (sum !== 100) {
    throw new Error(`--split ratios must sum to 100 (got ${sum}).`);
  }

  return {
    addresses: [...accumulator.addresses],
    ratios: [...accumulator.ratios],
  };
}

export function shapeReleaseStatus(opts: {
  rareMinter: Address;
  contract: Address;
  directSale: RawDirectSaleConfig;
  allowlist: RawAllowlistConfig;
  mintLimit: bigint;
  txLimit: bigint;
  wallet: Address | null;
  walletMints: bigint | null;
  walletTxs: bigint | null;
  stakingMinimum: RawStakingMinimum;
  totalSupply: bigint | null;
  maxSupply: bigint | null;
  currencyDecimals: number | null;
  nowSeconds: bigint;
}): ReleaseStatus {
  const configured = opts.directSale.seller !== ETH_ADDRESS;
  const started = configured && opts.directSale.startTime <= opts.nowSeconds;
  const allowlistActive = opts.allowlist.root !== ZERO_BYTES32 && opts.allowlist.endTimestamp > opts.nowSeconds;
  const stakingMinimumActive = opts.stakingMinimum.amount > 0n && opts.stakingMinimum.endTimestamp > opts.nowSeconds;

  const remainingSupply =
    opts.totalSupply !== null && opts.maxSupply !== null
      ? opts.maxSupply > opts.totalSupply ? opts.maxSupply - opts.totalSupply : 0n
      : null;
  const soldOut =
    opts.totalSupply !== null && opts.maxSupply !== null
      ? opts.maxSupply > 0n && opts.totalSupply >= opts.maxSupply
      : null;

  const walletMintLimitReached =
    opts.wallet !== null &&
    opts.walletMints !== null &&
    opts.mintLimit > 0n &&
    opts.walletMints >= opts.mintLimit;
  const walletTxLimitReached =
    opts.wallet !== null &&
    opts.walletTxs !== null &&
    opts.txLimit > 0n &&
    opts.walletTxs >= opts.txLimit;

  const currentlyMintable =
    configured &&
    started &&
    soldOut !== true &&
    !walletMintLimitReached &&
    !walletTxLimitReached;

  return {
    rareMinter: opts.rareMinter,
    contract: opts.contract,
    configured,
    seller: opts.directSale.seller,
    currencyAddress: opts.directSale.currencyAddress,
    currencyDecimals: opts.currencyDecimals,
    price: opts.directSale.price,
    startTime: opts.directSale.startTime,
    maxMints: opts.directSale.maxMints,
    splitRecipients: [...opts.directSale.splitRecipients],
    splitRatios: [...opts.directSale.splitRatios],
    allowlistRoot: opts.allowlist.root,
    allowlistEndTimestamp: opts.allowlist.endTimestamp,
    allowlistActive,
    requiresAllowlist: allowlistActive,
    mintLimit: opts.mintLimit,
    txLimit: opts.txLimit,
    wallet: opts.wallet,
    walletMints: opts.walletMints,
    walletTxs: opts.walletTxs,
    stakingMinimumAmount: opts.stakingMinimum.amount,
    stakingMinimumEndTimestamp: opts.stakingMinimum.endTimestamp,
    stakingMinimumActive,
    totalSupply: opts.totalSupply,
    maxSupply: opts.maxSupply,
    remainingSupply,
    soldOut,
    started,
    currentlyMintable,
    isEth: opts.directSale.currencyAddress === ETH_ADDRESS,
    now: opts.nowSeconds,
  };
}

function requireCurrencyDecimals(decimals: number | null): number {
  if (decimals === null) {
    throw new Error('currencyDecimals is required to normalize ERC20 price amounts.');
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error('currencyDecimals must be a non-negative integer.');
  }
  return decimals;
}
