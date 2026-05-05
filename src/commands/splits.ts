import { type Address, isAddress } from 'viem';

export interface SplitAccumulator {
  addresses: Address[];
  ratios: number[];
}

export function collectSplit(value: string, prev: SplitAccumulator | undefined): SplitAccumulator {
  const acc: SplitAccumulator = prev ?? { addresses: [], ratios: [] };
  const idx = value.indexOf('=');
  if (idx <= 0 || idx === value.length - 1) {
    throw new Error(`Invalid --split format: "${value}". Expected ADDRESS=RATIO (e.g. 0xabc...=70).`);
  }

  const addr = value.slice(0, idx).trim();
  const ratioStr = value.slice(idx + 1).trim();
  if (!isAddress(addr)) {
    throw new Error(`Invalid address in --split: "${addr}".`);
  }
  if (acc.addresses.some((a) => a.toLowerCase() === addr.toLowerCase())) {
    throw new Error(`Duplicate address in --split: "${addr}".`);
  }

  const ratio = Number(ratioStr);
  if (!Number.isInteger(ratio) || ratio < 1 || ratio > 100) {
    throw new Error(`Invalid ratio in --split: "${ratioStr}". Must be an integer between 1 and 100.`);
  }

  acc.addresses.push(addr as Address);
  acc.ratios.push(ratio);
  return acc;
}

export function finalizeSplits(acc: SplitAccumulator | undefined):
  | { addresses: Address[]; ratios: number[] }
  | undefined {
  if (!acc || acc.addresses.length === 0) return undefined;

  const sum = acc.ratios.reduce((a, b) => a + b, 0);
  if (sum !== 100) {
    throw new Error(`--split ratios must sum to 100 (got ${sum}).`);
  }

  return { addresses: acc.addresses, ratios: acc.ratios };
}
