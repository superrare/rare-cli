import { isAddressEqual, type Address } from 'viem';
import { parseAddress } from './validation.js';

export const MAX_PAYOUT_SPLIT_RECIPIENTS = 5;

export type PayoutSplits = {
  addresses: Address[];
  ratios: number[];
};

export function planPayoutSplits(
  splitAddresses: Address[] | undefined,
  splitRatios: number[] | undefined,
  defaultRecipient: Address,
): PayoutSplits {
  if (splitAddresses === undefined && splitRatios === undefined) {
    return { addresses: [defaultRecipient], ratios: [100] };
  }

  if (splitAddresses === undefined || splitRatios === undefined) {
    throw new Error('splitAddresses and splitRatios must both be provided.');
  }

  return planProvidedPayoutSplits(splitAddresses, splitRatios);
}

export function planProvidedPayoutSplits(
  splitAddresses: readonly Address[],
  splitRatios: readonly number[],
): PayoutSplits {
  if (splitAddresses.length === 0) {
    throw new Error('splitAddresses must include at least 1 address.');
  }

  if (splitAddresses.length > MAX_PAYOUT_SPLIT_RECIPIENTS) {
    throw new Error(`splitAddresses cannot include more than ${MAX_PAYOUT_SPLIT_RECIPIENTS} addresses.`);
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
