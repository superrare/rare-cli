import {
  erc20Abi,
  parseEther,
  parseUnits,
  type Address,
  type PublicClient,
} from 'viem';
import { rareMinterAbi } from '../contracts/abis/rare-minter.js';
import { tokenAbi } from '../contracts/abis/token.js';
import type {
  AmountInput,
  IntegerInput,
  RareClient,
  RareClientConfig,
  ReleaseStatus,
  TimestampInput,
} from './types.js';
import { ETH_ADDRESS, requireWallet, toInteger } from './helpers.js';

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

type RawDirectSaleConfig = {
  seller: Address;
  currencyAddress: Address;
  price: bigint;
  startTime: bigint;
  maxMints: bigint;
  splitRecipients: readonly Address[];
  splitRatios: readonly number[];
};

type RawAllowlistConfig = {
  root: `0x${string}`;
  endTimestamp: bigint;
};

type RawStakingMinimum = {
  amount: bigint;
  endTimestamp: bigint;
};

function requireRareMinter(address: Address | undefined): Address {
  if (!address) {
    throw new Error('RareMinter is not configured for this chain. Supported RareMinter chains: mainnet, sepolia.');
  }
  return address;
}

export function normalizeReleaseStartTime(value: TimestampInput | undefined): bigint {
  let startTime: bigint;

  if (value === undefined) {
    startTime = BigInt(Math.floor(Date.now() / 1000));
  } else if (value instanceof Date) {
    const milliseconds = value.getTime();
    if (!Number.isFinite(milliseconds)) {
      throw new Error('startTime must be a valid date.');
    }
    startTime = BigInt(Math.floor(milliseconds / 1000));
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
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

async function readCurrencyDecimals(
  publicClient: PublicClient,
  currency: Address,
  opts: { required: boolean },
): Promise<number | null> {
  if (currency === ETH_ADDRESS) {
    return 18;
  }

  try {
    return await publicClient.readContract({
      address: currency,
      abi: erc20Abi,
      functionName: 'decimals',
    });
  } catch (error) {
    if (!opts.required) {
      return null;
    }
    throw new Error(`Unable to read decimals for ERC20 currency ${currency}: ${(error as Error).message}`);
  }
}

async function toCurrencyUnits(
  publicClient: PublicClient,
  currency: Address,
  amount: AmountInput,
): Promise<bigint> {
  if (typeof amount === 'bigint') {
    if (amount < 0n) {
      throw new Error('price must be greater than or equal to 0.');
    }
    return amount;
  }

  if (currency === ETH_ADDRESS) {
    const parsed = parseEther(String(amount));
    if (parsed < 0n) {
      throw new Error('price must be greater than or equal to 0.');
    }
    return parsed;
  }

  const decimals = await readCurrencyDecimals(publicClient, currency, { required: true });
  const parsed = parseUnits(String(amount), decimals!);
  if (parsed < 0n) {
    throw new Error('price must be greater than or equal to 0.');
  }
  return parsed;
}

function deriveReleaseStatus(opts: {
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
}): ReleaseStatus {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const configured = opts.directSale.seller !== ETH_ADDRESS;
  const started = configured && opts.directSale.startTime <= now;
  const allowlistActive = opts.allowlist.root !== ZERO_BYTES32 && opts.allowlist.endTimestamp > now;
  const stakingMinimumActive = opts.stakingMinimum.amount > 0n && opts.stakingMinimum.endTimestamp > now;

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
    now,
  };
}

async function optionalRead<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

export function createReleaseNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  addresses: { rareMinter?: Address },
): RareClient['release'] {
  return {
    async configure(params) {
      const rareMinter = requireRareMinter(addresses.rareMinter);
      const { walletClient, account, accountAddress } = requireWallet(config);
      const currencyAddress = params.currency ?? ETH_ADDRESS;
      const price = await toCurrencyUnits(publicClient, currencyAddress, params.price);
      const startTime = normalizeReleaseStartTime(params.startTime);
      const maxMints = toInteger(params.maxMints, 'maxMints');
      if (maxMints < 0n) {
        throw new Error('maxMints must be greater than or equal to 0.');
      }
      const { splitRecipients, splitRatios } = resolveReleaseSplits({
        splitAddresses: params.splitAddresses,
        splitRatios: params.splitRatios,
        defaultRecipient: accountAddress,
      });

      const txHash = await walletClient.writeContract({
        address: rareMinter,
        abi: rareMinterAbi,
        functionName: 'prepareMintDirectSale',
        args: [
          params.contract,
          currencyAddress,
          price,
          startTime,
          maxMints,
          splitRecipients,
          splitRatios,
        ],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      return {
        txHash,
        receipt,
        rareMinter,
        contract: params.contract,
        currencyAddress,
        price,
        startTime,
        maxMints,
        splitRecipients,
        splitRatios,
      };
    },

    async getStatus(params) {
      const rareMinter = requireRareMinter(addresses.rareMinter);

      const [
        directSale,
        allowlist,
        mintLimit,
        txLimit,
        stakingMinimum,
      ] = await Promise.all([
        publicClient.readContract({
          address: rareMinter,
          abi: rareMinterAbi,
          functionName: 'getDirectSaleConfig',
          args: [params.contract],
        }) as Promise<RawDirectSaleConfig>,
        publicClient.readContract({
          address: rareMinter,
          abi: rareMinterAbi,
          functionName: 'getContractAllowListConfig',
          args: [params.contract],
        }) as Promise<RawAllowlistConfig>,
        publicClient.readContract({
          address: rareMinter,
          abi: rareMinterAbi,
          functionName: 'getContractMintLimit',
          args: [params.contract],
        }),
        publicClient.readContract({
          address: rareMinter,
          abi: rareMinterAbi,
          functionName: 'getContractTxLimit',
          args: [params.contract],
        }),
        publicClient.readContract({
          address: rareMinter,
          abi: rareMinterAbi,
          functionName: 'getContractSellerStakingMinimum',
          args: [params.contract],
        }) as Promise<RawStakingMinimum>,
      ]);

      const [
        totalSupply,
        maxSupply,
        currencyDecimals,
        walletMints,
        walletTxs,
      ] = await Promise.all([
        optionalRead(() => publicClient.readContract({
          address: params.contract,
          abi: tokenAbi,
          functionName: 'totalSupply',
        })),
        optionalRead(() => publicClient.readContract({
          address: params.contract,
          abi: tokenAbi,
          functionName: 'maxTokens',
        })),
        readCurrencyDecimals(publicClient, directSale.currencyAddress, { required: false }),
        params.wallet
          ? publicClient.readContract({
              address: rareMinter,
              abi: rareMinterAbi,
              functionName: 'getContractMintsPerAddress',
              args: [params.contract, params.wallet],
            })
          : Promise.resolve(null),
        params.wallet
          ? publicClient.readContract({
              address: rareMinter,
              abi: rareMinterAbi,
              functionName: 'getContractTxsPerAddress',
              args: [params.contract, params.wallet],
            })
          : Promise.resolve(null),
      ]);

      return deriveReleaseStatus({
        rareMinter,
        contract: params.contract,
        directSale,
        allowlist,
        mintLimit,
        txLimit,
        wallet: params.wallet ?? null,
        walletMints,
        walletTxs,
        stakingMinimum,
        totalSupply,
        maxSupply,
        currencyDecimals,
      });
    },
  };
}
