import { sepolia, mainnet, base, baseSepolia } from 'viem/chains';
import type { Chain } from 'viem';

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

type ContractSet = { factory: `0x${string}`; auction: `0x${string}` };

export const contractAddresses: Partial<Record<SupportedChain, ContractSet>> = {
  sepolia: {
    factory: '0x3c7526a0975156299ceef369b8ff3c01cc670523',
    auction: '0xC8Edc7049b233641ad3723D6C60019D1c8771612',
  },
  mainnet: {
    factory: '0xAe8E375a268Ed6442bEaC66C6254d6De5AeD4aB1',
    auction: '0x6D7c44773C52D396F43c2D511B81aa168E9a7a42',
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

const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`;

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

export function supportedChainFromChainId(chainId: number): SupportedChain | undefined {
  for (const [chain, id] of Object.entries(chainIds)) {
    if (id === chainId) {
      return chain as SupportedChain;
    }
  }

  return undefined;
}
