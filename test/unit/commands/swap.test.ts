import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { ETH_ADDRESS } from '../../../src/contracts/addresses.js';
import { swapCommand } from '../../../src/commands/swap.js';
import type { TokenTradeQuote } from '../../../src/sdk/swap.js';

const getPublicClient = vi.hoisted(() => vi.fn());
const getWalletClient = vi.hoisted(() => vi.fn());
const createRareClient = vi.hoisted(() => vi.fn());
const printError = vi.hoisted(() => vi.fn());

vi.mock('../../../src/client.js', () => ({
  getPublicClient,
  getWalletClient,
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
let consoleLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  getPublicClient.mockReset();
  getWalletClient.mockReset();
  createRareClient.mockReset();
  printError.mockReset();
  quoteBuyToken.mockReset();
  quoteSellToken.mockReset();

  getPublicClient.mockReturnValue(publicClient);
  getWalletClient.mockImplementation(() => {
    throw new Error('quote-only token swap should not load a wallet');
  });
  createRareClient.mockReturnValue({
    contracts: { swapRouter: '0x429c3Ee66E7f6CDA12C5BadE4104aF3277aA2305' },
    swap: {
      quoteBuyToken,
      quoteSellToken,
    },
  });
  quoteBuyToken.mockResolvedValue(tokenQuote({ direction: 'buy' }));
  quoteSellToken.mockResolvedValue(tokenQuote({ direction: 'sell' }));
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
  assert.deepEqual(createRareClient.mock.calls[0]?.[0], { publicClient });
  assert.deepEqual(quoteBuyToken.mock.calls[0]?.[0], {
    token,
    amountIn: '0.001',
    minAmountOut: undefined,
    slippageBps: undefined,
    recipient: undefined,
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
  assert.deepEqual(createRareClient.mock.calls[0]?.[0], { publicClient });
  assert.deepEqual(quoteSellToken.mock.calls[0]?.[0], {
    token,
    amountIn: '1',
    minAmountOut: undefined,
    slippageBps: undefined,
    recipient: undefined,
  });
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
