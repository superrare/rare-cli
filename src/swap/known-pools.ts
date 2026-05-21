import { getAddress, type Address } from 'viem';
import type { SupportedChain } from '../contracts/addresses.js';
import {
  canonicalV4Pools,
  getCanonicalRareEthPool,
  getCanonicalUsdcEthPool,
  getV4QuoterAddress,
  resolveCurrency,
  type CanonicalV4Pool,
} from '../contracts/addresses.js';
import { normalizeAddress } from './pool-core.js';
import type { PoolKey } from './route-types.js';

const wrappedEthAddresses: Partial<Record<SupportedChain, Address>> = {
  mainnet: getAddress('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
  sepolia: getAddress('0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'),
  base: getAddress('0x4200000000000000000000000000000000000006'),
  'base-sepolia': getAddress('0x4200000000000000000000000000000000000006'),
};

function poolToKey(pool: CanonicalV4Pool): PoolKey {
  return {
    currency0: pool.currency0,
    currency1: pool.currency1,
    fee: pool.fee,
    tickSpacing: pool.tickSpacing,
    hooks: pool.hooks,
  };
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
  const pools = canonicalV4Pools[chain];
  if (normalizedToken === normalizeAddress(getRareAddress(chain))) {
    return pools?.rareEthPool ? poolToKey(pools.rareEthPool) : null;
  }
  if (normalizedToken === normalizeAddress(getUsdcAddress(chain))) {
    return pools?.usdcEthPool ? poolToKey(pools.usdcEthPool) : null;
  }
  return null;
}

export function getKnownCanonicalPoolSource(chain: SupportedChain, token: Address): 'known-pool' | null {
  return getKnownCanonicalEthPoolKey(chain, token) ? 'known-pool' : null;
}

export function getV4Quoter(chain: SupportedChain): Address {
  return getV4QuoterAddress(chain);
}
