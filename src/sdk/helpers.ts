import {
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
  erc20Abi,
  maxUint256,
  parseEther,
} from 'viem';
import { auctionAbi } from '../contracts/abis/auction.js';
import { chainIds, type SupportedChain } from '../contracts/addresses.js';
import type { RareClientConfig, IntegerInput, AmountInput, WalletAccount } from './types.js';

export const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

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

  return parseEther(String(value));
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
  return (await preparePaymentForSpender({
    publicClient: opts.publicClient,
    walletClient: opts.walletClient,
    account: opts.account,
    accountAddress: opts.accountAddress,
    marketplaceSettingsSource: opts.auctionAddress,
    spenderAddress: opts.auctionAddress,
    currency: opts.currency,
    amount: opts.amount,
  })).value;
}

export async function preparePaymentForSpender(opts: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Address | WalletAccount;
  accountAddress: Address;
  marketplaceSettingsSource: Address;
  spenderAddress: Address;
  currency: Address;
  amount: bigint;
  autoApprove?: boolean;
}): Promise<{
  value: bigint;
  requiredAmount: bigint;
  approvalTxHash?: Hash;
}> {
  const requiredAmount = await calculateMarketplacePaymentAmount(
    opts.publicClient,
    opts.marketplaceSettingsSource,
    opts.amount,
  );

  return preparePaymentAmountForSpender({
    publicClient: opts.publicClient,
    walletClient: opts.walletClient,
    account: opts.account,
    accountAddress: opts.accountAddress,
    spenderAddress: opts.spenderAddress,
    currency: opts.currency,
    requiredAmount,
    autoApprove: opts.autoApprove,
  });
}

export async function preparePaymentAmountForSpender(opts: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Address | WalletAccount;
  accountAddress: Address;
  spenderAddress: Address;
  currency: Address;
  requiredAmount: bigint;
  autoApprove?: boolean;
}): Promise<{
  value: bigint;
  requiredAmount: bigint;
  approvalTxHash?: Hash;
}> {
  const {
    publicClient,
    walletClient,
    account,
    accountAddress,
    spenderAddress,
    currency,
    requiredAmount,
  } = opts;
  const isEth = currency === ETH_ADDRESS;
  const autoApprove = opts.autoApprove ?? true;

  if (requiredAmount === 0n) {
    return {
      value: 0n,
      requiredAmount: 0n,
    };
  }

  if (isEth) {
    return {
      value: requiredAmount,
      requiredAmount,
    };
  }

  // ERC20: ensure sufficient allowance
  let allowance: bigint | undefined;
  try {
    allowance = await publicClient.readContract({
      address: currency,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [accountAddress, spenderAddress],
    });
  } catch (error) {
    // Allowance check failed (e.g. non-standard ERC20) — approve unconditionally
    console.warn(
      'ERC20 allowance check failed, approving unconditionally:',
      error instanceof Error ? error.message : String(error),
    );
  }

  if (allowance !== undefined && allowance >= requiredAmount) {
    return {
      value: 0n,
      requiredAmount,
    };
  }

  if (!autoApprove) {
    throw new Error(
      `ERC20 allowance is below the required payment of ${requiredAmount.toString()} raw units for spender ${spenderAddress}.`,
    );
  }

  const approvalTxHash = await walletClient.writeContract({
    address: currency,
    abi: erc20Abi,
    functionName: 'approve',
    args: [spenderAddress, maxUint256],
    account,
    chain: undefined,
  });
  await publicClient.waitForTransactionReceipt({ hash: approvalTxHash });

  return {
    value: 0n,
    requiredAmount,
    approvalTxHash,
  };
}

export async function calculateMarketplacePaymentAmount(
  publicClient: PublicClient,
  marketplaceSettingsSource: Address,
  amount: bigint,
): Promise<bigint> {
  if (amount === 0n) {
    return 0n;
  }

  const settingsAddress = await publicClient.readContract({
    address: marketplaceSettingsSource,
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
