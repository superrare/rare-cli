import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPublicClient,
  erc20Abi,
  formatEther,
  formatUnits,
  http,
  isAddress,
  isHex,
  parseUnits,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { ETH_ADDRESS, resolveCurrency } from '../../src/contracts/addresses.js';
import { parseJsonStdout, runCli } from '../helpers/cli.js';
import { loadDotEnv, missingLiveEnv } from './env.mjs';

loadDotEnv();

const missingEnv = missingLiveEnv();
const describeLive = missingEnv.length === 0 ? describe.sequential : describe.skip;
const E2E_TOKEN_URI = 'ipfs://bafybeidznwopf6bnfakqbertnhohgh65usqlo7bhnehycurg4xmc5ebnm4/metadata.json';
const rareAddress = resolveCurrency('rare', 'sepolia');

type TxResult = {
  txHash: string;
  blockNumber: string;
};

type DeployLiquidResult = TxResult & {
  contract: string;
  chainId: number;
  liquidEditionUrl: string;
  tokenUri: string;
  source: string;
  curves: Array<{
    tickLower: number;
    tickUpper: number;
    numPositions: number;
    shares: string;
  }>;
};

type TokenTradeQuoteJson = {
  token: Address;
  execution: string;
  routeSource: string;
  estimatedAmountOut: string;
  minAmountOut: string;
  commands: `0x${string}` | null;
  inputs: `0x${string}`[] | null;
};

type TokenTradeResult = TxResult & {
  execution: string;
  routeSource: string;
  estimatedAmountOut: string;
  minAmountOut: string;
  approvalTxHash?: string | null;
  commands?: `0x${string}`[] | `0x${string}` | null;
  inputs?: `0x${string}`[] | null;
};

type BuyRareResult = TxResult & {
  estimatedRareOut: string;
  minRareOut: string;
  commands: `0x${string}`;
  inputs: `0x${string}`[];
};

type LiveState = {
  home: string;
  tempDir: string;
  curvesFile: string;
  accountAddress: Address;
};

let live: LiveState;

describeLive('live Sepolia Liquid Editions and swap CLI write commands', () => {
  beforeAll(async () => {
    const home = await createTempHome();
    const tempDir = await mkdtemp(join(tmpdir(), 'rare-cli-live-liquid-swap-'));
    const curvesFile = join(tempDir, 'liquid-curves.json');

    try {
      await writeFile(
        curvesFile,
        JSON.stringify([
          {
            tickLower: -60_000,
            tickUpper: 60_000,
            numPositions: 1,
            shares: '1',
          },
        ], null, 2),
        'utf8',
      );
      await step('configure liquid/swap wallet', () => configureLiveHome(home, livePrivateKey('E2E_SELLER_PRIVATE_KEY')));

      live = {
        home,
        tempDir,
        curvesFile,
        accountAddress: privateKeyToAccount(livePrivateKey('E2E_SELLER_PRIVATE_KEY')).address,
      };
    } catch (error) {
      await cleanupTempHome(home);
      await cleanupTempHome(tempDir);
      throw error;
    }
  });

  afterAll(async () => {
    await cleanupTempHome(live?.home);
    await cleanupTempHome(live?.tempDir);
  });

  it('deploys a Liquid Editions token from an explicit curves file', async () => {
    const suffix = Date.now().toString(36).slice(-6).toUpperCase();
    const deployed = await step('deploy liquid token', () =>
      jsonCommand<DeployLiquidResult>([
        'deploy',
        'liquid-token',
        `Rare CLI Liquid E2E ${suffix}`,
        `LQE${suffix}`,
        '--curves-file',
        live.curvesFile,
        '--token-uri',
        E2E_TOKEN_URI,
        '--yes',
        '--chain',
        'sepolia',
      ], 300_000),
    );

    expectTx(deployed);
    expect(isAddress(deployed.contract)).toBe(true);
    expect(deployed.chainId).toBe(11_155_111);
    expect(deployed.tokenUri).toBe(E2E_TOKEN_URI);
    expect(deployed.source).toBe(`file:${live.curvesFile}`);
    expect(deployed.liquidEditionUrl).toBe(`https://superrare.com/liquid-editions/11155111/${deployed.contract}`);
    expect(deployed.curves).toEqual([
      {
        tickLower: -60_000,
        tickUpper: 60_000,
        numPositions: 1,
        shares: '1',
      },
    ]);
  });

  it('buys RARE through the curated swap command', async () => {
    const result = await step('buy RARE', () =>
      jsonCommand<BuyRareResult>([
        'swap',
        'buy-rare',
        '--eth',
        liveSwapEthAmount(),
        '--yes',
        '--chain',
        'sepolia',
      ], 240_000),
    );

    expectTx(result);
    expect(BigInt(result.estimatedRareOut)).toBeGreaterThan(0n);
    expect(BigInt(result.minRareOut)).toBeGreaterThan(0n);
    expect(result.commands).toMatch(/^0x/);
    expect(result.inputs.length).toBeGreaterThan(0);
  });

  it('buys and sells RARE through token swap commands', async () => {
    const buy = await step('buy RARE via buy-token', () =>
      jsonCommand<TokenTradeResult>([
        'swap',
        'buy-token',
        '--token',
        rareAddress,
        '--eth',
        liveSwapEthAmount(),
        '--yes',
        '--chain',
        'sepolia',
      ], 240_000),
    );

    expectTx(buy);
    expect(buy.execution).toBe('liquid-router');
    expect(buy.routeSource).toBe('known-pool');
    expect(BigInt(buy.estimatedAmountOut)).toBeGreaterThan(0n);
    expect(BigInt(buy.minAmountOut)).toBeGreaterThan(0n);

    await expectRareBalanceAtLeast(liveSwapRareSellAmount());

    const sell = await step('sell RARE via sell-token', () =>
      jsonCommand<TokenTradeResult>([
        'swap',
        'sell-token',
        '--token',
        rareAddress,
        '--amount',
        liveSwapRareSellAmount(),
        '--yes',
        '--chain',
        'sepolia',
      ], 240_000),
    );

    expectTx(sell);
    expect(sell.execution).toBe('liquid-router');
    expect(sell.routeSource).toBe('known-pool');
    expect(BigInt(sell.estimatedAmountOut)).toBeGreaterThan(0n);
    expect(BigInt(sell.minAmountOut)).toBeGreaterThan(0n);
  });

  it('executes raw router buy, swap, and sell commands using quoted calldata', async () => {
    const buyQuote = await quoteBuyRareToken();
    const buyInputsFile = await writeInputsFile('raw-buy-inputs.json', buyQuote.inputs);

    const rawBuy = await step('raw router buy RARE', () =>
      jsonCommand<TxResult>([
        'swap',
        'buy',
        '--token',
        rareAddress,
        '--eth',
        liveSwapEthAmount(),
        '--min-out',
        formatUnits(BigInt(buyQuote.minAmountOut), 18),
        '--commands',
        requireRouterCommands(buyQuote, 'buy quote'),
        '--inputs-file',
        buyInputsFile,
        '--chain',
        'sepolia',
      ], 240_000),
    );
    expectTx(rawBuy);

    const swapQuote = await quoteBuyRareToken();
    const swapInputsFile = await writeInputsFile('raw-swap-inputs.json', swapQuote.inputs);
    const rawSwap = await step('raw router ETH to RARE swap', () =>
      jsonCommand<TxResult>([
        'swap',
        'swap',
        '--token-in',
        ETH_ADDRESS,
        '--amount-in',
        liveSwapEthAmount(),
        '--token-out',
        rareAddress,
        '--min-out',
        formatUnits(BigInt(swapQuote.minAmountOut), 18),
        '--commands',
        requireRouterCommands(swapQuote, 'swap quote'),
        '--inputs-file',
        swapInputsFile,
        '--chain',
        'sepolia',
      ], 240_000),
    );
    expectTx(rawSwap);

    await expectRareBalanceAtLeast(liveSwapRareSellAmount());

    const sellQuote = await step('quote raw router sell', () =>
      jsonCommand<TokenTradeQuoteJson>([
        'swap',
        'sell-token',
        '--token',
        rareAddress,
        '--amount',
        liveSwapRareSellAmount(),
        '--quote-only',
        '--chain',
        'sepolia',
      ], 180_000),
    );
    expectLocalQuote(sellQuote);
    const sellInputsFile = await writeInputsFile('raw-sell-inputs.json', sellQuote.inputs);
    const rawSell = await step('raw router sell RARE', () =>
      jsonCommand<TxResult>([
        'swap',
        'sell',
        '--token',
        rareAddress,
        '--amount',
        liveSwapRareSellAmount(),
        '--min-out',
        formatEther(BigInt(sellQuote.minAmountOut)),
        '--commands',
        requireRouterCommands(sellQuote, 'sell quote'),
        '--inputs-file',
        sellInputsFile,
        '--chain',
        'sepolia',
      ], 240_000),
    );
    expectTx(rawSell);
  });
});

async function quoteBuyRareToken(): Promise<TokenTradeQuoteJson> {
  const quote = await step('quote RARE buy route', () =>
    jsonCommand<TokenTradeQuoteJson>([
      'swap',
      'buy-token',
      '--token',
      rareAddress,
      '--eth',
      liveSwapEthAmount(),
      '--quote-only',
      '--chain',
      'sepolia',
    ], 180_000),
  );
  expectLocalQuote(quote);
  return quote;
}

function expectLocalQuote(quote: TokenTradeQuoteJson): void {
  expect(quote.execution).toBe('liquid-router');
  expect(quote.routeSource).toBe('known-pool');
  expect(BigInt(quote.estimatedAmountOut)).toBeGreaterThan(0n);
  expect(BigInt(quote.minAmountOut)).toBeGreaterThan(0n);
  expect(quote.commands).toMatch(/^0x/);
  expect(quote.inputs).toEqual(expect.arrayContaining([expect.stringMatching(/^0x/)]));
}

function requireRouterCommands(quote: TokenTradeQuoteJson, label: string): `0x${string}` {
  if (!quote.commands) {
    throw new Error(`Expected ${label} to include router commands.`);
  }
  return quote.commands;
}

async function writeInputsFile(name: string, inputs: `0x${string}`[] | null): Promise<string> {
  if (!inputs) {
    throw new Error('Expected quote to include router inputs.');
  }

  const path = join(live.tempDir, name);
  await writeFile(path, JSON.stringify(inputs, null, 2), 'utf8');
  return path;
}

async function configureLiveHome(home: string, privateKey: string): Promise<void> {
  const result = await runCli([
    'configure',
    '--default-chain',
    'sepolia',
    '--chain',
    'sepolia',
    '--private-key',
    privateKey,
    '--rpc-url',
    liveRpcUrl(),
  ], { home });

  expect(result.code).toBe(0);
  expect(result.stderr).toBe('');
}

async function expectRareBalanceAtLeast(amount: string): Promise<void> {
  const balance = await createLivePublicClient().readContract({
    address: rareAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [live.accountAddress],
  });
  const required = parseUnits(amount, 18);
  if (balance < required) {
    throw new Error(`E2E wallet has insufficient Sepolia RARE. Required ${required}, found ${balance}.`);
  }
}

async function jsonCommand<T>(args: string[], timeoutMs = 180_000): Promise<T> {
  return parseJsonStdout<T>(await runCli(['--json', ...args], { home: live.home, timeoutMs }));
}

function expectTx(result: TxResult): void {
  expect(result.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  expect(result.blockNumber).toMatch(/^\d+$/);
}

function createLivePublicClient() {
  return createPublicClient({
    chain: sepolia,
    transport: http(liveRpcUrl()),
  });
}

function livePrivateKey(name: 'E2E_SELLER_PRIVATE_KEY' | 'E2E_BUYER_PRIVATE_KEY'): `0x${string}` {
  const value = process.env[name];
  if (!value || !isHex(value)) {
    throw new Error(`${name} must be set to a 0x-prefixed private key.`);
  }
  return value;
}

function liveRpcUrl(): string {
  const value = process.env.TEST_RPC_URL;
  if (!value) {
    throw new Error('TEST_RPC_URL must be set.');
  }
  return value;
}

function liveSwapEthAmount(): string {
  return process.env.E2E_SWAP_ETH_AMOUNT ?? '0.001';
}

function liveSwapRareSellAmount(): string {
  return process.env.E2E_SWAP_RARE_SELL_AMOUNT ?? '1';
}

async function createTempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'rare-cli-live-liquid-home-'));
}

async function cleanupTempHome(home: string | undefined): Promise<void> {
  if (!home) return;
  await rm(home, { recursive: true, force: true });
}

async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  console.error(`[live e2e] ${label}`);
  return fn();
}
