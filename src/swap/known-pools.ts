import type { Address } from 'viem';
import type { SupportedChain } from '../contracts/addresses.js';
import {
  getCanonicalRareEthPool,
  getCanonicalUsdcEthPool,
  getV4QuoterAddress,
  resolveCurrency,
} from '../contracts/addresses.js';
import type { PoolKey } from './route-types.js';

const wrappedEthAddresses: Partial<Record<SupportedChain, Address>> = {
  mainnet: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  sepolia: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
  base: '0x4200000000000000000000000000000000000006',
  'base-sepolia': '0x4200000000000000000000000000000000000006',
};

function poolToKey(pool: ReturnType<typeof getCanonicalRareEthPool>): PoolKey {
  return {
    currency0: pool.currency0,
    currency1: pool.currency1,
    fee: pool.fee,
    tickSpacing: pool.tickSpacing,
    hooks: pool.hooks,
  };
}

function normalizeAddress(value: Address): string {
  return value.toLowerCase();
}

export function getCanonicalRareEthPoolKey(chain: SupportedChain): PoolKey {
  return poolToKey(getCanonicalRareEthPool(chain));
}

export function getCanonicalUsdcEthPoolKey(chain: SupportedChain): PoolKey {
  return poolToKey(getCanonicalUsdcEthPool(chain));
}

export function getRareAddress(chain: SupportedChain): Address {
  return resolveCurrency('rare', chain);
}

export function getUsdcAddress(chain: SupportedChain): Address {
  return resolveCurrency('usdc', chain);
}

export function getWrappedEthAddress(chain: SupportedChain): Address | null {
  return wrappedEthAddresses[chain] ?? null;
}

export function getKnownCanonicalEthPoolKey(chain: SupportedChain, token: Address): PoolKey | null {
  const normalizedToken = normalizeAddress(token);
  if (normalizedToken === normalizeAddress(getRareAddress(chain))) {
    return getCanonicalRareEthPoolKey(chain);
  }
  if (normalizedToken === normalizeAddress(getUsdcAddress(chain))) {
    return getCanonicalUsdcEthPoolKey(chain);
  }
  return null;
}

export function getKnownCanonicalPoolSource(chain: SupportedChain, token: Address): 'known-pool' | null {
  return getKnownCanonicalEthPoolKey(chain, token) ? 'known-pool' : null;
}

export function getV4Quoter(chain: SupportedChain): Address {
  return getV4QuoterAddress(chain);
}
