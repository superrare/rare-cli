import { test } from 'vitest';
import assert from 'node:assert/strict';
import { ETH_ADDRESS } from '../../../src/contracts/addresses.js';
import {
  ensureHex,
  formatBuyRareQuoteLines,
  formatTokenTradeQuoteLines,
  parseInputsJson,
} from '../../../src/commands/swap-core.js';

test('parseInputsJson accepts a JSON array of hex strings', () => {
  const inputs = parseInputsJson('["0x1234","0xabcd"]', 'test-inputs.json');
  assert.deepEqual(inputs, ['0x1234', '0xabcd']);
});

test('parseInputsJson rejects invalid payloads', () => {
  assert.throws(() => parseInputsJson('{"inputs":["0x1234"]}', 'bad.json'), /JSON array of hex strings/i);
});

test('ensureHex validates commands', () => {
  assert.equal(ensureHex('0x10', 'commands'), '0x10');
  assert.throws(() => ensureHex('nope', 'commands'), /hex string/i);
});

test('formatBuyRareQuoteLines prints quote details', () => {
  const lines = formatBuyRareQuoteLines({
    chain: 'sepolia',
    router: '0x429c3Ee66E7f6CDA12C5BadE4104aF3277aA2305',
    eth: '0.01',
    recipient: '0x1234567890123456789012345678901234567890',
    usedMinRareOutOverride: false,
    quote: {
      ethAmount: 10_000_000_000_000_000n,
      rareAddress: '0x197FaeF3f59eC80113e773Bb6206a17d183F97CB',
      estimatedRareOut: 125_000_000_000_000_000_000n,
      minRareOut: 124_375_000_000_000_000_000n,
      slippageBps: 50,
      commands: '0x10',
      inputs: ['0x1234'],
    },
  });

  assert.ok(lines.some((line) => line.includes('Quote for buying RARE on sepolia')));
  assert.ok(lines.some((line) => line.includes('Estimated RARE out: 125')));
  assert.ok(lines.some((line) => line.includes('Slippage: 50 bps')));
  assert.ok(lines.some((line) => line.includes('Recipient: 0x1234567890123456789012345678901234567890')));
});

test('formatTokenTradeQuoteLines prints execution and route source details', () => {
  const lines = formatTokenTradeQuoteLines({
    chain: 'sepolia',
    direction: 'buy',
    token: '0xf100000000000000000000000000000000000001',
    amountLabel: 'ETH in',
    amountIn: '0.01',
    recipient: '0x1234567890123456789012345678901234567890',
    usedMinOutOverride: false,
    quote: {
      amountIn: 10_000_000_000_000_000n,
      estimatedAmountOut: 125_000_000_000_000_000_000n,
      minAmountOut: 124_375_000_000_000_000_000n,
      tokenIn: ETH_ADDRESS,
      tokenOut: '0xf100000000000000000000000000000000000001',
      inputDecimals: 18,
      outputDecimals: 18,
      slippageBps: 50,
      routeSource: 'liquid-edition',
      execution: 'liquid-router',
      routeDescription: '0x0->0xf1',
      commands: '0x10',
      inputs: ['0x1234'],
    },
  });

  assert.ok(lines.some((line) => line.includes('Quote for buying 0xf100000000000000000000000000000000000001 on sepolia')));
  assert.ok(lines.some((line) => line.includes('Route source: liquid-edition')));
  assert.ok(lines.some((line) => line.includes('Execution: liquid-router')));
  assert.ok(lines.some((line) => line.includes('Estimated token out: 125')));
});
