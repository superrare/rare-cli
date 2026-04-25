import { type Address, parseEventLogs, parseUnits } from 'viem';
import type { SupportedChain } from '../contracts/addresses.js';
import { liquidFactoryAbi } from '../contracts/abis/liquid-factory.js';
import { buildCurvePreview, generatePresetCurves, validateCurves } from '../liquid/curve-config.js';
import { fetchLiquidFactoryConfig } from '../liquid/factory-config.js';
import {
  ensureTokenAllowance,
  requireConfiguredAddress,
  requireWallet,
  toTokenAmount,
  type RareClientConfig,
} from './internal.js';
import type { RareClient } from './client.js';

export function createLiquidNamespace(
  config: RareClientConfig,
  chain: SupportedChain,
  addresses: { liquidFactory?: Address },
): RareClient['liquid'] {
  const { publicClient } = config;

  return {
    async getFactoryConfig() {
      const liquidFactory = requireConfiguredAddress(addresses.liquidFactory, 'Liquid Editions factory', chain);
      return fetchLiquidFactoryConfig(publicClient, liquidFactory);
    },

    async generatePresetCurves(params) {
      const factoryConfig = await fetchLiquidFactoryConfig(
        publicClient,
        requireConfiguredAddress(addresses.liquidFactory, 'Liquid Editions factory', chain),
      );
      return generatePresetCurves(params.preset, params.rarePriceUsd, factoryConfig);
    },

    async validateCurves(params) {
      const factoryConfig = await fetchLiquidFactoryConfig(
        publicClient,
        requireConfiguredAddress(addresses.liquidFactory, 'Liquid Editions factory', chain),
      );
      const validation = validateCurves(params.curves, factoryConfig);
      if (!validation.isValid || !validation.curves) {
        throw new Error(validation.errorMessage ?? 'Invalid curve configuration');
      }
      return buildCurvePreview(validation.curves, factoryConfig);
    },

    async deployMultiCurve(params) {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const liquidFactory = requireConfiguredAddress(addresses.liquidFactory, 'Liquid Editions factory', chain);
      const factoryConfig = await fetchLiquidFactoryConfig(publicClient, liquidFactory);
      const validation = validateCurves(params.curves, factoryConfig);
      if (!validation.isValid || !validation.curves) {
        throw new Error(validation.errorMessage ?? 'Invalid curve configuration');
      }

      const initialRareLiquidity = params.initialRareLiquidity
        ? await toTokenAmount(publicClient, factoryConfig.baseToken, params.initialRareLiquidity, 'initialRareLiquidity')
        : 0n;

      await ensureTokenAllowance(
        publicClient,
        walletClient,
        account,
        accountAddress,
        factoryConfig.baseToken,
        liquidFactory,
        initialRareLiquidity,
      );

      const txHash = await walletClient.writeContract({
        address: liquidFactory,
        abi: liquidFactoryAbi,
        functionName: 'createLiquidTokenMultiCurve',
        args: [
          accountAddress,
          params.tokenUri,
          params.name,
          params.symbol,
          initialRareLiquidity,
          validation.curves.map((curve) => ({
            tickLower: curve.tickLower,
            tickUpper: curve.tickUpper,
            numPositions: curve.numPositions,
            shares: parseUnits(curve.shares, 18),
          })),
        ],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: liquidFactoryAbi,
        logs: receipt.logs,
        eventName: 'LiquidTokenCreated',
      });

      return {
        txHash,
        receipt,
        contract: logs[0]?.args.token,
        tokenUri: params.tokenUri,
        curves: validation.curves,
      };
    },
  };
}
