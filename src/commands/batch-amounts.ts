import { formatUnits, isAddressEqual, parseUnits, type Address, type PublicClient } from 'viem';
import { ETH_ADDRESS, viemChains, type SupportedChain } from '@rareprotocol/rare-sdk/contracts';
import { createRareClient } from '@rareprotocol/rare-sdk/client';

export async function getBatchCurrencyDecimals(
  publicClient: PublicClient,
  chain: SupportedChain,
  currency: Address,
): Promise<number> {
  if (isAddressEqual(currency, ETH_ADDRESS)) return 18;
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
