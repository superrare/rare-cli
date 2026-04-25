import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureHex,
  formatBuyRareQuoteLines,
  formatTokenTradeQuoteLines,
  isAffirmativeResponse,
  parseInputsJson,
  shouldPromptForConfirmation,
} from '../src/commands/swap-core.js';
import { formatCurvePreview, parseRarePriceUsdOverride, resolveCurveSourceMode } from '../src/commands/deploy-core.js';

test('resolveCurveSourceMode rejects omitted curves outside a TTY', () => {
  assert.throws(() => resolveCurveSourceMode({}, false), /interactive curve wizard/i);
});

test('resolveCurveSourceMode prefers files over presets', () => {
  assert.equal(resolveCurveSourceMode({ curvesFile: './curves.json', curvePreset: 'medium-demand' }, false), 'file');
});

test('parseRarePriceUsdOverride validates optional price override', () => {
  assert.equal(parseRarePriceUsdOverride(undefined), undefined);
  assert.equal(parseRarePriceUsdOverride('1.25'), 1.25);
  assert.throws(() => parseRarePriceUsdOverride('0'), /positive number/i);
});

test('formatCurvePreview prints source and segment details', () => {
  const lines = formatCurvePreview(
    {
      totalPositions: 3,
      totalShare: 1,
      curvePoolSupplyTokens: 900_000,
      maxTotalSupplyTokens: 1_000_000,
      creatorLaunchRewardTokens: 100_000,
      baseToken: '0xba5BDe662c17e2aDFF1075610382B9B691296350',
      rarePriceUsd: 1.5,
      segments: [
        {
          tickLower: -60,
          tickUpper: 60,
          numPositions: 1,
          shares: '1',
          startTokenPriceUsd: 1.1,
          endTokenPriceUsd: 1.9,
        },
      ],
    },
    'preset:medium-demand',
  );

  assert.ok(lines.some((line) => line.includes('preset:medium-demand')));
  assert.ok(lines.some((line) => line.includes('ticks -60 -> 60')));
});

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
      tokenIn: '0x0000000000000000000000000000000000000000',
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

test('isAffirmativeResponse accepts y and yes', () => {
  assert.equal(isAffirmativeResponse('y'), true);
  assert.equal(isAffirmativeResponse('YES'), true);
  assert.equal(isAffirmativeResponse(' n '), false);
  assert.equal(isAffirmativeResponse(''), false);
});

test('shouldPromptForConfirmation only prompts in interactive mode', () => {
  assert.equal(shouldPromptForConfirmation({}, true, false), true);
  assert.equal(shouldPromptForConfirmation({ yes: true }, true, false), false);
  assert.equal(shouldPromptForConfirmation({ quoteOnly: true }, true, false), false);
  assert.equal(shouldPromptForConfirmation({}, false, false), false);
  assert.equal(shouldPromptForConfirmation({}, true, true), false);
});
