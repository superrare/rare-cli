import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAddress,
  isHex,
  maxUint256,
  parseEther,
  parseUnits,
  type Address,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { ETH_ADDRESS, resolveCurrency } from '../../../src/contracts/addresses.js';
import { createRareClient } from '../../../src/sdk/client.js';

type ReadCall = {
  address: Address;
  functionName: string;
  args?: readonly unknown[];
};

type SimulateCall = {
  address: Address;
  functionName: string;
  args?: readonly unknown[];
};

type WriteCall = {
  address: Address;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

type SendCall = {
  to?: Address;
  data?: `0x${string}`;
  value?: bigint;
};

const liquidToken = getAddress('0xf100000000000000000000000000000000000001');
const fallbackToken = getAddress('0xf200000000000000000000000000000000000002');
const hooks = getAddress('0x1111111111111111111111111111111111111111');
const router = getAddress('0x429c3Ee66E7f6CDA12C5BadE4104aF3277aA2305');
const rare = resolveCurrency('rare', 'sepolia');
const account = privateKeyToAccount(
  '0x0000000000000000000000000000000000000000000000000000000000000001',
);
const recipient = getAddress('0x9999999999999999999999999999999999999999');
const approvalTxHash = testHash('a');
const writeTxHash = testHash('b');
const preparedTxHash = testHash('c');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Swap SDK integration with controlled clients', () => {
  it('quotes and executes a local liquid-token buy route', async () => {
    const { publicClient, walletClient, simulateCalls, writeCalls, waitCalls } = createSwapClients({
      quoteOutputs: [2_000n, 1_500n, 2_000n, 1_500n],
    });
    const rareClient = createRareClient({ publicClient, walletClient });

    const quote = await rareClient.swap.quoteBuyToken({
      token: liquidToken,
      ethAmount: '1',
      slippageBps: 100,
    });

    expect(quote).toMatchObject({
      routeSource: 'liquid-edition',
      execution: 'liquid-router',
      amountIn: parseEther('1'),
      estimatedAmountOut: 1_500n,
      minAmountOut: 1_485n,
      inputDecimals: 18,
      outputDecimals: 18,
    });
    expect(quote.execution).toBe('liquid-router');
    if (quote.execution !== 'liquid-router') {
      throw new Error('Expected local liquid-router quote.');
    }
    expect(quote.commands).toMatch(/^0x/);
    expect(quote.inputs.length).toBe(1);
    expect(simulateCalls).toHaveLength(2);

    const result = await rareClient.swap.buyToken({
      token: liquidToken,
      ethAmount: '1',
      minTokensOut: '0.0000000000000014',
      recipient,
      deadline: 1_714_500_000,
    });

    expect(result).toMatchObject({
      txHash: writeTxHash,
      routeSource: 'liquid-edition',
      execution: 'liquid-router',
      minAmountOut: 1_400n,
      estimatedAmountOut: 1_500n,
    });
    expect(writeCalls.at(-1)).toMatchObject({
      address: router,
      functionName: 'buy',
      value: parseEther('1'),
    });
    expect(writeCalls.at(-1)?.args?.slice(0, 3)).toEqual([liquidToken, recipient, 1_400n]);
    expect(waitCalls).toContain(writeTxHash);
  });

  it('quotes and executes a local liquid-token sell route with ERC20 approval', async () => {
    const { publicClient, walletClient, writeCalls, waitCalls } = createSwapClients({
      quoteOutputs: [2_000n, 1_700n, 2_000n, 1_700n],
      allowance: 0n,
    });
    const rareClient = createRareClient({ publicClient, walletClient });

    const quote = await rareClient.swap.quoteSellToken({
      token: liquidToken,
      tokenAmount: '2',
      slippageBps: 50,
    });

    expect(quote).toMatchObject({
      routeSource: 'liquid-edition',
      execution: 'liquid-router',
      amountIn: parseUnits('2', 18),
      estimatedAmountOut: 1_700n,
      minAmountOut: 1_691n,
    });

    const result = await rareClient.swap.sellToken({
      token: liquidToken,
      tokenAmount: '2',
      minEthOut: '0.0000000000000016',
      deadline: 1_714_500_000,
    });

    expect(result).toMatchObject({
      txHash: writeTxHash,
      routeSource: 'liquid-edition',
      execution: 'liquid-router',
      minAmountOut: 1_600n,
      estimatedAmountOut: 1_700n,
    });
    expect(writeCalls[0]).toMatchObject({
      address: liquidToken,
      functionName: 'approve',
      args: [router, maxUint256],
    });
    expect(writeCalls.at(-1)).toMatchObject({
      address: router,
      functionName: 'sell',
    });
    expect(writeCalls.at(-1)?.args?.slice(0, 4)).toEqual([liquidToken, parseUnits('2', 18), account.address, 1_600n]);
    expect(waitCalls).toEqual([approvalTxHash, writeTxHash]);
  });

  it('quotes and executes buyRare through the canonical RARE pool', async () => {
    const { publicClient, walletClient, writeCalls } = createSwapClients({
      quoteOutputs: [12_500n, 12_500n],
    });
    const rareClient = createRareClient({ publicClient, walletClient });

    const quote = await rareClient.swap.quoteBuyRare({
      ethAmount: '0.5',
      slippageBps: 100,
    });

    expect(quote).toMatchObject({
      ethAmount: parseEther('0.5'),
      rareAddress: rare,
      estimatedRareOut: 12_500n,
      minRareOut: 12_375n,
      slippageBps: 100,
    });

    const result = await rareClient.swap.buyRare({
      ethAmount: '0.5',
      minRareOut: '0.000000000000012',
      recipient,
      deadline: 1_714_500_000,
    });

    expect(result).toMatchObject({
      txHash: writeTxHash,
      estimatedRareOut: 12_500n,
      minRareOut: 12_000n,
    });
    expect(writeCalls.at(-1)).toMatchObject({
      address: router,
      functionName: 'buy',
      value: parseEther('0.5'),
    });
    expect(writeCalls.at(-1)?.args?.slice(0, 3)).toEqual([rare, recipient, 12_000n]);
  });

  it('uses the Uniswap fallback for unsupported buyToken routes and sends the prepared swap transaction', async () => {
    vi.stubEnv('UNISWAP_API_KEY', 'test-api-key');
    const fetchMock = stubUniswapFetch([
      uniswapJsonResponse(uniswapQuoteResponse({
        tokenIn: ETH_ADDRESS,
        tokenOut: fallbackToken,
        amountIn: parseEther('1'),
        amountOut: 4_000n,
        minAmountOut: 3_960n,
      })),
      uniswapJsonResponse({
        requestId: 'swap-request',
        swap: preparedTransaction({
          to: '0x3000000000000000000000000000000000000003',
          value: parseEther('1').toString(),
        }),
      }),
    ]);
    const { publicClient, walletClient, sendCalls } = createSwapClients({
      quoteOutputs: [],
    });
    const rareClient = createRareClient({ publicClient, walletClient });

    const result = await rareClient.swap.buyToken({
      token: fallbackToken,
      ethAmount: '1',
      slippageBps: 100,
      deadline: 1_714_500_000,
    });

    expect(result).toMatchObject({
      txHash: preparedTxHash,
      routeSource: 'uniswap-api',
      execution: 'uniswap-api',
      estimatedAmountOut: 4_000n,
      minAmountOut: 3_960n,
    });
    expect(sendCalls).toEqual([
      expect.objectContaining({
        to: '0x3000000000000000000000000000000000000003',
        value: parseEther('1'),
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchBody(fetchMock, 0)).toMatchObject({
      amount: parseEther('1').toString(),
      tokenIn: ETH_ADDRESS,
      tokenOut: fallbackToken,
      slippageTolerance: 1,
    });
    expect(fetchBody(fetchMock, 1)).toMatchObject({
      deadline: 1_714_500_000,
      refreshGasPrice: true,
      safetyMode: 'SAFE',
    });
  });

  it('uses the Uniswap fallback approval, reset, and swap flow for unsupported sellToken routes', async () => {
    vi.stubEnv('UNISWAP_API_KEY', 'test-api-key');
    const resetTx = preparedTransaction({ to: '0x4000000000000000000000000000000000000004', data: '0x04' });
    const approvalTx = preparedTransaction({ to: '0x5000000000000000000000000000000000000005', data: '0x05' });
    const swapTx = preparedTransaction({ to: '0x6000000000000000000000000000000000000006', data: '0x06' });
    const fetchMock = stubUniswapFetch([
      uniswapJsonResponse(uniswapQuoteResponse({
        tokenIn: fallbackToken,
        tokenOut: ETH_ADDRESS,
        amountIn: parseUnits('2', 18),
        amountOut: 8_000n,
        minAmountOut: 7_900n,
      })),
      uniswapJsonResponse({
        requestId: 'approval-request',
        cancel: resetTx,
        approval: approvalTx,
      }),
      uniswapJsonResponse({
        requestId: 'swap-request',
        swap: swapTx,
      }),
    ]);
    const { publicClient, walletClient, sendCalls } = createSwapClients({
      quoteOutputs: [],
    });
    const rareClient = createRareClient({ publicClient, walletClient });

    const result = await rareClient.swap.sellToken({
      token: fallbackToken,
      tokenAmount: '2',
      slippageBps: 100,
    });

    expect(result).toMatchObject({
      txHash: preparedTxHash,
      routeSource: 'uniswap-api',
      execution: 'uniswap-api',
      estimatedAmountOut: 8_000n,
      minAmountOut: 7_900n,
      approvalResetTxHash: preparedTxHash,
      approvalTxHash: preparedTxHash,
    });
    expect(sendCalls.map((call) => call.to)).toEqual([resetTx.to, approvalTx.to, swapTx.to]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchBody(fetchMock, 1)).toMatchObject({
      walletAddress: account.address,
      token: fallbackToken,
      amount: parseUnits('2', 18).toString(),
      tokenOut: ETH_ADDRESS,
    });
  });
});

function createSwapClients(opts: {
  quoteOutputs: bigint[];
  allowance?: bigint;
}): {
  publicClient: PublicClient;
  walletClient: WalletClient;
  readCalls: ReadCall[];
  simulateCalls: SimulateCall[];
  writeCalls: WriteCall[];
  sendCalls: SendCall[];
  waitCalls: Hash[];
} {
  const readCalls: ReadCall[] = [];
  const simulateCalls: SimulateCall[] = [];
  const writeCalls: WriteCall[] = [];
  const sendCalls: SendCall[] = [];
  const waitCalls: Hash[] = [];
  const quoteOutputs = [...opts.quoteOutputs];

  const publicClient = {
    chain: sepolia,
    readContract: async (call: ReadCall) => {
      readCalls.push(call);
      if (call.functionName === 'poolKey' && call.address === liquidToken) {
        const poolKey: readonly [Address, Address, number, number, Address] = [rare, liquidToken, 0, 60, hooks];
        return poolKey;
      }
      if (call.functionName === 'poolKey') {
        throw new Error('not a liquid token');
      }
      if (call.functionName === 'decimals') {
        return 18;
      }
      if (call.functionName === 'allowance') {
        return opts.allowance ?? maxUint256;
      }
      throw new Error(`Unexpected readContract call: ${call.functionName}`);
    },
    simulateContract: async (call: SimulateCall) => {
      simulateCalls.push(call);
      const amountOut = quoteOutputs.shift();
      if (amountOut === undefined) {
        throw new Error('Unexpected simulateContract call');
      }
      return { result: [amountOut, 21_000n] };
    },
    waitForTransactionReceipt: async ({ hash }: { hash: Hash }) => {
      waitCalls.push(hash);
      return { status: 'success', blockNumber: 123n, logs: [], transactionHash: hash } as unknown as TransactionReceipt;
    },
  } as unknown as PublicClient;

  const walletClient = {
    account,
    writeContract: async (call: WriteCall) => {
      writeCalls.push(call);
      return call.functionName === 'approve' ? approvalTxHash : writeTxHash;
    },
    sendTransaction: async (call: SendCall) => {
      sendCalls.push(call);
      return preparedTxHash;
    },
  } as unknown as WalletClient;

  return { publicClient, walletClient, readCalls, simulateCalls, writeCalls, sendCalls, waitCalls };
}

function stubUniswapFetch(responses: Response[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => {
    const response = responses.shift();
    if (!response) {
      throw new Error('Unexpected fetch call');
    }
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function uniswapJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
  });
}

function uniswapQuoteResponse(params: {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOut: bigint;
  minAmountOut: bigint;
}) {
  return {
    requestId: 'quote-request',
    routing: 'CLASSIC',
    permitData: null,
    quote: {
      chainId: 11_155_111,
      input: {
        amount: params.amountIn.toString(),
        token: params.tokenIn,
      },
      output: {
        amount: params.amountOut.toString(),
        token: params.tokenOut,
        recipient: account.address,
      },
      swapper: account.address,
      route: [],
      slippage: 1,
      tradeType: 'EXACT_INPUT',
      quoteId: 'quote-id',
      routeString: 'Uniswap fallback route',
      aggregatedOutputs: [
        {
          amount: params.amountOut.toString(),
          token: params.tokenOut,
          recipient: account.address,
          bps: 10_000,
          minAmount: params.minAmountOut.toString(),
        },
      ],
    },
  };
}

function preparedTransaction(params: {
  to: Address;
  data?: `0x${string}`;
  value?: string;
}) {
  return {
    to: params.to,
    from: account.address,
    data: params.data ?? '0x1234',
    value: params.value ?? '0',
    chainId: 11_155_111,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function testHash(fill: string): Hash {
  const hash = `0x${fill.repeat(64)}`;
  if (!isHex(hash)) {
    throw new Error(`Invalid test hash fill: ${fill}`);
  }
  return hash;
}

function fetchBody(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): Record<string, unknown> {
  const requestInit = fetchMock.mock.calls[callIndex]?.[1];
  if (!isRecord(requestInit)) {
    throw new Error(`Expected fetch call ${callIndex} to include a request init object.`);
  }

  expect(requestInit.body).toEqual(expect.any(String));
  if (typeof requestInit.body !== 'string') {
    throw new Error(`Expected fetch call ${callIndex} body to be a string.`);
  }

  const parsed: unknown = JSON.parse(requestInit.body);
  if (!isRecord(parsed)) {
    throw new Error(`Expected fetch call ${callIndex} body to be a JSON object.`);
  }
  return parsed;
}
