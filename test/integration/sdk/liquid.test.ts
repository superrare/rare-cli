import { describe, expect, it, vi } from 'vitest';
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  isHex,
  maxUint256,
  parseUnits,
  type Address,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { liquidFactoryAbi } from '../../../src/contracts/abis/liquid-factory.js';
import { createRareClient } from '../../../src/sdk/client.js';

type ReadCall = {
  address: Address;
  functionName: string;
  args?: readonly unknown[];
};

type WriteCall = {
  address: Address;
  functionName: string;
  args?: readonly unknown[];
};

const baseToken = getAddress('0xba5BDe662c17e2aDFF1075610382B9B691296350');
const liquidFactory = getAddress('0xfD18C0D99e5b6F89F3538806241C2C0d6FD728Ac');
const deployedToken = getAddress('0xf100000000000000000000000000000000000001');
const deployTxHash = testHash('1');
const approvalTxHash = testHash('2');
const tokenUri = 'ipfs://liquid-edition-metadata';
const account = privateKeyToAccount(
  '0x0000000000000000000000000000000000000000000000000000000000000001',
);
const validCurves = [
  { tickLower: -60_000, tickUpper: 60_000, numPositions: 1, shares: '1' },
];

describe('Liquid Editions SDK integration with controlled clients', () => {
  it('prepares allowance, writes the multi-curve deploy, and reads the deployed token from logs', async () => {
    const { publicClient, walletClient, writeCalls, waitCalls } = createControlledClients({
      allowance: 0n,
    });
    const rare = createRareClient({ publicClient, walletClient });

    const result = await rare.liquid.deployMultiCurve({
      name: 'Liquid Test',
      symbol: 'LIQ',
      tokenUri,
      initialRareLiquidity: '1.5',
      curves: validCurves,
    });

    expect(result.contract).toBe(getAddress(deployedToken));
    expect(result.txHash).toBe(deployTxHash);
    expect(result.tokenUri).toBe(tokenUri);
    expect(result.curves).toEqual(validCurves);
    expect(waitCalls).toEqual([approvalTxHash, deployTxHash]);

    expect(writeCalls).toHaveLength(2);
    expect(writeCalls[0]).toMatchObject({
      address: baseToken,
      functionName: 'approve',
      args: [liquidFactory, maxUint256],
    });
    expect(writeCalls[1]).toMatchObject({
      address: liquidFactory,
      functionName: 'createLiquidTokenMultiCurve',
    });
    expect(writeCalls[1]?.args).toEqual([
      account.address,
      tokenUri,
      'Liquid Test',
      'LIQ',
      parseUnits('1.5', 18),
      [
        {
          tickLower: -60_000,
          tickUpper: 60_000,
          numPositions: 1,
          shares: parseUnits('1', 18),
        },
      ],
    ]);
  });

  it('rejects invalid curve input before submitting a write transaction', async () => {
    const { publicClient, walletClient, writeCalls } = createControlledClients({
      allowance: maxUint256,
    });
    const rare = createRareClient({ publicClient, walletClient });

    await expect(
      rare.liquid.deployMultiCurve({
        name: 'Liquid Test',
        symbol: 'LIQ',
        tokenUri,
        curves: [{ tickLower: 0, tickUpper: 100, numPositions: 1, shares: '1' }],
      }),
    ).rejects.toThrow('Ticks must align to spacing 60');

    expect(writeCalls).toEqual([]);
  });

  it('skips approval when initial liquidity is omitted', async () => {
    const { publicClient, walletClient, readCalls, writeCalls, waitCalls } = createControlledClients({
      allowance: 0n,
    });
    const rare = createRareClient({ publicClient, walletClient });

    const result = await rare.liquid.deployMultiCurve({
      name: 'Liquid Test',
      symbol: 'LIQ',
      tokenUri,
      curves: validCurves,
    });

    expect(result.contract).toBe(getAddress(deployedToken));
    expect(readCalls.some((call) => call.functionName === 'allowance')).toBe(false);
    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0]).toMatchObject({
      address: liquidFactory,
      functionName: 'createLiquidTokenMultiCurve',
    });
    expect(writeCalls[0]?.args?.[4]).toBe(0n);
    expect(waitCalls).toEqual([deployTxHash]);
  });

  it('skips approval when existing allowance covers initial liquidity', async () => {
    const { publicClient, walletClient, writeCalls, waitCalls } = createControlledClients({
      allowance: maxUint256,
    });
    const rare = createRareClient({ publicClient, walletClient });

    await rare.liquid.deployMultiCurve({
      name: 'Liquid Test',
      symbol: 'LIQ',
      tokenUri,
      initialRareLiquidity: '1.5',
      curves: validCurves,
    });

    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0]).toMatchObject({
      address: liquidFactory,
      functionName: 'createLiquidTokenMultiCurve',
    });
    expect(waitCalls).toEqual([deployTxHash]);
  });

  it('reports a mined deploy transaction when the LiquidTokenCreated event never appears', async () => {
    vi.useFakeTimers();
    try {
      const clients = createControlledClients({
        allowance: maxUint256,
        omitDeployLog: true,
      });
      const rare = createRareClient({ publicClient: clients.publicClient, walletClient: clients.walletClient });

      const deploy = rare.liquid.deployMultiCurve({
        name: 'Liquid Test',
        symbol: 'LIQ',
        tokenUri,
        curves: validCurves,
      });
      const deployError = deploy.catch((error: unknown) => error);

      await vi.advanceTimersByTimeAsync(3_000);
      const error = await deployError;
      expect(error).toBeInstanceOf(Error);
      if (!(error instanceof Error)) {
        throw new Error('Expected deploy to reject with an Error.');
      }
      expect(error.message).toContain(
        'Liquid token deploy transaction succeeded, but the deployed contract address could not be read',
      );
      expect(error.message).toContain(`Transaction hash: ${deployTxHash}. Block: 123.`);
      expect(clients.receiptCalls).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

function createControlledClients(opts: { allowance: bigint; omitDeployLog?: boolean }): {
  publicClient: PublicClient;
  walletClient: WalletClient;
  readCalls: ReadCall[];
  writeCalls: WriteCall[];
  waitCalls: Hash[];
  receiptCalls: number;
} {
  const readCalls: ReadCall[] = [];
  const writeCalls: WriteCall[] = [];
  const waitCalls: Hash[] = [];
  let receiptCalls = 0;

  const publicClient = {
    chain: sepolia,
    readContract: async (call: ReadCall) => {
      readCalls.push(call);
      switch (call.functionName) {
        case 'baseToken':
          return baseToken;
        case 'maxTotalSupply':
          return parseUnits('1000', 18);
        case 'creatorLaunchReward':
          return parseUnits('100', 18);
        case 'minRareLiquidityWei':
          return 0n;
        case 'lpTickLower':
          return -887_220;
        case 'lpTickUpper':
          return 887_220;
        case 'poolTickSpacing':
          return 60;
        case 'decimals':
          return 18;
        case 'allowance':
          return opts.allowance;
        default:
          throw new Error(`Unexpected readContract call: ${call.functionName}`);
      }
    },
    waitForTransactionReceipt: async ({ hash }: { hash: Hash }) => {
      waitCalls.push(hash);
      return hash === deployTxHash
        ? opts.omitDeployLog
          ? missingLogReceipt(hash)
          : liquidTokenCreatedReceipt({
              factory: liquidFactory,
              token: deployedToken,
              creator: account.address,
              tokenUri,
              txHash: hash,
            })
        : ({ status: 'success', blockNumber: 456n, logs: [], transactionHash: hash } as unknown as TransactionReceipt);
    },
    getTransactionReceipt: async ({ hash }: { hash: Hash }) => {
      receiptCalls += 1;
      return hash === deployTxHash
        ? missingLogReceipt(hash)
        : ({ status: 'success', blockNumber: 456n, logs: [], transactionHash: hash } as unknown as TransactionReceipt);
    },
  } as unknown as PublicClient;

  const walletClient = {
    account,
    writeContract: async (call: WriteCall) => {
      writeCalls.push(call);
      if (call.functionName === 'approve') {
        return approvalTxHash;
      }
      if (call.functionName === 'createLiquidTokenMultiCurve') {
        return deployTxHash;
      }
      throw new Error(`Unexpected writeContract call: ${call.functionName}`);
    },
  } as unknown as WalletClient;

  return {
    publicClient,
    walletClient,
    readCalls,
    writeCalls,
    waitCalls,
    get receiptCalls() {
      return receiptCalls;
    },
  };
}

function testHash(fill: string): Hash {
  const hash = `0x${fill.repeat(64)}`;
  if (!isHex(hash)) {
    throw new Error(`Invalid test hash fill: ${fill}`);
  }
  return hash;
}

function missingLogReceipt(hash: Hash): TransactionReceipt {
  return { status: 'success', blockNumber: 123n, logs: [], transactionHash: hash } as unknown as TransactionReceipt;
}

function liquidTokenCreatedReceipt(params: {
  factory: Address;
  token: Address;
  creator: Address;
  tokenUri: string;
  txHash: Hash;
}): TransactionReceipt {
  const topics = encodeEventTopics({
    abi: liquidFactoryAbi,
    eventName: 'LiquidTokenCreated',
    args: {
      token: params.token,
      creator: params.creator,
    },
  });

  return {
    status: 'success',
    blockNumber: 123n,
    transactionHash: params.txHash,
    logs: [
      {
        address: params.factory,
        topics,
        data: encodeAbiParameters([{ type: 'string' }], [params.tokenUri]),
      },
    ],
  } as unknown as TransactionReceipt;
}
