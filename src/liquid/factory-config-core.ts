import { formatUnits, type Address } from 'viem';

export interface LiquidFactoryConfig {
  baseToken: Address;
  maxTotalSupplyWei: bigint;
  creatorLaunchRewardWei: bigint;
  curvePoolSupplyWei: bigint;
  minRareLiquidityWei: bigint;
  maxTotalSupplyTokens: string;
  creatorLaunchRewardTokens: string;
  curvePoolSupplyTokens: string;
  minRareLiquidityTokens: string;
  lpTickLower: number;
  lpTickUpper: number;
  poolTickSpacing: number;
}

function formatTokenAmount(value: bigint, label: string): string {
  if (value < 0n) {
    throw new Error(`Liquid factory ${label} is invalid`);
  }
  return formatUnits(value, 18);
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
    maxTotalSupplyTokens: formatTokenAmount(maxTotalSupplyWei, 'maxTotalSupply'),
    creatorLaunchRewardTokens: formatTokenAmount(creatorLaunchRewardWei, 'creatorLaunchReward'),
    curvePoolSupplyTokens: formatTokenAmount(curvePoolSupplyWei, 'curve pool supply'),
    minRareLiquidityTokens: formatTokenAmount(minRareLiquidityWei, 'minRareLiquidityWei'),
    lpTickLower,
    lpTickUpper,
    poolTickSpacing,
  };
}
