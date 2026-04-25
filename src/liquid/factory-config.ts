import { type Address, type PublicClient } from 'viem';
import { liquidFactoryAbi } from '../contracts/abis/liquid-factory.js';
import { deriveLiquidFactoryConfig, type LiquidFactoryConfig } from './factory-config-core.js';

export { deriveLiquidFactoryConfig, type LiquidFactoryConfig } from './factory-config-core.js';

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
