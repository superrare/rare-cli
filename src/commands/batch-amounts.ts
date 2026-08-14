import { formatUnits, parseUnits, type Address, type PublicClient } from 'viem';
import { viemChains, type SupportedChain } from '@rareprotocol/rare-sdk/contracts';
import { createRareClient } from '@rareprotocol/rare-sdk/client';

export async function getBatchCurrencyDecimals(
  publicClient: PublicClient,
  chain: SupportedChain,
  currency: Address,
): Promise<number> {
  const chainBoundClient = publicClient.chain === undefined
    ? { ...publicClient, chain: viemChains[chain] }
    : publicClient;
  return (await createRareClient({ publicClient: chainBoundClient }).currency.resolveDecimals(currency)).decimals;
}

export async function parseBatchAmount(
  publicClient: PublicClient,
  chain: SupportedChain,
  currency: Address,
  amount: string,
): Promise<bigint> {
  const decimals = await getBatchCurrencyDecimals(publicClient, chain, currency);
  return parseUnits(amount, decimals);
}

export async function formatBatchAmount(
  publicClient: PublicClient,
  chain: SupportedChain,
  currency: Address,
  amount: bigint,
): Promise<string> {
  const decimals = await getBatchCurrencyDecimals(publicClient, chain, currency);
  return formatUnits(amount, decimals);
}
