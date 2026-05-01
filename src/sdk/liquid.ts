import { type Address, type Hash, type PublicClient, type TransactionReceipt, parseEventLogs, parseUnits } from 'viem';
import type { SupportedChain } from '../contracts/addresses.js';
import { liquidFactoryAbi } from '../contracts/abis/liquid-factory.js';
import { buildCurvePreview, generatePresetCurves, validateCurves } from '../liquid/curve-config.js';
import { fetchLiquidFactoryConfig } from '../liquid/factory-config.js';
import { getTokenPrice } from './api.js';
import {
  ensureTokenAllowance,
  requireConfiguredAddress,
  requireWallet,
  toTokenAmount,
} from './helpers.js';
import type { RareClient, RareClientConfig } from './types.js';

const LIQUID_TOKEN_CREATED_LOG_RETRY_ATTEMPTS = 3;
const LIQUID_TOKEN_CREATED_LOG_RETRY_DELAY_MS = 1_000;

function sleep(ms: number): Promise<void> {
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

function getLiquidTokenAddressFromReceipt(receipt: TransactionReceipt): Address | undefined {
  const logs = parseEventLogs({
    abi: liquidFactoryAbi,
    logs: receipt.logs,
    eventName: 'LiquidTokenCreated',
  });
  return logs[0]?.args.token;
}

function missingLiquidTokenAddressError(txHash: Hash, receipt: TransactionReceipt, cause?: unknown): Error {
  const statusPhrase = receipt.status === 'success'
    ? 'succeeded'
    : `was confirmed with status "${receipt.status}"`;
  const message =
    `Liquid token deploy transaction ${statusPhrase}, but the deployed contract address could not be read ` +
    `from the LiquidTokenCreated event logs after ${LIQUID_TOKEN_CREATED_LOG_RETRY_ATTEMPTS + 1} attempts. ` +
    `Transaction hash: ${txHash}. Block: ${receipt.blockNumber}. The connected RPC may be delayed or returning ` +
    'incomplete receipt logs; retry with a synced RPC or inspect the transaction hash.';

  return cause instanceof Error ? new Error(message, { cause }) : new Error(message);
}

async function waitForLiquidTokenAddress(
  publicClient: PublicClient,
  txHash: Hash,
): Promise<{ receipt: TransactionReceipt; contract: Address }> {
  let receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  let contract = getLiquidTokenAddressFromReceipt(receipt);
  if (contract) {
    return { receipt, contract };
  }

  let lastRpcError: unknown;
  for (let attempt = 0; attempt < LIQUID_TOKEN_CREATED_LOG_RETRY_ATTEMPTS; attempt += 1) {
    await sleep(LIQUID_TOKEN_CREATED_LOG_RETRY_DELAY_MS);
    try {
      receipt = await publicClient.getTransactionReceipt({ hash: txHash });
      contract = getLiquidTokenAddressFromReceipt(receipt);
      if (contract) {
        return { receipt, contract };
      }
    } catch (error) {
      lastRpcError = error;
    }
  }

  throw missingLiquidTokenAddressError(txHash, receipt, lastRpcError);
}

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
      const liquidFactory = requireConfiguredAddress(addresses.liquidFactory, 'Liquid Editions factory', chain);
      const [factoryConfig, rarePriceUsd] = await Promise.all([
        fetchLiquidFactoryConfig(publicClient, liquidFactory),
        fetchRarePriceUsd(),
      ]);
      const curves = generatePresetCurves(params.preset, rarePriceUsd, factoryConfig);
      return {
        preset: params.preset,
        rarePriceUsd,
        curves,
        preview: buildCurvePreview(curves, factoryConfig, rarePriceUsd),
      };
    },

    async validateCurves(params) {
      const liquidFactory = requireConfiguredAddress(addresses.liquidFactory, 'Liquid Editions factory', chain);
      const [factoryConfig, rarePriceUsd] = await Promise.all([
        fetchLiquidFactoryConfig(publicClient, liquidFactory),
        maybeFetchRarePriceUsd(),
      ]);
      const validation = validateCurves(params.curves, factoryConfig);
      if (!validation.isValid || !validation.curves) {
        throw new Error(validation.errorMessage ?? 'Invalid curve configuration');
      }
      return buildCurvePreview(validation.curves, factoryConfig, rarePriceUsd);
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

      const { receipt, contract } = await waitForLiquidTokenAddress(publicClient, txHash);

      return {
        txHash,
        receipt,
        contract,
        tokenUri: params.tokenUri,
        curves: validation.curves,
      };
    },
  };
}
