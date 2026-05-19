import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  zeroAddress,
  type Address,
  type PublicClient,
} from 'viem';
import { liquidEditionAbi } from '../contracts/abis/liquid-edition.js';
import { normalizeAddress } from './pool-core.js';
import type { PoolKey } from './route-types.js';

export async function getLiquidEditionPoolKey(
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
  } catch (error) {
    if (isUnavailablePoolKeyFunction(error)) {
      return null;
    }

    throw error;
  }
}

function isUnavailablePoolKeyFunction(error: unknown): boolean {
  if (!(error instanceof ContractFunctionExecutionError)) {
    return false;
  }

  return (
    error.cause instanceof ContractFunctionRevertedError ||
    error.cause instanceof ContractFunctionZeroDataError
  );
}
