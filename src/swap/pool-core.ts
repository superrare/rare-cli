import type { Address } from 'viem';
import type { PoolKey } from './route-types.js';

export function normalizeAddress(value: Address): string {
  return value.toLowerCase();
}

export function inferBaseCurrencyAddress(poolKey: PoolKey, token: Address): Address | null {
  const normalizedToken = normalizeAddress(token);
  if (normalizeAddress(poolKey.currency0) === normalizedToken) {
    return poolKey.currency1;
  }
  if (normalizeAddress(poolKey.currency1) === normalizedToken) {
    return poolKey.currency0;
  }
  return null;
}
