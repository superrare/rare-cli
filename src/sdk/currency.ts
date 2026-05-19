import type { PublicClient } from 'viem';
import {
  listCurrencies,
  resolveCurrencyInfo,
  type CurrencyInput,
  type ResolvedCurrency,
  type SupportedChain,
} from '../contracts/addresses.js';
import { resolveCurrencyDecimals } from './payments-shell.js';
import type { CurrencyNamespace } from './types/client.js';
import type { ResolvedCurrencyWithDecimals } from './types/common.js';

export type { CurrencyNamespace } from './types/client.js';
export type { ResolvedCurrencyWithDecimals } from './types/common.js';

export function createCurrencyNamespace(
  publicClient: PublicClient,
  chain: SupportedChain,
): CurrencyNamespace {
  return {
    list(): ReturnType<CurrencyNamespace['list']> {
      return listCurrencies(chain);
    },

    resolve(input): ReturnType<CurrencyNamespace['resolve']> {
      return resolveCurrencyForSdk(input, chain);
    },

    async resolveDecimals(input): ReturnType<CurrencyNamespace['resolveDecimals']> {
      const currency = resolveCurrencyForSdk(input, chain);
      if (currency.decimals !== null) {
        return currency;
      }

      return {
        ...currency,
        decimals: await resolveCurrencyDecimals(publicClient, chain, currency.address),
      };
    },
  };
}

export function resolveCurrencyForSdk(input: CurrencyInput, chain: SupportedChain): ResolvedCurrency {
  const result = resolveCurrencyInfo(input, chain);
  if (!result.isValid) {
    throw new Error(result.errorMessage);
  }

  return result.currency;
}

export async function resolveCurrencyWithDecimalsForSdk(
  publicClient: Pick<PublicClient, 'readContract'>,
  chain: SupportedChain,
  input: CurrencyInput,
): Promise<ResolvedCurrencyWithDecimals> {
  const currency = resolveCurrencyForSdk(input, chain);
  if (currency.decimals !== null) return currency;

  return {
    ...currency,
    decimals: await resolveCurrencyDecimals(publicClient, chain, currency.address),
  };
}
