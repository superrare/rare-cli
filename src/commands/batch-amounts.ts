import { erc20Abi, formatEther, formatUnits, isAddressEqual, parseUnits, type Address, type PublicClient } from 'viem';
import { ETH_ADDRESS, resolveCurrency, type SupportedChain } from '../contracts/addresses.js';

type BatchAmountClient = Pick<PublicClient, 'readContract'>;

function getKnownCurrencyDecimals(currency: Address, chain: SupportedChain): number | null {
  if (isAddressEqual(currency, ETH_ADDRESS)) return 18;
  if (isAddressEqual(currency, resolveCurrency('rare', chain))) return 18;
  if (isAddressEqual(currency, resolveCurrency('usdc', chain))) return 6;
  return null;
}

export async function getBatchCurrencyDecimals(
  publicClient: BatchAmountClient,
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
  if (decimals === 18) {
    return formatEther(amount);
  }
  return formatUnits(amount, decimals);
}
