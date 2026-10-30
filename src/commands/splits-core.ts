import { isAddressEqual, type Address } from 'viem';
import { parseAddress } from '../input-core.js';

const MAX_PAYOUT_SPLIT_RECIPIENTS = 5;

export type SplitAccumulator = {
  addresses: Address[];
  ratios: number[];
};

export type SplitOptions = {
  addresses: Address[];
  ratios: number[];
};

export function collectSplit(value: string, previous: SplitAccumulator | undefined): SplitAccumulator {
  const acc = previous ?? { addresses: [], ratios: [] };
  if (acc.addresses.length >= MAX_PAYOUT_SPLIT_RECIPIENTS) {
    throw new Error(`--split can be provided at most ${MAX_PAYOUT_SPLIT_RECIPIENTS} times.`);
  }
  const idx = value.indexOf('=');
  if (idx <= 0 || idx === value.length - 1) {
    throw new Error(`Invalid --split format: "${value}". Expected ADDRESS=RATIO (e.g. 0xabc...=70).`);
  }

  const address = parseAddress(value.slice(0, idx).trim(), '--split');
  const ratio = Number(value.slice(idx + 1).trim());
  return {
    addresses: [...acc.addresses, address],
    ratios: [...acc.ratios, ratio],
  };
}

export function finalizeSplits(acc: SplitAccumulator | undefined): SplitOptions | undefined {
  if (acc === undefined || acc.addresses.length === 0) {
    return undefined;
  }
  if (acc.addresses.length > MAX_PAYOUT_SPLIT_RECIPIENTS) {
    throw new Error(`--split can be provided at most ${MAX_PAYOUT_SPLIT_RECIPIENTS} times.`);
  }

  const duplicateAddress = acc.addresses.find((address, index) =>
    acc.addresses.some((otherAddress, otherIndex) => otherIndex < index && isAddressEqual(address, otherAddress)),
  );
  if (duplicateAddress !== undefined) throw new Error(`Duplicate split address: "${duplicateAddress}".`);
  const totalRatio = acc.ratios.reduce((total, ratio) => {
    if (!Number.isInteger(ratio) || ratio < 1 || ratio > 100) {
      throw new Error(`Invalid split ratio: "${String(ratio)}". Must be an integer between 1 and 100.`);
    }
    return total + ratio;
  }, 0);
  if (totalRatio !== 100) throw new Error(`splitRatios must sum to 100 (got ${totalRatio}).`);
  return { addresses: [...acc.addresses], ratios: [...acc.ratios] };
}

export function formatSplitLines(splits: SplitOptions): string[] {
  return splits.addresses.map((address, index) => {
    const ratio = splits.ratios[index];
    if (ratio === undefined) {
      throw new Error(`split ratio is missing for address "${address}".`);
    }
    return `    ${address} = ${ratio}%`;
  });
}
