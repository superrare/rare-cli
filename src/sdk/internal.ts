import {
  type Address,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
  erc20Abi,
  maxUint256,
  parseEther,
  parseUnits,
} from 'viem';
import { ETH_ADDRESS, chainIds, type SupportedChain } from '../contracts/addresses.js';
import type { UniswapTransactionRequest } from '../swap/uniswap-api.js';

export type IntegerInput = bigint | number | string;
export type AmountInput = bigint | number | string;
export type WalletAccount = NonNullable<WalletClient['account']>;

export interface RareClientConfig {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  account?: Address;
}

export interface TransactionResult {
  txHash: Hash;
  receipt: TransactionReceipt;
}

export function resolveChainFromPublicClient(publicClient: PublicClient): SupportedChain {
  const chainId = publicClient.chain?.id;
  if (!chainId) {
    throw new Error('Unable to resolve chain from publicClient.chain.id. Create your public client with an explicit chain.');
  }

  for (const [chain, id] of Object.entries(chainIds)) {
    if (id === chainId) {
      return chain as SupportedChain;
    }
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

  if (config.account) {
    if (walletAccount && walletAccount.address.toLowerCase() === config.account.toLowerCase()) {
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

export function toInteger(value: IntegerInput, field: string): bigint {
  if (typeof value === 'bigint') return value;

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error(`${field} must be an integer.`);
    }
    return BigInt(value);
  }

  try {
    return BigInt(value);
  } catch {
    throw new Error(`${field} must be an integer.`);
  }
}

export function toWei(value: AmountInput): bigint {
  if (typeof value === 'bigint') {
    return value;
  }

  return parseEther(String(value));
}

export function requireConfiguredAddress(address: Address | undefined, label: string, chain: SupportedChain): Address {
  if (!address) {
    throw new Error(`${label} is not configured for "${chain}". Supported chains: mainnet, sepolia`);
  }
  return address;
}

export async function getTokenDecimals(publicClient: PublicClient, token: Address): Promise<number> {
  if (token === ETH_ADDRESS) {
    return 18;
  }

  const decimals = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'decimals',
  });

  return Number(decimals);
}

export async function toTokenAmount(publicClient: PublicClient, token: Address, value: AmountInput, field: string): Promise<bigint> {
  if (typeof value === 'bigint') {
    return value;
  }

  const rawValue = String(value);
  if (!/^\d+(\.\d+)?$/.test(rawValue)) {
    throw new Error(`${field} must be a valid positive decimal amount.`);
  }

  const decimals = await getTokenDecimals(publicClient, token);
  return parseUnits(rawValue, decimals);
}

export async function ensureTokenAllowance(
  publicClient: PublicClient,
  walletClient: WalletClient,
  account: Address | WalletAccount,
  owner: Address,
  token: Address,
  spender: Address,
  amount: bigint,
): Promise<void> {
  if (token === ETH_ADDRESS || amount === 0n) {
    return;
  }

  try {
    const allowance = await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [owner, spender],
    });

    if (BigInt(allowance as bigint) >= amount) {
      return;
    }
  } catch {
    // Fall through to approval write.
  }

  const approveTx = await walletClient.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: 'approve',
    args: [spender, maxUint256],
    account,
    chain: undefined,
  });

  await publicClient.waitForTransactionReceipt({ hash: approveTx });
}

export function resolveDeadline(value?: IntegerInput): bigint {
  if (value === undefined) {
    return BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  }
  return toInteger(value, 'deadline');
}

export function validateRouterPayload(commands: `0x${string}`, inputs: readonly `0x${string}`[]): void {
  const byteLength = (commands.length - 2) / 2;
  if (byteLength <= 0) {
    throw new Error('Router commands must not be empty.');
  }
  if (byteLength !== inputs.length) {
    throw new Error(`Router commands/input mismatch: commands has ${byteLength} byte(s) but ${inputs.length} input(s) were provided.`);
  }
}

export function getConfiguredAccountAddress(config: RareClientConfig): Address | undefined {
  return config.account ?? config.walletClient?.account?.address;
}

export function resolveSlippageBps(value?: IntegerInput): number {
  const slippageBps = value === undefined ? 50 : Number(toInteger(value, 'slippageBps'));
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10_000) {
    throw new Error('slippageBps must be an integer between 0 and 9999.');
  }
  return slippageBps;
}

export function computeMinAmountOut(amountOut: bigint, slippageBps: number): bigint {
  return (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
}

export function computeSlippageBpsFromAmounts(estimatedAmountOut: bigint, minAmountOut: bigint): number {
  if (estimatedAmountOut <= 0n || minAmountOut >= estimatedAmountOut) {
    return 0;
  }
  return Number(((estimatedAmountOut - minAmountOut) * 10_000n) / estimatedAmountOut);
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
): Promise<TransactionResult> {
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
