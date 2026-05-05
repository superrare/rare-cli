import { describe, expect, it } from 'vitest';
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
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

const baseToken = '0xba5BDe662c17e2aDFF1075610382B9B691296350' as const;
const liquidFactory = '0xfD18C0D99e5b6F89F3538806241C2C0d6FD728Ac' as const;
const deployedToken = '0xf100000000000000000000000000000000000001' as const;
const deployTxHash = `0x${'1'.repeat(64)}` as const;
const approvalTxHash = `0x${'2'.repeat(64)}` as const;
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
});

function createControlledClients(opts: { allowance: bigint }): {
  publicClient: PublicClient;
  walletClient: WalletClient;
  readCalls: ReadCall[];
  writeCalls: WriteCall[];
  waitCalls: Hash[];
} {
  const readCalls: ReadCall[] = [];
  const writeCalls: WriteCall[] = [];
  const waitCalls: Hash[] = [];

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
        ? liquidTokenCreatedReceipt({
            factory: liquidFactory,
            token: deployedToken,
            creator: account.address,
            tokenUri,
            txHash: hash,
          })
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

  return { publicClient, walletClient, readCalls, writeCalls, waitCalls };
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
