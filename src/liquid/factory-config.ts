import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  type Address,
  type PublicClient,
} from 'viem';
import { liquidFactoryAbi } from '../contracts/abis/liquid-factory.js';
import { deriveLiquidFactoryConfig, type LiquidFactoryConfig } from './factory-config-core.js';

export { deriveLiquidFactoryConfig, type LiquidFactoryConfig } from './factory-config-core.js';

const FALLBACK_LP_TICK_LOWER = -887_220;
const FALLBACK_LP_TICK_UPPER = 887_220;

export async function fetchLiquidFactoryConfig(
  publicClient: PublicClient,
  factoryAddress: Address,
): Promise<LiquidFactoryConfig> {
  const [
    baseToken,
    maxTotalSupplyWei,
    creatorLaunchRewardWei,
    minRareLiquidityWei,
    lpTickLower,
    lpTickUpper,
    poolTickSpacing,
  ] = await Promise.all([
    publicClient.readContract({ address: factoryAddress, abi: liquidFactoryAbi, functionName: 'baseToken' }),
    publicClient.readContract({ address: factoryAddress, abi: liquidFactoryAbi, functionName: 'maxTotalSupply' }),
    publicClient.readContract({ address: factoryAddress, abi: liquidFactoryAbi, functionName: 'creatorLaunchReward' }),
    readOptionalMinRareLiquidityWei(publicClient, factoryAddress),
    readOptionalFactoryTick(publicClient, factoryAddress, 'lpTickLower', FALLBACK_LP_TICK_LOWER),
    readOptionalFactoryTick(publicClient, factoryAddress, 'lpTickUpper', FALLBACK_LP_TICK_UPPER),
    publicClient.readContract({ address: factoryAddress, abi: liquidFactoryAbi, functionName: 'poolTickSpacing' }),
  ]);

  return deriveLiquidFactoryConfig(baseToken, maxTotalSupplyWei, creatorLaunchRewardWei, minRareLiquidityWei, {
    lpTickLower,
    lpTickUpper,
    poolTickSpacing,
  });
}

async function readOptionalMinRareLiquidityWei(
  publicClient: PublicClient,
  factoryAddress: Address,
): Promise<bigint> {
  try {
    return await publicClient.readContract({
      address: factoryAddress,
      abi: liquidFactoryAbi,
      functionName: 'minRareLiquidityWei',
    });
  } catch (error) {
    if (isUnavailableContractFunction(error)) {
      return 0n;
    }

    throw error;
  }
}

async function readOptionalFactoryTick(
  publicClient: PublicClient,
  factoryAddress: Address,
  functionName: 'lpTickLower' | 'lpTickUpper',
  fallback: number,
): Promise<number> {
  try {
    const value = await publicClient.readContract({
      address: factoryAddress,
      abi: liquidFactoryAbi,
      functionName,
    });
    return Number(value);
  } catch (error) {
    if (isUnavailableContractFunction(error)) {
      return fallback;
    }

    throw error;
  }
}

function isUnavailableContractFunction(error: unknown): boolean {
  if (!(error instanceof ContractFunctionExecutionError)) {
    return false;
  }

  return (
    error.cause instanceof ContractFunctionRevertedError ||
    error.cause instanceof ContractFunctionZeroDataError
  );
}
