import type { Address, Chain } from 'viem';
import { sepolia, mainnet, base, baseSepolia } from 'viem/chains';

export const supportedChains = [
  'mainnet',
  'sepolia',
  'base',
  'base-sepolia',
] as const;

export type SupportedChain = (typeof supportedChains)[number];

export const viemChains: Record<SupportedChain, Chain> = {
  mainnet,
  sepolia,
  base,
  'base-sepolia': baseSepolia,
};

export const chainIds: Record<SupportedChain, number> = {
  mainnet: 1,
  sepolia: 11155111,
  base: 8453,
  'base-sepolia': 84532,
};

export const defaultRpcUrls: Partial<Record<SupportedChain, string>> = {
  mainnet: 'https://eth.llamarpc.com',
  sepolia: 'https://rpc.sepolia.org',
  base: 'https://mainnet.base.org',
  'base-sepolia': 'https://sepolia.base.org',
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

export interface CanonicalV4Pool {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
  poolId?: `0x${string}`;
}

type ContractSet = {
  factory: Address;
  auction: Address;
  liquidFactory?: Address;
  swapRouter?: Address;
  v4Quoter?: Address;
  rareEthPool?: CanonicalV4Pool;
  usdcEthPool?: CanonicalV4Pool;
};

export const contractAddresses: Partial<Record<SupportedChain, ContractSet>> = {
  sepolia: {
    factory: '0x3c7526a0975156299ceef369b8ff3c01cc670523',
    auction: '0xC8Edc7049b233641ad3723D6C60019D1c8771612',
    liquidFactory: '0xfD18C0D99e5b6F89F3538806241C2C0d6FD728Ac',
    swapRouter: '0x429c3Ee66E7f6CDA12C5BadE4104aF3277aA2305',
    v4Quoter: '0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227',
    rareEthPool: {
      currency0: ZERO_ADDRESS,
      currency1: '0x197FaeF3f59eC80113e773Bb6206a17d183F97CB',
      fee: 3000,
      tickSpacing: 60,
      hooks: ZERO_ADDRESS,
      poolId: '0x781d2707a6eb9cd3bdbea356a0ba90f9c5ef274927f5e72b0060bba5abd94f03',
    },
    usdcEthPool: {
      currency0: ZERO_ADDRESS,
      currency1: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      fee: 3000,
      tickSpacing: 60,
      hooks: ZERO_ADDRESS,
      poolId: '0x3390c733d8252e864d4ce769398dd3fb8680d1f626719e8d7736d062665f0987',
    },
  },
  mainnet: {
    factory: '0xAe8E375a268Ed6442bEaC66C6254d6De5AeD4aB1',
    auction: '0x6D7c44773C52D396F43c2D511B81aa168E9a7a42',
    liquidFactory: '0xd3D8Ca76E8c5547694106378B6e471B4AC8EFC63',
    swapRouter: '0xEBd58EdA8408d9EA409f2c2bE8898BD9738f3583',
    v4Quoter: '0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203',
    rareEthPool: {
      currency0: ZERO_ADDRESS,
      currency1: '0xba5BDe662c17e2aDFF1075610382B9B691296350',
      fee: 3000,
      tickSpacing: 60,
      hooks: ZERO_ADDRESS,
      poolId: '0xc5e82ff54924a7232a3e91ca252d505f4e4417afa2b6a8507dfb691182cd0b16',
    },
    usdcEthPool: {
      currency0: ZERO_ADDRESS,
      currency1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      fee: 3000,
      tickSpacing: 60,
      hooks: ZERO_ADDRESS,
      poolId: '0xdce6394339af00981949f5f3baf27e3610c76326a700af57e4b3e3ae4977f78d',
    },
  },
  base: {
    factory: '0xf776204233bfb52ba0ddff24810cbdbf3dbf94dd',
    auction: '0x51c36ffb05e17ed80ee5c02fa83d7677c5613de2',
  },
  'base-sepolia': {
    factory: '0x2b181ae0f1aea6fed75591b04991b1a3f9868d51',
    auction: '0x1f0c946f0ee87acb268d50ede6c9b4d010af65d2',
  },
};

export type CurrencyName = 'eth' | 'usdc' | 'rare';

export const ETH_ADDRESS = ZERO_ADDRESS;

const currencyAddresses: Record<CurrencyName, Partial<Record<SupportedChain, `0x${string}`>>> = {
  eth: {
    mainnet: ETH_ADDRESS,
    sepolia: ETH_ADDRESS,
    base: ETH_ADDRESS,
    'base-sepolia': ETH_ADDRESS,
  },
  rare: {
    mainnet: '0xba5BDe662c17e2aDFF1075610382B9B691296350',
    sepolia: '0x197FaeF3f59eC80113e773Bb6206a17d183F97CB',
    base: '0x691077c8e8de54ea84efd454630439f99bd8c92f',
    'base-sepolia': '0x8b21bC8571d11F7AdB705ad8F6f6BD1deb79cE01',
  },
  usdc: {
    mainnet: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    sepolia: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
};

export const currencyNames = Object.keys(currencyAddresses) as CurrencyName[];

export function resolveCurrency(input: string, chain: SupportedChain): `0x${string}` {
  const lower = input.toLowerCase();
  if (lower in currencyAddresses) {
    const addr = currencyAddresses[lower as CurrencyName][chain];
    if (!addr) {
      throw new Error(`Currency "${lower}" is not available on "${chain}".`);
    }
    return addr;
  }
  if (input.startsWith('0x')) {
    return input as `0x${string}`;
  }
  throw new Error(`Unknown currency "${input}". Supported: ${currencyNames.join(', ')} or a 0x address.`);
}

export function getContractAddresses(chain: SupportedChain): ContractSet {
  const addresses = contractAddresses[chain];
  if (!addresses) {
    throw new Error(
      `RARE Protocol contracts are not deployed on "${chain}". Supported chains: ${Object.keys(contractAddresses).join(', ')}`
    );
  }
  return addresses;
}

export function isSupportedChain(value: string): value is SupportedChain {
  return (supportedChains as readonly string[]).includes(value);
}

export function getLiquidFactoryAddress(chain: SupportedChain): Address {
  const address = getContractAddresses(chain).liquidFactory;
  if (!address) {
    throw new Error(`Liquid Editions factory is not configured for "${chain}". Supported chains: mainnet, sepolia`);
  }
  return address;
}

export function getSwapRouterAddress(chain: SupportedChain): Address {
  const address = getContractAddresses(chain).swapRouter;
  if (!address) {
    throw new Error(`Liquid router is not configured for "${chain}". Supported chains: mainnet, sepolia`);
  }
  return address;
}

export function getV4QuoterAddress(chain: SupportedChain): Address {
  const address = getContractAddresses(chain).v4Quoter;
  if (!address) {
    throw new Error(`Uniswap V4 quoter is not configured for "${chain}". Supported chains: mainnet, sepolia`);
  }
  return address;
}

export function getCanonicalRareEthPool(chain: SupportedChain): CanonicalV4Pool {
  const pool = getContractAddresses(chain).rareEthPool;
  if (!pool) {
    throw new Error(`Canonical RARE/ETH pool is not configured for "${chain}". Supported chains: mainnet, sepolia`);
  }
  return pool;
}

export function getCanonicalUsdcEthPool(chain: SupportedChain): CanonicalV4Pool {
  const pool = getContractAddresses(chain).usdcEthPool;
  if (!pool) {
    throw new Error(`Canonical USDC/ETH pool is not configured for "${chain}". Supported chains: mainnet, sepolia`);
  }
  return pool;
}
