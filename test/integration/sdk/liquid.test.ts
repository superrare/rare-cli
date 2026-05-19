import { describe, expect, it } from 'vitest';
import { resolveCurrency } from '../../../src/contracts/addresses.js';
import { createRareClient } from '../../../src/sdk/client.js';
import { createTestSepoliaPublicClient, hasTestRpcUrl } from '../../helpers/liveViem.js';

const describeLive = hasTestRpcUrl() ? describe : describe.skip;

describeLive('Liquid Editions SDK live integration', () => {
  it('reads the live factory config and validates curves against it', async () => {
    const rare = createRareClient({ publicClient: createTestSepoliaPublicClient() });

    const factoryConfig = await rare.liquidEdition.getFactoryConfig();
    expect(factoryConfig.baseToken).toBe(resolveCurrency('rare', 'sepolia'));
    expect(factoryConfig.maxTotalSupplyWei).toBeGreaterThan(0n);
    expect(factoryConfig.curvePoolSupplyWei).toBeGreaterThan(0n);
    expect(factoryConfig.poolTickSpacing).toBeGreaterThan(0);

    const preview = await rare.liquidEdition.validateCurves({
      curves: [{ tickLower: -60_000, tickUpper: 60_000, numPositions: 1, shares: '1' }],
    });

    expect(preview.baseToken).toBe(factoryConfig.baseToken);
    expect(preview.curvePoolSupplyTokens).toBe(factoryConfig.curvePoolSupplyTokens);
    expect(preview.totalPositions).toBe(1);
    expect(preview.totalShare).toBe(1);
  }, 30_000);

  it('generates preset curves from live factory config and the Rare price API', async () => {
    const rare = createRareClient({ publicClient: createTestSepoliaPublicClient() });

    const generated = await rare.liquidEdition.generatePresetCurves({ preset: 'medium-demand' });

    expect(generated.preset).toBe('medium-demand');
    expect(generated.rarePriceUsd).toBeGreaterThan(0);
    expect(generated.curves.length).toBeGreaterThan(0);
    expect(generated.preview.totalPositions).toBeGreaterThan(0);
    expect(generated.preview.totalShare).toBeCloseTo(1);
  }, 30_000);
});
