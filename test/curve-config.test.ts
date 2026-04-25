import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCurvePreview,
  generatePresetCurves,
  validateCurves,
  type LiquidCurveSegment,
} from '../src/liquid/curve-config.js';

const baseFactoryConfig = {
  baseToken: '0xba5BDe662c17e2aDFF1075610382B9B691296350' as const,
  curvePoolSupplyTokens: 900_000,
  maxTotalSupplyTokens: 1_000_000,
  creatorLaunchRewardTokens: 100_000,
  poolTickSpacing: 60,
};

test('generatePresetCurves matches medium-demand fixture', () => {
  const curves = generatePresetCurves('medium-demand', 1, baseFactoryConfig);

  assert.deepEqual(curves, [
    { tickLower: -16080, tickUpper: -9180, numPositions: 3, shares: '0.1' },
    { tickLower: -9180, tickUpper: 6960, numPositions: 2, shares: '0.65' },
    { tickLower: 6960, tickUpper: 29940, numPositions: 2, shares: '0.23' },
    { tickLower: 29940, tickUpper: 76020, numPositions: 1, shares: '0.02' },
  ]);
});

test('validateCurves rejects gaps between segments', () => {
  const curves: LiquidCurveSegment[] = [
    { tickLower: 0, tickUpper: 120, numPositions: 1, shares: '0.5' },
    { tickLower: 180, tickUpper: 300, numPositions: 1, shares: '0.5' },
  ];

  const result = validateCurves(curves, baseFactoryConfig);
  assert.equal(result.isValid, false);
  assert.match(result.errorMessage ?? '', /contiguous/i);
});

test('validateCurves rejects tick spacing mismatches', () => {
  const curves: LiquidCurveSegment[] = [{ tickLower: 0, tickUpper: 100, numPositions: 1, shares: '1' }];
  const result = validateCurves(curves, baseFactoryConfig);
  assert.equal(result.isValid, false);
  assert.match(result.errorMessage ?? '', /spacing 60/i);
});

test('validateCurves rejects share sums that do not add to 1', () => {
  const curves: LiquidCurveSegment[] = [
    { tickLower: 0, tickUpper: 120, numPositions: 1, shares: '0.4' },
    { tickLower: 120, tickUpper: 240, numPositions: 1, shares: '0.4' },
  ];

  const result = validateCurves(curves, baseFactoryConfig);
  assert.equal(result.isValid, false);
  assert.match(result.errorMessage ?? '', /add up to 1/i);
});

test('validateCurves rejects too many positions', () => {
  const curves: LiquidCurveSegment[] = Array.from({ length: 13 }, (_, index) => ({
    tickLower: index * 120,
    tickUpper: index * 120 + 120,
    numPositions: 2,
    shares: index === 12 ? '0.04' : '0.08',
  }));

  const result = validateCurves(curves, baseFactoryConfig);
  assert.equal(result.isValid, false);
  assert.match(result.errorMessage ?? '', /must not exceed 25/i);
});

test('validateCurves rejects spans that are too narrow for their positions', () => {
  const curves: LiquidCurveSegment[] = [{ tickLower: 0, tickUpper: 60, numPositions: 2, shares: '1' }];
  const result = validateCurves(curves, baseFactoryConfig);
  assert.equal(result.isValid, false);
  assert.match(result.errorMessage ?? '', /narrow/i);
});

test('buildCurvePreview includes usd ranges when a price is supplied', () => {
  const curves = generatePresetCurves('low-demand', 2, baseFactoryConfig);
  const preview = buildCurvePreview(curves, baseFactoryConfig, 2);

  assert.equal(preview.totalPositions, 6);
  assert.equal(preview.rarePriceUsd, 2);
  assert.ok(preview.segments[0]?.startTokenPriceUsd !== undefined);
  assert.ok(preview.segments[0]?.endTokenPriceUsd !== undefined);
});
