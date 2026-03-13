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
};

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
