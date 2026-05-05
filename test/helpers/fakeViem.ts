import {
  encodeEventTopics,
  parseEther,
  zeroAddress,
  type Address,
  type Chain,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { vi, type Mock } from 'vitest';
import { factoryAbi } from '../../src/contracts/abis/factory.js';
import { tokenAbi } from '../../src/contracts/abis/token.js';

export const sellerAccount = privateKeyToAccount(
  '0x0000000000000000000000000000000000000000000000000000000000000001',
);
export const buyerAccount = privateKeyToAccount(
  '0x0000000000000000000000000000000000000000000000000000000000000002',
);

export const sellerAddress = sellerAccount.address;
export const buyerAddress = buyerAccount.address;
export const nftContract = '0x1000000000000000000000000000000000000000' as const;
export const deployedContract = '0x2000000000000000000000000000000000000000' as const;
export const erc20Currency = '0x3000000000000000000000000000000000000000' as const;
export const marketplaceSettings = '0x4000000000000000000000000000000000000000' as const;

export type RecordedCall = {
  address?: Address;
  abi?: readonly unknown[];
  functionName?: string;
  args?: readonly unknown[];
  account?: unknown;
  chain?: unknown;
  value?: bigint;
};

type ReadResolver = unknown | Error | ((call: RecordedCall, index: number) => unknown | Promise<unknown>);
type ReceiptResolver =
  | TransactionReceipt
  | ((hash: Hash, index: number) => TransactionReceipt | Promise<TransactionReceipt>);
type WriteResolver = Hash | Error | ((call: RecordedCall, index: number) => Hash | Promise<Hash>);

export type FakePublicClient = PublicClient & {
  readCalls: RecordedCall[];
  waitCalls: Hash[];
  readContract: Mock;
  waitForTransactionReceipt: Mock;
};

export type FakeWalletClient = WalletClient & {
  writeCalls: RecordedCall[];
  writeContract: Mock;
};

export function makeHash(index: number): Hash {
  return `0x${index.toString(16).padStart(64, '0')}` as Hash;
}

export function createFakePublicClient(opts: {
  chain?: Chain;
  reads?: ReadResolver[];
  receipts?: ReceiptResolver[];
} = {}): FakePublicClient {
  const readCalls: RecordedCall[] = [];
  const waitCalls: Hash[] = [];
  const reads = [...(opts.reads ?? [])];
  const receipts = [...(opts.receipts ?? [])];
  let readIndex = 0;
  let receiptIndex = 0;

  return {
    chain: Object.hasOwn(opts, 'chain') ? opts.chain : sepolia,
    readCalls,
    waitCalls,
    readContract: vi.fn(async (call: RecordedCall) => {
      readCalls.push(call);
      if (readIndex >= reads.length) {
        throw new Error(`Unexpected readContract call: ${String(call.functionName)}`);
      }

      const resolver = reads[readIndex];
      const index = readIndex;
      readIndex += 1;

      if (resolver instanceof Error) throw resolver;
      if (typeof resolver === 'function') {
        return resolver(call, index);
      }
      return resolver;
    }),
    waitForTransactionReceipt: vi.fn(async ({ hash }: { hash: Hash }) => {
      waitCalls.push(hash);
      const resolver = receipts[receiptIndex];
      const index = receiptIndex;
      receiptIndex += 1;

      if (typeof resolver === 'function') {
        return resolver(hash, index);
      }
      return resolver ?? makeReceipt({ transactionHash: hash, blockNumber: BigInt(index + 1) });
    }),
  } as unknown as FakePublicClient;
}

export function createFakeWalletClient(opts: {
  account?: WalletClient['account'];
  hashes?: Hash[];
  writes?: WriteResolver[];
} = {}): FakeWalletClient {
  const writeCalls: RecordedCall[] = [];
  const hashes = [...(opts.hashes ?? [])];
  const writes = opts.writes ? [...opts.writes] : null;
  let writeIndex = 0;

  return {
    account: opts.account ?? sellerAccount,
    writeCalls,
    writeContract: vi.fn(async (call: RecordedCall) => {
      writeCalls.push(call);
      const index = writeIndex;
      writeIndex += 1;

      if (writes) {
        const resolver = writes[index];
        if (resolver instanceof Error) throw resolver;
        if (typeof resolver === 'function') {
          return resolver(call, index);
        }
        return resolver ?? makeHash(index + 1);
      }

      const hash = hashes[index] ?? makeHash(index + 1);
      return hash;
    }),
  } as unknown as FakeWalletClient;
}

export function makeReceipt(opts: {
  transactionHash?: Hash;
  blockNumber?: bigint;
  logs?: TransactionReceipt['logs'];
} = {}): TransactionReceipt {
  return {
    blockHash: makeHash(9000),
    blockNumber: opts.blockNumber ?? 1n,
    contractAddress: null,
    cumulativeGasUsed: 1n,
    effectiveGasPrice: 1n,
    from: sellerAddress,
    gasUsed: 1n,
    logs: opts.logs ?? [],
    logsBloom: `0x${'0'.repeat(512)}`,
    status: 'success',
    to: null,
    transactionHash: opts.transactionHash ?? makeHash(1),
    transactionIndex: 0,
    type: 'eip1559',
  } as TransactionReceipt;
}

export function makeFactoryCreatedLog(opts: {
  contractAddress?: Address;
  owner?: Address;
} = {}): TransactionReceipt['logs'][number] {
  return makeLog({
    address: opts.contractAddress ?? deployedContract,
    topics: encodeEventTopics({
      abi: factoryAbi,
      eventName: 'SovereignBatchMintCreated',
      args: {
        contractAddress: opts.contractAddress ?? deployedContract,
        owner: opts.owner ?? sellerAddress,
      },
    }),
  });
}

export function makeTransferLog(opts: {
  contract?: Address;
  from?: Address;
  to?: Address;
  tokenId?: bigint;
} = {}): TransactionReceipt['logs'][number] {
  return makeLog({
    address: opts.contract ?? nftContract,
    topics: encodeEventTopics({
      abi: tokenAbi,
      eventName: 'Transfer',
      args: {
        from: opts.from ?? zeroAddress,
        to: opts.to ?? sellerAddress,
        tokenId: opts.tokenId ?? 1n,
      },
    }),
  });
}

export function oneEth(): bigint {
  return parseEther('1');
}

function makeLog(opts: {
  address: Address;
  topics: TransactionReceipt['logs'][number]['topics'];
  data?: `0x${string}`;
}): TransactionReceipt['logs'][number] {
  return {
    address: opts.address,
    blockHash: makeHash(9000),
    blockNumber: 1n,
    data: opts.data ?? '0x',
    logIndex: 0,
    removed: false,
    topics: opts.topics,
    transactionHash: makeHash(1),
    transactionIndex: 0,
  };
}
