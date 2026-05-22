import type { Address, Hash } from 'viem';
import type { WalletAccount } from './types/common.js';

type TransactionReceiptClient = {
  waitForTransactionReceipt: (params: { hash: Hash }) => Promise<unknown>;
};

type NftApprovalReadClient = {
  readContract: (params: {
    address: Address;
    abi: typeof approvalAbi;
    functionName: 'isApprovedForAll';
    args: readonly [Address, Address];
  }) => Promise<boolean>;
};

type NftApprovalWriteClient = {
  writeContract: (params: {
    address: Address;
    abi: typeof approvalAbi;
    functionName: 'setApprovalForAll';
    args: readonly [Address, boolean];
    account: Address | WalletAccount;
    chain: undefined;
  }) => Promise<Hash>;
};

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

/**
 * After a setApprovalForAll tx is mined, some RPCs (notably on fast chains
 * like base-sepolia) can still read the pre-approval state for a short window,
 * causing the next contract call to revert with "owner must have approved
 * contract". Poll isApprovedForAll until it reflects true, or time out.
 */
export async function waitForApproval(
  publicClient: NftApprovalReadClient,
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

export class NftApprovalRequiredError extends Error {
  readonly nftAddress: Address;
  readonly operator: Address;

  constructor(params: { nftAddress: Address; operator: Address }) {
    super(`NFT approval is required for contract ${params.nftAddress} and operator ${params.operator}.`);
    this.name = 'NftApprovalRequiredError';
    this.nftAddress = params.nftAddress;
    this.operator = params.operator;
  }
}

export class MinterApprovalRequiredError extends Error {
  readonly collection: Address;
  readonly minter: Address;

  constructor(params: { collection: Address; minter: Address }) {
    super(`Minter approval is required for collection ${params.collection} and minter ${params.minter}.`);
    this.name = 'MinterApprovalRequiredError';
    this.collection = params.collection;
    this.minter = params.minter;
  }
}

export async function approveNftContractIfNeeded(opts: {
  publicClient: NftApprovalReadClient & TransactionReceiptClient;
  walletClient: NftApprovalWriteClient;
  account: Address | WalletAccount;
  accountAddress: Address;
  nftAddress: Address;
  operator: Address;
  autoApprove?: boolean;
}): Promise<Hash | undefined> {
  const isApproved = await opts.publicClient.readContract({
    address: opts.nftAddress,
    abi: approvalAbi,
    functionName: 'isApprovedForAll',
    args: [opts.accountAddress, opts.operator],
  });

  if (isApproved) {
    return undefined;
  }

  if (opts.autoApprove === false) {
    throw new NftApprovalRequiredError({
      nftAddress: opts.nftAddress,
      operator: opts.operator,
    });
  }

  const approvalTxHash = await opts.walletClient.writeContract({
    address: opts.nftAddress,
    abi: approvalAbi,
    functionName: 'setApprovalForAll',
    args: [opts.operator, true],
    account: opts.account,
    chain: undefined,
  });

  await opts.publicClient.waitForTransactionReceipt({ hash: approvalTxHash });
  await waitForApproval(opts.publicClient, opts.nftAddress, opts.accountAddress, opts.operator);

  return approvalTxHash;
}
