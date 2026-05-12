import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isAddress } from 'viem';
import {
  cleanupLiveFixture,
  createLiveFixture,
  E2E_TOKEN_URI,
  expectTx,
  LIQUID_CURVES,
  LiveFixtureRef,
  missingEnv,
  uniqueSymbol,
  uniqueTokenName,
  type LiveFixture,
} from './helpers/live-harness.js';
import { deployLiquidEdition } from './helpers/live-liquid-edition.js';

const describeLive = missingEnv.length === 0 ? describe.sequential : describe.skip;
const live = new LiveFixtureRef<LiveFixture>(`Live environment is not configured: ${missingEnv.join(', ')}`);

describeLive('live deploy liquid-edition CLI write command', () => {
  beforeAll(async () => {
    live.set(await createLiveFixture());
  });

  afterAll(async () => {
    await cleanupLiveFixture(live.optionalValue);
  });

  it('deploys a Liquid Edition from an explicit curves file', async () => {
    const fixture = live.value;
    const deployed = await deployLiquidEdition(
      fixture,
      uniqueTokenName('Rare CLI Liquid Deploy E2E'),
      uniqueSymbol('LQD'),
    );

    expectTx(deployed);
    expect(isAddress(deployed.contract)).toBe(true);
    expect(deployed.chainId).toBe(fixture.chainId);
    expect(deployed.tokenUri).toBe(E2E_TOKEN_URI);
    expect(deployed.source).toBe(`file:${fixture.curvesFile}`);
    expect(deployed.liquidEditionUrl).toBe(`https://superrare.com/liquid-editions/${fixture.chainId}/${deployed.contract}`);
    expect(deployed.curves).toEqual(LIQUID_CURVES);
  });
});
