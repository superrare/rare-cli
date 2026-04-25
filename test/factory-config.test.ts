import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveLiquidFactoryConfig } from '../src/liquid/factory-config.js';

test('deriveLiquidFactoryConfig uses maxTotalSupply minus creatorLaunchReward for curve supply', () => {
  const config = deriveLiquidFactoryConfig(
    '0xba5BDe662c17e2aDFF1075610382B9B691296350',
    1_000_000n * 10n ** 18n,
    100_000n * 10n ** 18n,
    0n,
    {
      lpTickLower: -887220,
      lpTickUpper: 887220,
      poolTickSpacing: 60,
    },
  );

  assert.equal(config.maxTotalSupplyTokens, 1_000_000);
  assert.equal(config.creatorLaunchRewardTokens, 100_000);
  assert.equal(config.curvePoolSupplyTokens, 900_000);
});

test('deriveLiquidFactoryConfig rejects creator rewards above max supply', () => {
  assert.throws(
    () =>
      deriveLiquidFactoryConfig(
        '0xba5BDe662c17e2aDFF1075610382B9B691296350',
        10n,
        11n,
        0n,
        { lpTickLower: -60, lpTickUpper: 60, poolTickSpacing: 60 },
      ),
    /creatorLaunchReward exceeds maxTotalSupply/i,
  );
});
