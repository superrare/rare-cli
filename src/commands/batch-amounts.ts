import { formatUnits, parseUnits, type Address, type PublicClient } from 'viem';
import type { SupportedChain } from '../contracts/addresses.js';
import { resolveCurrencyDecimals } from '../sdk/payments-shell.js';

type BatchAmountClient = Pick<PublicClient, 'readContract'>;

export async function getBatchCurrencyDecimals(
  publicClient: BatchAmountClient,
  chain: SupportedChain,
  currency: Address,
): Promise<number> {
  return resolveCurrencyDecimals(publicClient, chain, currency);
}

export async function parseBatchAmount(
  publicClient: BatchAmountClient,
  chain: SupportedChain,
  currency: Address,
  amount: string,
): Promise<bigint> {
  const decimals = await getBatchCurrencyDecimals(publicClient, chain, currency);
  return parseUnits(amount, decimals);
}

export async function formatBatchAmount(
  publicClient: BatchAmountClient,
  chain: SupportedChain,
  currency: Address,
  amount: bigint,
): Promise<string> {
  const decimals = await getBatchCurrencyDecimals(publicClient, chain, currency);
  return formatUnits(amount, decimals);
}
