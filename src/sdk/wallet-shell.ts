import { type Address, type Hash, type PublicClient, type WalletClient, isAddressEqual } from 'viem';
import { chainIds, supportedChains, type SupportedChain } from '../contracts/addresses.js';
import type { UniswapTransactionRequest } from '../swap/uniswap-api.js';
import type { RareClientConfig } from './types/client.js';
import type { IntegerInput, TransactionResult, WalletAccount } from './types/common.js';
import { toPositiveInteger } from './amounts-core.js';

export function resolveChainFromPublicClient(publicClient: PublicClient): SupportedChain {
  const chainId = publicClient.chain?.id;
  if (!chainId) {
    throw new Error('Unable to resolve chain from publicClient.chain.id. Create your public client with an explicit chain.');
  }

  const chain = supportedChains.find((supportedChain) => chainIds[supportedChain] === chainId);
  if (chain !== undefined) {
    return chain;
  }

  throw new Error(`Unsupported chain id: ${chainId}. Supported chain ids: ${Object.values(chainIds).join(', ')}`);
}

export function requireWallet(config: RareClientConfig): {
  walletClient: WalletClient;
  account: Address | WalletAccount;
  accountAddress: Address;
} {
  if (!config.walletClient) {
    throw new Error('walletClient is required for write operations.');
  }

  const walletAccount = config.walletClient.account;

  if (config.account !== undefined) {
    if (walletAccount != null && isAddressEqual(walletAccount.address, config.account)) {
      return {
        walletClient: config.walletClient,
        account: walletAccount,
        accountAddress: walletAccount.address,
      };
    }

    return {
      walletClient: config.walletClient,
      account: config.account,
      accountAddress: config.account,
    };
  }

  if (!walletAccount) {
    throw new Error('No account available for write operations. Pass config.account or provide walletClient with an account.');
  }

  return {
    walletClient: config.walletClient,
    account: walletAccount,
    accountAddress: walletAccount.address,
  };
}

export function resolveDeadline(value?: IntegerInput): bigint {
  if (value === undefined) {
    return BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  }
  return toPositiveInteger(value, 'deadline');
}

export function getConfiguredAccountAddress(config: RareClientConfig): Address | undefined {
  return config.account ?? config.walletClient?.account?.address;
}

export function parsePreparedBigInt(value?: string): bigint | undefined {
  if (!value) {
    return undefined;
  }
  return value.startsWith('0x') ? BigInt(value) : BigInt(value);
}

export async function sendPreparedTransaction(
  publicClient: PublicClient,
  walletClient: WalletClient,
  account: Address | WalletAccount,
  tx: UniswapTransactionRequest,
  expected: {
    accountAddress: Address;
    chainId: number;
  },
): Promise<TransactionResult> {
  if (!isAddressEqual(tx.from, expected.accountAddress)) {
    throw new Error(
      `Prepared transaction sender ${tx.from} does not match wallet account ${expected.accountAddress}.`,
    );
  }
  if (tx.chainId !== expected.chainId) {
    throw new Error(
      `Prepared transaction chain ID ${tx.chainId.toString()} does not match client chain ID ${expected.chainId.toString()}.`,
    );
  }

  const txHash = await walletClient.sendTransaction({
    account,
    to: tx.to,
    data: tx.data,
    value: parsePreparedBigInt(tx.value),
    chain: undefined,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash, receipt };
}

export type { Hash };
