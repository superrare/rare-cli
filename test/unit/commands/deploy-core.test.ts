import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  formatCurvePreview,
  getLiquidEditionDeployConfirmationDecision,
  resolveCurveSourceMode,
  validateLiquidEditionDeployMetadataOptions,
} from '../../../src/commands/deploy-core.js';

test('resolveCurveSourceMode rejects omitted curves outside a TTY', () => {
  assert.throws(() => resolveCurveSourceMode({}, false), /interactive curve wizard/i);
});

test('resolveCurveSourceMode prefers files over presets', () => {
  assert.equal(resolveCurveSourceMode({ curvesFile: './curves.json', curvePreset: 'medium-demand' }, false), 'file');
});

test('validateLiquidEditionDeployMetadataOptions requires metadata inputs before deploy', () => {
  assert.deepEqual(validateLiquidEditionDeployMetadataOptions({}), {
    isValid: false,
    missingOptions: ['--description', '--image'],
    errorMessage: '--description and --image are required when not using --token-uri.',
  });
  assert.deepEqual(validateLiquidEditionDeployMetadataOptions({ description: 'Example' }), {
    isValid: false,
    missingOptions: ['--image'],
    errorMessage: '--image is required when not using --token-uri.',
  });
});

test('validateLiquidEditionDeployMetadataOptions allows token URI and preview flows', () => {
  assert.deepEqual(validateLiquidEditionDeployMetadataOptions({ tokenUri: 'ipfs://metadata' }), { isValid: true });
  assert.deepEqual(validateLiquidEditionDeployMetadataOptions({ preview: true }), { isValid: true });
});

test('getLiquidEditionDeployConfirmationDecision requires yes for JSON and non-interactive writes', () => {
  assert.equal(
    getLiquidEditionDeployConfirmationDecision({ yes: true, jsonMode: true, stdinIsTty: false }),
    'skip',
  );
  assert.equal(
    getLiquidEditionDeployConfirmationDecision({ jsonMode: true, stdinIsTty: false }),
    'reject-json',
  );
  assert.equal(
    getLiquidEditionDeployConfirmationDecision({ jsonMode: false, stdinIsTty: false }),
    'reject-non-interactive',
  );
  assert.equal(
    getLiquidEditionDeployConfirmationDecision({ jsonMode: false, stdinIsTty: true }),
    'prompt',
  );
});

test('formatCurvePreview prints source and segment details', () => {
  const lines = formatCurvePreview(
    {
      totalPositions: 3,
      totalShare: 1,
      curvePoolSupplyTokens: '900000',
      maxTotalSupplyTokens: '1000000',
      creatorLaunchRewardTokens: '100000',
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
    'sepolia',
  );

  assert.ok(lines.some((line) => line.includes('preset:medium-demand')));
  assert.ok(lines.some((line) => line.includes('Target chain: sepolia')));
  assert.ok(lines.some((line) => line.includes('ticks -60 -> 60')));
});
