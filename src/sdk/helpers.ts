import {
  type Address,
  type PublicClient,
  type WalletClient,
  erc20Abi,
  maxUint256,
  parseEther,
  parseUnits,
  zeroAddress,
} from 'viem';
import { auctionAbi } from '../contracts/abis/auction.js';
import { chainIds, supportedChains, type SupportedChain } from '../contracts/addresses.js';
import type { UniswapTransactionRequest } from '../swap/uniswap-api.js';
import type { RareClientConfig, IntegerInput, AmountInput, WalletAccount, TransactionResult } from './types.js';

export const ETH_ADDRESS = zeroAddress;
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_INTEGER_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

export const approvalAbi = [
  {
    inputs: [{ name: 'owner', type: 'address' }, { name: 'operator', type: 'address' }],
    name: 'isApprovedForAll',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }],
    name: 'setApprovalForAll',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export const marketplaceSettingsAbi = [
  {
    inputs: [{ name: '_amount', type: 'uint256' }],
    name: 'calculateMarketplaceFee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * After a setApprovalForAll tx is mined, some RPCs (notably on fast chains
 * like base-sepolia) can still read the pre-approval state for a short window,
 * causing the next contract call to revert with "owner must have approved
 * contract". Poll isApprovedForAll until it reflects true, or time out.
 */
export async function waitForApproval(
  publicClient: PublicClient,
  nftAddress: Address,
  owner: Address,
  operator: Address,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const intervalMs = opts.intervalMs ?? 500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const approved = await publicClient.readContract({
      address: nftAddress,
      abi: approvalAbi,
      functionName: 'isApprovedForAll',
      args: [owner, operator],
    });
    if (approved) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `setApprovalForAll did not propagate to readable state within ${timeoutMs}ms. ` +
      `The approval tx was mined but the marketplace still sees the old state. Retry the operation.`,
  );
}

export function resolveChainFromPublicClient(publicClient: PublicClient): SupportedChain {
  const chainId = publicClient.chain?.id;
  if (!chainId) {
    throw new Error('Unable to resolve chain from publicClient.chain.id. Create your public client with an explicit chain.');
  }

  for (const chain of supportedChains) {
    if (chainIds[chain] === chainId) {
      return chain;
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
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${field} is too large to pass as a number. Pass it as a string or bigint to avoid precision loss.`);
    }
    return BigInt(value);
  }

  try {
    return BigInt(value);
  } catch {
    throw new Error(`${field} must be an integer.`);
  }
}

export function toSafeIntegerNumber(value: IntegerInput, field: string): number {
  const integer = toInteger(value, field);
  if (integer < MIN_SAFE_INTEGER_BIGINT || integer > MAX_SAFE_INTEGER_BIGINT) {
    throw new Error(`${field} must fit in a safe JavaScript integer.`);
  }
  return Number(integer);
}

function stringifyAmountInput(value: Exclude<AmountInput, bigint>, field: string): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${field} must be a valid finite decimal amount.`);
    }
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new Error(`${field} is too large to pass as a number. Pass it as a string or bigint to avoid precision loss.`);
    }
  }
  return String(value);
}

export function toNonNegativeInteger(value: IntegerInput, field: string): bigint {
  const normalized = toInteger(value, field);
  if (normalized < 0n) {
    throw new Error(`${field} must be greater than or equal to 0.`);
  }
  return normalized;
}

export function toPositiveInteger(value: IntegerInput, field: string): bigint {
  const normalized = toInteger(value, field);
  if (normalized <= 0n) {
    throw new Error(`${field} must be greater than 0.`);
  }
  return normalized;
}

export function toWei(value: AmountInput): bigint {
  if (typeof value === 'bigint') {
    return value;
  }

  return parseEther(stringifyAmountInput(value, 'amount'));
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

export async function toTokenAmount(
  publicClient: PublicClient,
  token: Address,
  value: AmountInput,
  field: string,
): Promise<bigint> {
  if (typeof value === 'bigint') {
    return value;
  }

  const rawValue = stringifyAmountInput(value, field);
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

    if (allowance >= amount) {
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

export function toNonNegativeWei(value: AmountInput, field: string): bigint {
  const normalized = toWei(value);
  if (normalized < 0n) {
    throw new Error(`${field} must be greater than or equal to 0.`);
  }
  return normalized;
}

export function toPositiveWei(value: AmountInput, field: string): bigint {
  const normalized = toWei(value);
  if (normalized <= 0n) {
    throw new Error(`${field} must be greater than 0.`);
  }
  return normalized;
}

/**
 * Handles ETH fee calculation or ERC20 allowance approval before a payment transaction.
 * Returns the `value` to attach to the transaction (non-zero only for ETH payments).
 */
export async function preparePayment(opts: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Address | WalletAccount;
  accountAddress: Address;
  auctionAddress: Address;
  currency: Address;
  amount: bigint;
}): Promise<bigint> {
  const { publicClient, walletClient, account, accountAddress, auctionAddress, currency, amount } = opts;
  const isEth = currency === ETH_ADDRESS;

  if (isEth) {
    const settingsAddress = await publicClient.readContract({
      address: auctionAddress,
      abi: auctionAbi,
      functionName: 'marketplaceSettings',
    });
    const fee = await publicClient.readContract({
      address: settingsAddress,
      abi: marketplaceSettingsAbi,
      functionName: 'calculateMarketplaceFee',
      args: [amount],
    });
    return amount + fee;
  }

  // ERC20: ensure sufficient allowance
  let allowance: bigint | undefined;
  try {
    allowance = await publicClient.readContract({
      address: currency,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [accountAddress, auctionAddress],
    });
  } catch (err) {
    // Allowance check failed (e.g. non-standard ERC20) — approve unconditionally
    console.warn('ERC20 allowance check failed, approving unconditionally:', err instanceof Error ? err.message : String(err));
  }

  if (allowance === undefined || allowance < amount) {
    const approveTx = await walletClient.writeContract({
      address: currency,
      abi: erc20Abi,
      functionName: 'approve',
      args: [auctionAddress, maxUint256],
      account,
      chain: undefined,
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
  }

  return 0n;
}
