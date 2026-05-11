import { Command } from 'commander';
import { getAddress, isAddress, type Address } from 'viem';

export const chainOptionDescription = 'chain name (mainnet, sepolia, base, base-sepolia)';
export const chainIdOptionDescription = 'chain ID (1, 11155111, 8453, 84532)';

export function addChainOptions<T extends Command>(cmd: T): T {
  return cmd
    .option('--chain <chain>', chainOptionDescription)
    .option('--chain-id <id>', chainIdOptionDescription) as T;
}

export type ChainOptions = {
  chain?: string;
  chainId?: string;
};

export type SplitOptions = {
  split?: string[];
};

export function collectSplit(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export function parseSplitOptions(opts: SplitOptions): {
  splitAddresses: Address[] | undefined;
  splitRatios: number[] | undefined;
} {
  if (opts.split === undefined || opts.split.length === 0) {
    return {
      splitAddresses: undefined,
      splitRatios: undefined,
    };
  }

  const splitAddresses: Address[] = [];
  const splitRatios: number[] = [];
  for (const [index, value] of opts.split.entries()) {
    const [rawAddress, rawRatio, extra] = value.split('=');
    if (!rawAddress || rawRatio === undefined || extra !== undefined) {
      throw new Error(`--split at index ${index} must use addr=ratio.`);
    }
    if (!isAddress(rawAddress)) {
      throw new Error(`--split address at index ${index} must be a valid 0x address.`);
    }

    const ratio = Number(rawRatio);
    if (!Number.isInteger(ratio)) {
      throw new Error(`--split ratio at index ${index} must be an integer.`);
    }

    splitAddresses.push(getAddress(rawAddress));
    splitRatios.push(ratio);
  }

  return { splitAddresses, splitRatios };
}
