import type { Address } from 'viem';
import { parseAddress } from '../sdk/validation.js';

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
  if (acc.addresses.length >= 5) {
    throw new Error('--split can be provided at most 5 times.');
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
  if (acc.addresses.length > 5) {
    throw new Error('--split can be provided at most 5 times.');
  }

  return { addresses: acc.addresses, ratios: acc.ratios };
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
