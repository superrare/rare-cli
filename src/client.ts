import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { PrivateKeyAccount } from 'viem/accounts';
import { viemChains, defaultRpcUrls, type SupportedChain } from './contracts/addresses.js';
import { getChainConfig, readConfig, setChainConfig, writeConfig, type ChainConfig } from './config.js';

export function getPublicClient(chain: SupportedChain): PublicClient {
  const chainConfig = getChainConfig(chain);
  const rpcUrl = chainConfig.rpcUrl ?? defaultRpcUrls[chain];
  return createPublicClient({
    chain: viemChains[chain],
    transport: http(rpcUrl),
  });
}

export function getWalletClient(chain: SupportedChain): { client: WalletClient; account: PrivateKeyAccount } {
  const chainConfig = getWalletConfig(chain);
  const rpcUrl = getRequiredRpcUrl(chain, chainConfig);
  const account = privateKeyToAccount(chainConfig.privateKey);

  return {
    client: createWalletClient({
      chain: viemChains[chain],
      transport: http(rpcUrl),
      account,
    }),
    account,
  };
}

export function tryGetWalletClient(
  chain: SupportedChain,
): { client: WalletClient; account: PrivateKeyAccount } | null {
  const chainConfig = getChainConfig(chain);
  if (!chainConfig.privateKey) return null;
  const rpcUrl = chainConfig.rpcUrl ?? defaultRpcUrls[chain];
  if (!rpcUrl) return null;
  const account = privateKeyToAccount(chainConfig.privateKey);
  return {
    client: createWalletClient({
      chain: viemChains[chain],
      transport: http(rpcUrl),
      account,
    }),
    account,
  };
}

function getWalletConfig(chain: SupportedChain): ChainConfig & { privateKey: `0x${string}` } {
  const chainConfig = getChainConfig(chain);
  if (chainConfig.privateKey) {
    return { ...chainConfig, privateKey: chainConfig.privateKey };
  }

  console.log(`No private key configured for chain "${chain}". Generating a new wallet...`);
  const privateKey = generatePrivateKey();
  const newAccount = privateKeyToAccount(privateKey);
  console.log(`  Address:     ${newAccount.address}`);
  console.log(`  Private Key: ${privateKey}`);
  console.log('');
  console.log('Store your private key securely. It will not be shown again.');
  console.log('');

  writeConfig(setChainConfig(readConfig(), chain, { privateKey }));
  console.log(`Private key saved to config for chain: ${chain}\n`);

  return { ...chainConfig, privateKey };
}

function getRequiredRpcUrl(chain: SupportedChain, chainConfig: ChainConfig): string {
  if (chainConfig.rpcUrl !== undefined) {
    return chainConfig.rpcUrl;
  }

  const fallback = defaultRpcUrls[chain];
  if (fallback === undefined) {
    throw new Error(
      `no RPC URL configured for "${chain}" and no public default is available. ` +
        `Run: rare configure --chain ${chain} --rpc-url <your-node-url>`,
    );
  }

  console.warn(
    `Warning: no RPC URL configured for "${chain}", using public endpoint (may be unreliable).\n` +
      `  Run: rare configure --chain ${chain} --rpc-url <your-node-url>\n`,
  );
  return fallback;
}
