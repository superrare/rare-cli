import { zeroAddress, type Address, type PublicClient } from 'viem';
import { liquidEditionAbi } from '../contracts/abis/liquid-edition.js';
import type { PoolKey } from './route-types.js';

function normalizeAddress(value: Address): string {
  return value.toLowerCase();
}

export async function getLiquidTokenPoolKey(
  publicClient: PublicClient,
  token: Address,
): Promise<PoolKey | null> {
  try {
    const result = await publicClient.readContract({
      address: token,
      abi: liquidEditionAbi,
      functionName: 'poolKey',
    });
    const [currency0, currency1, fee, tickSpacing, hooks] = result;

    const normalizedToken = normalizeAddress(token);
    const isPoolToken =
      normalizeAddress(currency0) === normalizedToken ||
      normalizeAddress(currency1) === normalizedToken;

    if (!isPoolToken || normalizeAddress(hooks) === normalizeAddress(zeroAddress)) {
      return null;
    }

    return {
      currency0,
      currency1,
      fee: Number(fee),
      tickSpacing: Number(tickSpacing),
      hooks,
    };
  } catch {
    return null;
  }
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
