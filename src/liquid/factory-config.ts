import { formatUnits, type Address, type PublicClient } from 'viem';
import { liquidFactoryAbi } from '../contracts/abis/liquid-factory.js';

export interface LiquidFactoryConfig {
  baseToken: Address;
  maxTotalSupplyWei: bigint;
  creatorLaunchRewardWei: bigint;
  curvePoolSupplyWei: bigint;
  minRareLiquidityWei: bigint;
  maxTotalSupplyTokens: number;
  creatorLaunchRewardTokens: number;
  curvePoolSupplyTokens: number;
  minRareLiquidityTokens: number;
  lpTickLower: number;
  lpTickUpper: number;
  poolTickSpacing: number;
}

function parseTokenAmount(value: bigint, label: string): number {
  const tokenAmount = Number(formatUnits(value, 18));
  if (!Number.isFinite(tokenAmount) || tokenAmount < 0) {
    throw new Error(`Liquid factory ${label} is invalid`);
  }
  return tokenAmount;
}

function parseTick(value: number, label: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`Liquid factory ${label} is invalid`);
  }
  return value;
}

export function deriveLiquidFactoryConfig(
  baseToken: Address,
  maxTotalSupplyWei: bigint,
  creatorLaunchRewardWei: bigint,
  minRareLiquidityWei: bigint,
  poolConfig: {
    lpTickLower: number;
    lpTickUpper: number;
    poolTickSpacing: number;
  },
): LiquidFactoryConfig {
  if (maxTotalSupplyWei <= 0n) {
    throw new Error('Liquid factory maxTotalSupply must be greater than 0');
  }
  if (creatorLaunchRewardWei < 0n) {
    throw new Error('Liquid factory creatorLaunchReward cannot be negative');
  }
  if (creatorLaunchRewardWei > maxTotalSupplyWei) {
    throw new Error('Liquid factory creatorLaunchReward exceeds maxTotalSupply');
  }

  const curvePoolSupplyWei = maxTotalSupplyWei - creatorLaunchRewardWei;
  if (curvePoolSupplyWei <= 0n) {
    throw new Error('Liquid factory curve pool supply must be greater than 0');
  }

  const lpTickLower = parseTick(poolConfig.lpTickLower, 'lpTickLower');
  const lpTickUpper = parseTick(poolConfig.lpTickUpper, 'lpTickUpper');
  const poolTickSpacing = parseTick(poolConfig.poolTickSpacing, 'poolTickSpacing');

  if (poolTickSpacing <= 0) {
    throw new Error('Liquid factory poolTickSpacing must be greater than 0');
  }
  if (lpTickLower >= lpTickUpper) {
    throw new Error('Liquid factory lpTickLower must be less than lpTickUpper');
  }
  if (lpTickLower % poolTickSpacing !== 0 || lpTickUpper % poolTickSpacing !== 0) {
    throw new Error('Liquid factory LP ticks must align to poolTickSpacing');
  }

  return {
    baseToken,
    maxTotalSupplyWei,
    creatorLaunchRewardWei,
    curvePoolSupplyWei,
    minRareLiquidityWei,
    maxTotalSupplyTokens: parseTokenAmount(maxTotalSupplyWei, 'maxTotalSupply'),
    creatorLaunchRewardTokens: parseTokenAmount(creatorLaunchRewardWei, 'creatorLaunchReward'),
    curvePoolSupplyTokens: parseTokenAmount(curvePoolSupplyWei, 'curve pool supply'),
    minRareLiquidityTokens: parseTokenAmount(minRareLiquidityWei, 'minRareLiquidityWei'),
    lpTickLower,
    lpTickUpper,
    poolTickSpacing,
  };
}

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
    publicClient.readContract({ address: factoryAddress, abi: liquidFactoryAbi, functionName: 'minRareLiquidityWei' }),
    publicClient.readContract({ address: factoryAddress, abi: liquidFactoryAbi, functionName: 'lpTickLower' }),
    publicClient.readContract({ address: factoryAddress, abi: liquidFactoryAbi, functionName: 'lpTickUpper' }),
    publicClient.readContract({ address: factoryAddress, abi: liquidFactoryAbi, functionName: 'poolTickSpacing' }),
  ]);

  return deriveLiquidFactoryConfig(baseToken, maxTotalSupplyWei, creatorLaunchRewardWei, minRareLiquidityWei, {
    lpTickLower,
    lpTickUpper,
    poolTickSpacing,
  });
}
