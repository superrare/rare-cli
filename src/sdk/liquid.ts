import { type Address, type Hash, type PublicClient, type TransactionReceipt, parseEventLogs, parseUnits } from 'viem';
import type { SupportedChain } from '../contracts/addresses.js';
import { liquidEditionAbi } from '../contracts/abis/liquid-edition.js';
import { liquidFactoryAbi } from '../contracts/abis/liquid-factory.js';
import { buildCurvePreview, generatePresetCurves, validateCurves, type LiquidCurvePreview } from '../liquid/curve-config.js';
import { fetchLiquidFactoryConfig, type LiquidFactoryConfig } from '../liquid/factory-config.js';
import { resolveLiquidFactoryConfigForSupply } from '../liquid/factory-config-core.js';
import { getTokenPrice } from './api.js';
import {
  ensureTokenAllowance,
  requireConfiguredAddress,
  requireWallet,
  toTokenAmount,
} from './helpers.js';
import type {
  DeployLiquidEditionResult,
  GeneratePresetCurvesResult,
  LiquidEditionMarketState,
  LiquidEditionPoolKey,
  LiquidEditionPoolInfo,
  LiquidEditionCurrentPrice,
  LiquidEditionTelemetry,
  RareClient,
  RareClientConfig,
  SetLiquidEditionRenderContractResult,
} from './types.js';

const LIQUID_EDITION_ADDRESS_LOG_RETRY_ATTEMPTS = 3;
const LIQUID_EDITION_ADDRESS_LOG_RETRY_DELAY_MS = 1_000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRarePriceUsd(): Promise<number> {
  const rarePriceUsd = (await getTokenPrice('rare')).priceUsd;
  if (!Number.isFinite(rarePriceUsd) || rarePriceUsd <= 0) {
    throw new Error('Fetched RARE/USD price must be a positive number.');
  }
  return rarePriceUsd;
}

async function maybeFetchRarePriceUsd(): Promise<number | undefined> {
  try {
    return await fetchRarePriceUsd();
  } catch {
    return undefined;
  }
}

function resolveLiquidFactoryConfigForSupplyOrThrow(
  factoryConfig: LiquidFactoryConfig,
  totalSupply: Parameters<typeof resolveLiquidFactoryConfigForSupply>[1],
): ReturnType<typeof resolveLiquidFactoryConfigForSupply> & { isValid: true } {
  const result = resolveLiquidFactoryConfigForSupply(factoryConfig, totalSupply);
  if (!result.isValid) {
    throw new Error(result.errorMessage);
  }
  return result;
}

function getLiquidEditionAddressFromReceipt(receipt: TransactionReceipt): Address | undefined {
  const logs = parseEventLogs({
    abi: liquidFactoryAbi,
    logs: receipt.logs,
    eventName: 'LiquidTokenCreated',
  });
  return logs[0]?.args.token;
}

function toLiquidEditionPoolKey(poolKey: readonly [Address, Address, number, number, Address]): LiquidEditionPoolKey {
  const [currency0, currency1, fee, tickSpacing, hooks] = poolKey;
  return {
    currency0,
    currency1,
    fee: Number(fee),
    tickSpacing: Number(tickSpacing),
    hooks,
  };
}

function toLiquidEditionMarketState(
  state: readonly [bigint, bigint, bigint, number, bigint, bigint],
): LiquidEditionMarketState {
  const [rarePerToken, tokenPerRare, sqrtPriceX96, currentTick, liquidity, currentSupply] = state;
  return {
    rarePerToken,
    tokenPerRare,
    sqrtPriceX96,
    currentTick: Number(currentTick),
    liquidity,
    currentSupply,
  };
}

function missingLiquidEditionAddressError(txHash: Hash, receipt: TransactionReceipt, cause?: unknown): Error {
  const statusPhrase = receipt.status === 'success'
    ? 'succeeded'
    : `was confirmed with status "${receipt.status}"`;
  const message =
    `Liquid Edition deploy transaction ${statusPhrase}, but the deployed contract address could not be read ` +
    `from the LiquidTokenCreated event logs after ${LIQUID_EDITION_ADDRESS_LOG_RETRY_ATTEMPTS + 1} attempts. ` +
    `Transaction hash: ${txHash}. Block: ${receipt.blockNumber}. The connected RPC may be delayed or returning ` +
    'incomplete receipt logs; retry with a synced RPC or inspect the transaction hash.';

  return cause instanceof Error ? new Error(message, { cause }) : new Error(message);
}

async function waitForLiquidEditionAddress(
  publicClient: PublicClient,
  txHash: Hash,
): Promise<{ receipt: TransactionReceipt; contract: Address }> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const contract = getLiquidEditionAddressFromReceipt(receipt);
  if (contract !== undefined) {
    return { receipt, contract };
  }

  return retryLiquidEditionAddress(publicClient, txHash, receipt, 0);
}

async function retryLiquidEditionAddress(
  publicClient: PublicClient,
  txHash: Hash,
  previousReceipt: TransactionReceipt,
  attempt: number,
  lastRpcError?: unknown,
): Promise<{ receipt: TransactionReceipt; contract: Address }> {
  if (attempt >= LIQUID_EDITION_ADDRESS_LOG_RETRY_ATTEMPTS) {
    throw missingLiquidEditionAddressError(txHash, previousReceipt, lastRpcError);
  }

  await sleep(LIQUID_EDITION_ADDRESS_LOG_RETRY_DELAY_MS);
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    const contract = getLiquidEditionAddressFromReceipt(receipt);
    return contract !== undefined
      ? { receipt, contract }
      : await retryLiquidEditionAddress(publicClient, txHash, receipt, attempt + 1);
  } catch (error) {
    return retryLiquidEditionAddress(publicClient, txHash, previousReceipt, attempt + 1, error);
  }
}

export function createLiquidNamespace(
  config: RareClientConfig,
  chain: SupportedChain,
  addresses: { liquidFactory?: Address },
): RareClient['liquidEdition'] {
  const { publicClient } = config;

  return {
    async getFactoryConfig(): Promise<LiquidFactoryConfig> {
      const liquidFactory = requireConfiguredAddress(addresses.liquidFactory, 'Liquid Editions factory', chain);
      return fetchLiquidFactoryConfig(publicClient, liquidFactory);
    },

    async generatePresetCurves(params): Promise<GeneratePresetCurvesResult> {
      const liquidFactory = requireConfiguredAddress(addresses.liquidFactory, 'Liquid Editions factory', chain);
      const [rawFactoryConfig, rarePriceUsd] = await Promise.all([
        fetchLiquidFactoryConfig(publicClient, liquidFactory),
        fetchRarePriceUsd(),
      ]);
      const factoryConfig = resolveLiquidFactoryConfigForSupplyOrThrow(
        rawFactoryConfig,
        params.totalSupply,
      ).factoryConfig;
      const curves = generatePresetCurves(params.preset, rarePriceUsd, factoryConfig);
      return {
        preset: params.preset,
        rarePriceUsd,
        curves,
        preview: buildCurvePreview(curves, factoryConfig, rarePriceUsd),
      };
    },

    async validateCurves(params): Promise<LiquidCurvePreview> {
      const liquidFactory = requireConfiguredAddress(addresses.liquidFactory, 'Liquid Editions factory', chain);
      const [rawFactoryConfig, rarePriceUsd] = await Promise.all([
        fetchLiquidFactoryConfig(publicClient, liquidFactory),
        maybeFetchRarePriceUsd(),
      ]);
      const factoryConfig = resolveLiquidFactoryConfigForSupplyOrThrow(
        rawFactoryConfig,
        params.totalSupply,
      ).factoryConfig;
      const validation = validateCurves(params.curves, factoryConfig);
      if (!validation.isValid || !validation.curves) {
        throw new Error(validation.errorMessage ?? 'Invalid curve configuration');
      }
      return buildCurvePreview(validation.curves, factoryConfig, rarePriceUsd);
    },

    deploy: {
      async multiCurve(params): Promise<DeployLiquidEditionResult> {
        const { walletClient, account, accountAddress } = requireWallet(config);
        const liquidFactory = requireConfiguredAddress(addresses.liquidFactory, 'Liquid Editions factory', chain);
        const rawFactoryConfig = await fetchLiquidFactoryConfig(publicClient, liquidFactory);
        const factoryConfigResult = resolveLiquidFactoryConfigForSupplyOrThrow(
          rawFactoryConfig,
          params.totalSupply,
        );
        const { factoryConfig, totalSupplyWei: customMaxTotalSupply } = factoryConfigResult;
        const validation = validateCurves(params.curves, factoryConfig);
        if (!validation.isValid || !validation.curves) {
          throw new Error(validation.errorMessage ?? 'Invalid curve configuration');
        }

        const initialRareLiquidity =
          params.initialRareLiquidity !== undefined
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

        const curves = validation.curves.map((curve) => ({
          tickLower: curve.tickLower,
          tickUpper: curve.tickUpper,
          numPositions: curve.numPositions,
          shares: parseUnits(curve.shares, 18),
        }));

        const txHash = customMaxTotalSupply === undefined
          ? await walletClient.writeContract({
              address: liquidFactory,
              abi: liquidFactoryAbi,
              functionName: 'createLiquidTokenMultiCurve',
              args: [
                accountAddress,
                params.tokenUri,
                params.name,
                params.symbol,
                initialRareLiquidity,
                curves,
              ],
              account,
              chain: undefined,
            })
          : await walletClient.writeContract({
              address: liquidFactory,
              abi: liquidFactoryAbi,
              functionName: 'createLiquidTokenMultiCurveWithSupply',
              args: [
                accountAddress,
                params.tokenUri,
                params.name,
                params.symbol,
                initialRareLiquidity,
                curves,
                customMaxTotalSupply,
              ],
              account,
              chain: undefined,
            });

        const { receipt, contract } = await waitForLiquidEditionAddress(publicClient, txHash);

        return {
          txHash,
          receipt,
          contract,
          tokenUri: params.tokenUri,
          curves: validation.curves,
        };
      },
    },

    async getTokenUri(params): Promise<string> {
      return publicClient.readContract({
        address: params.contract,
        abi: liquidEditionAbi,
        functionName: 'tokenURI',
      });
    },

    async getRenderContract(params): Promise<Address> {
      return publicClient.readContract({
        address: params.contract,
        abi: liquidEditionAbi,
        functionName: 'renderContract',
      });
    },

    async setRenderContract(params): Promise<SetLiquidEditionRenderContractResult> {
      const { walletClient, account } = requireWallet(config);
      const txHash = await walletClient.writeContract({
        address: params.contract,
        abi: liquidEditionAbi,
        functionName: 'setRenderContract',
        args: [params.renderContract],
        account,
        chain: undefined,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      return {
        txHash,
        receipt,
        contract: params.contract,
        renderContract: params.renderContract,
      };
    },

    async getPoolInfo(params): Promise<LiquidEditionPoolInfo> {
      const [poolId, rawPoolKey] = await Promise.all([
        publicClient.readContract({
          address: params.contract,
          abi: liquidEditionAbi,
          functionName: 'poolId',
        }),
        publicClient.readContract({
          address: params.contract,
          abi: liquidEditionAbi,
          functionName: 'poolKey',
        }),
      ]);

      return {
        contract: params.contract,
        poolId,
        poolKey: toLiquidEditionPoolKey(rawPoolKey),
      };
    },

    async getMarketState(params): Promise<LiquidEditionMarketState> {
      const state = await publicClient.readContract({
        address: params.contract,
        abi: liquidEditionAbi,
        functionName: 'getMarketState',
      });

      return toLiquidEditionMarketState(state);
    },

    async getCurrentPrice(params): Promise<LiquidEditionCurrentPrice> {
      const [rarePerToken, tokenPerRare] = await publicClient.readContract({
        address: params.contract,
        abi: liquidEditionAbi,
        functionName: 'getCurrentPrice',
      });

      return {
        contract: params.contract,
        rarePerToken,
        tokenPerRare,
      };
    },

    async getTelemetry(params): Promise<LiquidEditionTelemetry> {
      const contract = { address: params.contract, abi: liquidEditionAbi } as const;
      const name = await publicClient.readContract({ ...contract, functionName: 'name' });
      const symbol = await publicClient.readContract({ ...contract, functionName: 'symbol' });
      const decimals = await publicClient.readContract({ ...contract, functionName: 'decimals' });
      const totalSupply = await publicClient.readContract({ ...contract, functionName: 'totalSupply' });
      const maxTotalSupply = await publicClient.readContract({ ...contract, functionName: 'maxTotalSupply' });
      const poolLaunchSupply = await publicClient.readContract({ ...contract, functionName: 'poolLaunchSupply' });
      const creatorLaunchReward = await publicClient.readContract({ ...contract, functionName: 'creatorLaunchReward' });
      const baseToken = await publicClient.readContract({ ...contract, functionName: 'baseToken' });
      const tokenCreator = await publicClient.readContract({ ...contract, functionName: 'tokenCreator' });
      const initialTokenUri = await publicClient.readContract({ ...contract, functionName: 'initialTokenUri' });
      const tokenUri = await publicClient.readContract({ ...contract, functionName: 'tokenURI' });
      const renderContract = await publicClient.readContract({ ...contract, functionName: 'renderContract' });
      const poolManager = await publicClient.readContract({ ...contract, functionName: 'poolManager' });
      const poolId = await publicClient.readContract({ ...contract, functionName: 'poolId' });
      const rawPoolKey = await publicClient.readContract({ ...contract, functionName: 'poolKey' });
      const lpTickLower = await publicClient.readContract({ ...contract, functionName: 'lpTickLower' });
      const lpTickUpper = await publicClient.readContract({ ...contract, functionName: 'lpTickUpper' });
      const lpLiquidity = await publicClient.readContract({ ...contract, functionName: 'lpLiquidity' });
      const totalLiquidity = await publicClient.readContract({ ...contract, functionName: 'totalLiquidity' });
      const rawMarketState = await publicClient.readContract({ ...contract, functionName: 'getMarketState' });
      const [rarePerToken, tokenPerRare] = await publicClient.readContract({ ...contract, functionName: 'getCurrentPrice' });
      const poolKey = toLiquidEditionPoolKey(rawPoolKey);
      const marketState = toLiquidEditionMarketState(rawMarketState);

      return {
        contract: params.contract,
        name,
        symbol,
        decimals: Number(decimals),
        totalSupply,
        maxTotalSupply,
        poolLaunchSupply,
        creatorLaunchReward,
        baseToken,
        tokenCreator,
        initialTokenUri,
        tokenUri,
        renderContract,
        poolManager,
        pool: {
          contract: params.contract,
          poolId,
          poolKey,
        },
        lpTickLower: Number(lpTickLower),
        lpTickUpper: Number(lpTickUpper),
        lpLiquidity,
        totalLiquidity,
        marketState,
        currentPrice: {
          contract: params.contract,
          rarePerToken,
          tokenPerRare,
        },
      };
    },
  };
}
