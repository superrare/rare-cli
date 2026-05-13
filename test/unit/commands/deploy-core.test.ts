import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  formatCurvePreview,
  resolveCurveSourceMode,
} from '../../../src/commands/deploy-core.js';

test('resolveCurveSourceMode rejects omitted curves outside a TTY', () => {
  assert.throws(() => resolveCurveSourceMode({}, false), /interactive curve wizard/i);
});

test('resolveCurveSourceMode prefers files over presets', () => {
  assert.equal(resolveCurveSourceMode({ curvesFile: './curves.json', curvePreset: 'medium-demand' }, false), 'file');
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
  );

  assert.ok(lines.some((line) => line.includes('preset:medium-demand')));
  assert.ok(lines.some((line) => line.includes('ticks -60 -> 60')));
});
