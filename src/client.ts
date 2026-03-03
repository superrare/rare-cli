import { createPublicClient, createWalletClient, http } from 'viem';
import { sepolia, mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import type { SupportedChain } from './contracts/addresses.js';
import { getChainConfig } from './config.js';

const viemChains = {
  sepolia,
  mainnet,
} as const;

const defaultRpcUrls: Record<SupportedChain, string> = {
  sepolia: 'https://rpc.sepolia.org',
  mainnet: 'https://eth.llamarpc.com',
};

export function getPublicClient(chain: SupportedChain) {
  const chainConfig = getChainConfig(chain);
  const rpcUrl = chainConfig.rpcUrl ?? defaultRpcUrls[chain];
  return createPublicClient({
    chain: viemChains[chain],
    transport: http(rpcUrl),
  });
}

export function getWalletClient(chain: SupportedChain) {
  const chainConfig = getChainConfig(chain);
  if (!chainConfig.privateKey) {
    console.error(
      `Error: no private key configured for chain "${chain}". Run: rare configure --chain ${chain} --private-key 0x...`
    );
    process.exit(1);
  }
  if (!chainConfig.rpcUrl) {
    console.warn(
      `Warning: no RPC URL configured for "${chain}", using public endpoint (may be unreliable).\n` +
        `  Run: rare configure --chain ${chain} --rpc-url <your-node-url>\n`
    );
  }
  const rpcUrl = chainConfig.rpcUrl ?? defaultRpcUrls[chain];
  const account = privateKeyToAccount(chainConfig.privateKey as `0x${string}`);
  return {
    client: createWalletClient({
      chain: viemChains[chain],
      transport: http(rpcUrl),
      account,
    }),
    account,
  };
}
