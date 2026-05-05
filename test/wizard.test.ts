import { test } from 'vitest';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { runLiquidCurveWizard, type LiquidCurveWizardResult } from '../src/liquid/wizard.js';

function discardOutput(): Writable {
  return new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
}

function makeWizardResult(preset: LiquidCurveWizardResult['preset']): LiquidCurveWizardResult {
  return {
    preset,
    rarePriceUsd: 1.25,
    curves: [{ tickLower: -60, tickUpper: 60, numPositions: 1, shares: '1' }],
    preview: {
      totalPositions: 1,
      totalShare: 1,
      curvePoolSupplyTokens: '900000',
      maxTotalSupplyTokens: '1000000',
      creatorLaunchRewardTokens: '100000',
      baseToken: '0xba5BDe662c17e2aDFF1075610382B9B691296350',
      rarePriceUsd: 1.25,
      segments: [
        {
          tickLower: -60,
          tickUpper: 60,
          numPositions: 1,
          shares: '1',
          startTokenPriceUsd: 1,
          endTokenPriceUsd: 2,
        },
      ],
    },
  };
}

test('runLiquidCurveWizard skips final confirmation when requested', async () => {
  const originalLog = console.log;
  console.log = () => {};

  try {
    const result = await runLiquidCurveWizard({
      stdin: PassThrough.from(['2\n']),
      stdout: discardOutput(),
      skipConfirmation: true,
      generatePresetCurves: async (preset) => makeWizardResult(preset),
    });

    assert.equal(result.preset, 'medium-demand');
  } finally {
    console.log = originalLog;
  }
});

test('runLiquidCurveWizard rejects when curve confirmation is declined', async () => {
  const originalLog = console.log;
  console.log = () => {};
  const stdin = new PassThrough();

  try {
    const result = runLiquidCurveWizard({
      stdin,
      stdout: discardOutput(),
      generatePresetCurves: async (preset) => makeWizardResult(preset),
    });

    stdin.write('low-demand\n');
    setImmediate(() => {
      stdin.write('no\n');
      stdin.end();
    });

    await assert.rejects(result, /Curve generation cancelled/i);
  } finally {
    stdin.destroy();
    console.log = originalLog;
  }
});
