import { createPublicClient, createWalletClient, http, type Address, type PublicClient, type WalletClient } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { LocalAccount, PrivateKeyAccount } from 'viem/accounts';
import { viemChains, defaultRpcUrls, type SupportedChain } from './contracts/addresses.js';
import {
  getChainConfig,
  readConfig,
  setChainConfig,
  writeConfig,
  type ChainConfig,
  type PrivateKeyReference,
} from './config.js';
import { createOnePasswordAccount } from './one-password.js';

export type WalletAccount = PrivateKeyAccount | LocalAccount;

type WalletResult = {
  client: WalletClient;
  account: WalletAccount;
};

type PlaintextWalletConfig = ChainConfig & { privateKey: `0x${string}` };
type OnePasswordWalletConfig = ChainConfig & {
  privateKeyRef: PrivateKeyReference;
  walletAddress: Address;
};
type WalletConfig = PlaintextWalletConfig | OnePasswordWalletConfig;

export function getPublicClient(chain: SupportedChain): PublicClient {
  const chainConfig = getChainConfig(chain);
  const rpcUrl = chainConfig.rpcUrl ?? defaultRpcUrls[chain];
  return createPublicClient({
    chain: viemChains[chain],
    transport: http(rpcUrl),
  });
}

export function getWalletClient(chain: SupportedChain): WalletResult {
  const chainConfig = getWalletConfig(chain);
  const rpcUrl = getRequiredRpcUrl(chain, chainConfig);
  const account = getWalletAccount(chainConfig);

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
): WalletResult | null {
  const chainConfig = getChainConfig(chain);
  const walletConfig = getExistingWalletConfig(chainConfig);
  if (walletConfig === null) return null;
  const rpcUrl = chainConfig.rpcUrl ?? defaultRpcUrls[chain];
  if (!rpcUrl) return null;
  const account = getWalletAccount(walletConfig);
  return {
    client: createWalletClient({
      chain: viemChains[chain],
      transport: http(rpcUrl),
      account,
    }),
    account,
  };
}

export function getConfiguredWalletAddress(chain: SupportedChain): Address | undefined {
  const chainConfig = getChainConfig(chain);
  if (chainConfig.privateKey) {
    return privateKeyToAccount(chainConfig.privateKey).address;
  }

  return chainConfig.walletAddress;
}

function getWalletAccount(chainConfig: WalletConfig): WalletAccount {
  if (chainConfig.privateKey !== undefined) {
    return privateKeyToAccount(chainConfig.privateKey);
  }

  return createOnePasswordAccount({
    address: chainConfig.walletAddress,
    privateKeyRef: chainConfig.privateKeyRef,
  });
}

function getWalletConfig(chain: SupportedChain): WalletConfig {
  const chainConfig = getChainConfig(chain);
  const walletConfig = getExistingWalletConfig(chainConfig);
  if (walletConfig !== null) return walletConfig;

  if (chainConfig.privateKeyRef !== undefined) {
    throw new Error(
      `1Password private key reference configured for chain "${chain}" is missing walletAddress. ` +
        `Run: rare configure --chain ${chain} --private-key-ref ${chainConfig.privateKeyRef}`,
    );
  }

  console.log(`No private key configured for chain "${chain}". Generating a new wallet...`);
  const privateKey = generatePrivateKey();
  const newAccount = privateKeyToAccount(privateKey);
  console.log(`  Address:     ${newAccount.address}`);
  console.log(`  Private Key: ${privateKey}`);
  console.log('');
  console.log('Store your private key securely. It will not be shown again.');
  console.log('');

  writeConfig(setChainConfig(readConfig(), chain, {
    privateKey,
    privateKeyRef: undefined,
    walletAddress: undefined,
  }));
  console.log(`Private key saved to config for chain: ${chain}\n`);

  return { ...chainConfig, privateKey };
}

function getExistingWalletConfig(chainConfig: ChainConfig): WalletConfig | null {
  if (chainConfig.privateKey !== undefined) {
    return { ...chainConfig, privateKey: chainConfig.privateKey };
  }

  if (chainConfig.privateKeyRef !== undefined && chainConfig.walletAddress !== undefined) {
    return {
      ...chainConfig,
      privateKeyRef: chainConfig.privateKeyRef,
      walletAddress: chainConfig.walletAddress,
    };
  }

  return null;
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
