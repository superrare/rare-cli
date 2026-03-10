import { createPublicClient, createWalletClient, http } from 'viem';
import { sepolia, mainnet } from 'viem/chains';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { SupportedChain } from './contracts/addresses.js';
import { getChainConfig, readConfig, writeConfig } from './config.js';

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
    console.log(`No private key configured for chain "${chain}". Generating a new wallet...`);
    const privateKey = generatePrivateKey();
    const newAccount = privateKeyToAccount(privateKey);
    console.log(`  Address:     ${newAccount.address}`);
    console.log(`  Private Key: ${privateKey}`);
    console.log('');
    console.log('⚠ Store your private key securely. It will not be shown again.');
    console.log('');

    const config = readConfig();
    if (!config.chains[chain]) {
      config.chains[chain] = {};
    }
    config.chains[chain]!.privateKey = privateKey;
    writeConfig(config);
    console.log(`Private key saved to config for chain: ${chain}\n`);
    chainConfig.privateKey = privateKey;
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
