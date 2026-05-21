import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { ETH_ADDRESS } from '../../../src/contracts/addresses.js';
import { swapCommand } from '../../../src/commands/swap.js';
import type { TokenTradeQuote, TokenTradeResult } from '../../../src/sdk/swap.js';

const getPublicClient = vi.hoisted(() => vi.fn());
const getWalletClient = vi.hoisted(() => vi.fn());
const getConfiguredAccountAddress = vi.hoisted(() => vi.fn());
const getConfiguredUniswapApiKey = vi.hoisted(() => vi.fn());
const createRareClient = vi.hoisted(() => vi.fn());
const printError = vi.hoisted(() => vi.fn());

vi.mock('../../../src/client.js', () => ({
  getConfiguredAccountAddress,
  getPublicClient,
  getWalletClient,
  getConfiguredUniswapApiKey,
}));

vi.mock('../../../src/sdk/client.js', () => ({
  createRareClient,
}));

vi.mock('../../../src/errors.js', () => ({
  printError,
}));

const token = '0x197FaeF3f59eC80113e773Bb6206a17d183F97CB';
const publicClient = { kind: 'public-client' };
const quoteBuyToken = vi.fn();
const quoteSellToken = vi.fn();
const buyToken = vi.fn();
const sellToken = vi.fn();
const swapTokens = vi.fn();
let consoleLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  getPublicClient.mockReset();
  getWalletClient.mockReset();
  getConfiguredAccountAddress.mockReset();
  getConfiguredUniswapApiKey.mockReset();
  createRareClient.mockReset();
  printError.mockReset();
  quoteBuyToken.mockReset();
  quoteSellToken.mockReset();
  buyToken.mockReset();
  sellToken.mockReset();
  swapTokens.mockReset();

  getPublicClient.mockReturnValue(publicClient);
  getConfiguredAccountAddress.mockReturnValue('0x1234567890123456789012345678901234567890');
  getConfiguredUniswapApiKey.mockResolvedValue('test-uniswap-key');
  getWalletClient.mockImplementation(() => {
    throw new Error('quote-only token swap should not load a wallet');
  });
  createRareClient.mockReturnValue({
    contracts: { swapRouter: '0x429c3Ee66E7f6CDA12C5BadE4104aF3277aA2305' },
    swap: {
      quoteBuyToken,
      quoteSellToken,
      buyToken,
      sellToken,
      swapTokens,
    },
  });
  quoteBuyToken.mockResolvedValue(tokenQuote({ direction: 'buy' }));
  quoteSellToken.mockResolvedValue(tokenQuote({ direction: 'sell' }));
  buyToken.mockResolvedValue(tokenTradeResult());
  sellToken.mockResolvedValue(tokenTradeResult());
  swapTokens.mockResolvedValue({
    txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    receipt: { blockNumber: 123n },
  });
  consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleLog.mockRestore();
});

test('buy-token quote-only does not require a configured wallet', async () => {
  await swapCommand().parseAsync([
    'buy-token',
    '--token',
    token,
    '--amount-in',
    '0.001',
    '--quote-only',
    '--chain',
    'sepolia',
  ], { from: 'user' });

  assert.equal(getWalletClient.mock.calls.length, 0);
  assert.equal(printError.mock.calls.length, 0);
  const rareConfig = createRareClient.mock.calls[0]?.[0];
  assert.equal(rareConfig.publicClient, publicClient);
  assert.equal(rareConfig.account, '0x1234567890123456789012345678901234567890');
  assert.equal(typeof rareConfig.resolveUniswapApiKey, 'function');
  assert.equal(await rareConfig.resolveUniswapApiKey(), 'test-uniswap-key');
  assert.deepEqual(quoteBuyToken.mock.calls[0]?.[0], {
    token,
    amountIn: '0.001',
    minAmountOut: undefined,
    slippageBps: undefined,
    recipient: undefined,
    route: 'auto',
  });
});

test('sell-token quote-only does not require a configured wallet', async () => {
  await swapCommand().parseAsync([
    'sell-token',
    '--token',
    token,
    '--amount-in',
    '1',
    '--quote-only',
    '--chain',
    'sepolia',
  ], { from: 'user' });

  assert.equal(getWalletClient.mock.calls.length, 0);
  assert.equal(printError.mock.calls.length, 0);
  const rareConfig = createRareClient.mock.calls[0]?.[0];
  assert.equal(rareConfig.publicClient, publicClient);
  assert.equal(rareConfig.account, '0x1234567890123456789012345678901234567890');
  assert.equal(typeof rareConfig.resolveUniswapApiKey, 'function');
  assert.equal(await rareConfig.resolveUniswapApiKey(), 'test-uniswap-key');
  assert.deepEqual(quoteSellToken.mock.calls[0]?.[0], {
    token,
    amountIn: '1',
    minAmountOut: undefined,
    slippageBps: undefined,
    recipient: undefined,
    route: 'auto',
  });
});

test('buy-token raw route submits prebuilt router calldata through the consolidated command', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'rare-cli-swap-test-'));
  const inputsFile = join(tempDir, 'inputs.json');
  const walletClient = { kind: 'wallet-client' };
  getWalletClient.mockReturnValue({ client: walletClient });

  try {
    await writeFile(inputsFile, JSON.stringify(['0x1234']), 'utf8');

    await swapCommand().parseAsync([
      'buy-token',
      '--token',
      token,
      '--amount-in',
      '0.001',
      '--route',
      'raw',
      '--min-amount-out',
      '1',
      '--commands',
      '0x10',
      '--inputs-file',
      inputsFile,
      '--yes',
      '--chain',
      'sepolia',
    ], { from: 'user' });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  assert.equal(printError.mock.calls.length, 0);
  assert.deepEqual(createRareClient.mock.calls[0]?.[0], { publicClient, walletClient });
  assert.equal(quoteBuyToken.mock.calls.length, 0);
  assert.deepEqual(buyToken.mock.calls[0]?.[0], {
    route: 'raw',
    token,
    amountIn: '0.001',
    minAmountOut: '1',
    commands: '0x10',
    inputs: ['0x1234'],
    recipient: undefined,
    deadline: undefined,
  });
});

test('raw token swap supports the legacy swap alias', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'rare-cli-swap-test-'));
  const inputsFile = join(tempDir, 'inputs.json');
  const walletClient = { kind: 'wallet-client' };
  getWalletClient.mockReturnValue({ client: walletClient });

  try {
    await writeFile(inputsFile, JSON.stringify(['0x1234']), 'utf8');

    await swapCommand().parseAsync([
      'swap',
      '--token-in',
      ETH_ADDRESS,
      '--amount-in',
      '0.001',
      '--token-out',
      token,
      '--min-amount-out',
      '1',
      '--commands',
      '0x10',
      '--inputs-file',
      inputsFile,
      '--yes',
      '--chain',
      'sepolia',
    ], { from: 'user' });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  assert.equal(printError.mock.calls.length, 0);
  assert.deepEqual(createRareClient.mock.calls[0]?.[0], { publicClient, walletClient });
  assert.deepEqual(swapTokens.mock.calls[0]?.[0], {
    tokenIn: ETH_ADDRESS,
    amountIn: '0.001',
    tokenOut: token,
    minAmountOut: '1',
    commands: '0x10',
    inputs: ['0x1234'],
    recipient: undefined,
    deadline: undefined,
  });
});

test('raw token swap requires confirmation before loading a wallet', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'rare-cli-swap-test-'));
  const inputsFile = join(tempDir, 'inputs.json');
  const originalArgv = [...process.argv];
  // eslint-disable-next-line functional/immutable-data
  process.argv.push('--json');

  try {
    await writeFile(inputsFile, JSON.stringify(['0x1234']), 'utf8');

    await swapCommand().parseAsync([
      'tokens',
      '--token-in',
      ETH_ADDRESS,
      '--amount-in',
      '0.001',
      '--token-out',
      token,
      '--min-amount-out',
      '1',
      '--commands',
      '0x10',
      '--inputs-file',
      inputsFile,
      '--chain',
      'sepolia',
    ], { from: 'user' });
  } finally {
    // eslint-disable-next-line functional/immutable-data
    process.argv.splice(0, process.argv.length, ...originalArgv);
    await rm(tempDir, { recursive: true, force: true });
  }

  const error = printError.mock.calls[0]?.[0];
  assert.ok(error instanceof Error);
  assert.match(error.message, /rare swap tokens requires --yes when submitting a quoted swap/);
  assert.equal(getWalletClient.mock.calls.length, 0);
  assert.equal(getPublicClient.mock.calls.length, 0);
  assert.equal(createRareClient.mock.calls.length, 0);
  assert.equal(swapTokens.mock.calls.length, 0);
});

function tokenQuote(params: { direction: 'buy' | 'sell' }): TokenTradeQuote {
  return {
    amountIn: 1n,
    estimatedAmountOut: 2n,
    minAmountOut: 1n,
    tokenIn: params.direction === 'buy' ? ETH_ADDRESS : token,
    tokenOut: params.direction === 'buy' ? token : ETH_ADDRESS,
    inputDecimals: 18,
    outputDecimals: 18,
    slippageBps: 50,
    routeSource: 'known-pool',
    execution: 'liquid-router',
    routeDescription: params.direction === 'buy' ? 'ETH->TOKEN' : 'TOKEN->ETH',
    commands: '0x10',
    inputs: ['0x1234'],
  };
}

function tokenTradeResult(): Omit<TokenTradeResult, 'receipt'> & { receipt: { blockNumber: bigint } } {
  return {
    txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    receipt: { blockNumber: 123n },
    estimatedAmountOut: 2n,
    minAmountOut: 1n,
    routeSource: 'raw',
    execution: 'raw-router',
    commands: '0x10',
    inputs: ['0x1234'],
  };
}
