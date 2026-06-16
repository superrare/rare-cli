import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isAddress, parseUnits } from 'viem';
import {
  cleanupLiveFixture,
  createLiveFixture,
  E2E_TOKEN_URI,
  expectTx,
  jsonCommand,
  LIQUID_CURVES,
  LiveFixtureRef,
  missingEnv,
  step,
  uniqueSymbol,
  uniqueTokenName,
  type LiveFixture,
  type TxResult,
} from './helpers/live-harness.js';
import {
  deployLiquidEdition,
  readLiquidEditionStatus,
  readLiquidEditionTokenUri,
} from './helpers/live-liquid-edition.js';

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

    const tokenUri = await readLiquidEditionTokenUri(fixture, deployed.contract);
    expect(tokenUri).toEqual({
      contract: deployed.contract,
      tokenUri: E2E_TOKEN_URI,
    });

    const status = await readLiquidEditionStatus(fixture, deployed.contract);
    expect(status.contract).toBe(deployed.contract);
    expect(status.name).toContain('Rare CLI Liquid Deploy E2E');
    expect(status.symbol).toContain('LQD');
    expect(status.tokenUri).toBe(E2E_TOKEN_URI);
    expect(status.initialTokenUri).toBe(E2E_TOKEN_URI);
    expect(isAddress(status.renderContract)).toBe(true);
    expect(isAddress(status.baseToken)).toBe(true);
    expect(isAddress(status.tokenCreator)).toBe(true);
    expect(isAddress(status.poolManager)).toBe(true);
    expect(status.pool.contract).toBe(deployed.contract);
    expect(status.pool.poolId).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(isAddress(status.pool.poolKey.currency0)).toBe(true);
    expect(isAddress(status.pool.poolKey.currency1)).toBe(true);
    expect(isAddress(status.pool.poolKey.hooks)).toBe(true);
    expect(status.pool.poolKey.fee).toBeGreaterThanOrEqual(0);
    expect(Number(status.currentPrice.rarePerToken)).toBeGreaterThan(0);
    expect(Number(status.currentPrice.tokenPerRare)).toBeGreaterThan(0);
    expect(status.currentPrice.contract).toBe(deployed.contract);
    expect(Number(status.marketState.sqrtPriceX96)).toBeGreaterThan(0);
    expect(Number(status.marketState.currentSupply)).toBeGreaterThan(0);

    const renderContract = status.renderContract;
    const updated = await step('set Liquid Edition render contract', () =>
      jsonCommand<TxResult & { contract: string; renderContract: string }>(fixture.sellerHome, [
        'liquid-edition',
        'set-render-contract',
        '--contract',
        deployed.contract,
        '--render-contract',
        renderContract,
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(updated);
    expect(updated.contract.toLowerCase()).toBe(deployed.contract.toLowerCase());
    expect(updated.renderContract.toLowerCase()).toBe(renderContract.toLowerCase());

    const updatedStatus = await readLiquidEditionStatus(fixture, deployed.contract);
    expect(updatedStatus.renderContract.toLowerCase()).toBe(renderContract.toLowerCase());
  });

  it('deploys a Liquid Edition with a custom total supply', async () => {
    const fixture = live.value;
    const totalSupply = '250000';
    const deployed = await deployLiquidEdition(
      fixture,
      uniqueTokenName('Rare CLI Liquid Supply E2E'),
      uniqueSymbol('LQS'),
      undefined,
      totalSupply,
    );

    expectTx(deployed);
    expect(isAddress(deployed.contract)).toBe(true);
    expect(deployed.totalSupply).toBe(totalSupply);

    const status = await readLiquidEditionStatus(fixture, deployed.contract);
    expect(status.contract).toBe(deployed.contract);
    expect(status.name).toContain('Rare CLI Liquid Supply E2E');
    expect(status.symbol).toContain('LQS');
    const maxTotalSupply = parseUnits(totalSupply, 18);
    expect(status.maxTotalSupply).toBe(maxTotalSupply.toString());
    expect(status.poolLaunchSupply).toBe((maxTotalSupply - BigInt(status.creatorLaunchReward)).toString());
  });
});
