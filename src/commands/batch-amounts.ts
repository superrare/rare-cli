import { erc20Abi, formatEther, formatUnits, parseUnits, type Address, type PublicClient } from 'viem';
import { resolveCurrency, type SupportedChain } from '../contracts/addresses.js';

const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

function getKnownCurrencyDecimals(currency: Address, chain: SupportedChain): number | null {
  if (currency.toLowerCase() === ETH_ADDRESS) return 18;
  if (currency.toLowerCase() === resolveCurrency('rare', chain).toLowerCase()) return 18;
  if (currency.toLowerCase() === resolveCurrency('usdc', chain).toLowerCase()) return 6;
  return null;
}

export async function getBatchCurrencyDecimals(
  publicClient: PublicClient,
  chain: SupportedChain,
  currency: Address,
): Promise<number> {
  const known = getKnownCurrencyDecimals(currency, chain);
  if (known !== null) return known;

  return publicClient.readContract({
    address: currency,
    abi: erc20Abi,
    functionName: 'decimals',
  });
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
  if (decimals === 18) {
    return formatEther(amount);
  }
  return formatUnits(amount, decimals);
}
