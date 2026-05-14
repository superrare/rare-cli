import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanupLiveFixture,
  createLiveFixture,
  expectTokenBalanceAtLeast,
  formatTokenAmount,
  jsonCommand,
  liveInitialRareLiquidity,
  liveLiquidEditionSellAmount,
  liveSwapEthAmount,
  LiveFixtureRef,
  missingEnv,
  parseTokenAmount,
  readTokenBalance,
  requireBuyerFixture,
  step,
  uniqueSymbol,
  uniqueTokenName,
  type BuyerLiveFixture,
  type LiveFixture,
} from './helpers/live-harness.js';
import {
  deployLiquidEdition,
  readLiquidEditionStatus,
  type LiquidEditionStatusResult,
} from './helpers/live-liquid-edition.js';
import {
  expectLiquidEditionSwap,
  type TokenTradeResult,
} from './helpers/live-swap.js';

const describeLive = missingEnv.length === 0 ? describe.sequential : describe.skip;
const live = new LiveFixtureRef<BuyerLiveFixture>(`Live environment is not configured: ${missingEnv.join(', ')}`);

describeLive('live Liquid Edition user flow', () => {
  beforeAll(async () => {
    live.set(requireBuyerFixture(await createLiveFixture({ buyer: true })));
  });

  afterAll(async () => {
    await cleanupLiveFixture(live.optionalValue);
  });

  it('deploys a Liquid Edition, buys it from a second wallet, then sells it for ETH', async () => {
    const fixture = live.value;
    await expectTokenBalanceAtLeast(fixture, fixture.sellerAddress, fixture.rareAddress, liveInitialRareLiquidity());

    const deployed = await deployLiquidEdition(
      fixture,
      uniqueTokenName('Rare CLI Liquid Flow E2E'),
      uniqueSymbol('LQF'),
      liveInitialRareLiquidity(),
    );
    const liquidEdition = deployed.contract;
    const balanceBeforeBuy = await readTokenBalance(fixture, fixture.buyerAddress, liquidEdition);
    const statusBeforeBuy = await readLiquidEditionStatus(fixture, liquidEdition);
    expect(statusBeforeBuy.contract).toBe(liquidEdition);
    expect(statusBeforeBuy.tokenUri).toBe(deployed.tokenUri);

    const buy = await step('buyer buys Liquid Edition', () =>
      jsonCommand<TokenTradeResult>(fixture.buyerHome, [
        'swap',
        'buy-token',
        '--token',
        liquidEdition,
        '--eth',
        liveSwapEthAmount(),
        '--yes',
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectLiquidEditionSwap(buy);

    const balanceAfterBuy = await readTokenBalance(fixture, fixture.buyerAddress, liquidEdition);
    expect(balanceAfterBuy).toBeGreaterThan(balanceBeforeBuy);
    const statusAfterBuy = await readLiquidEditionStatus(fixture, liquidEdition);
    expectLiquidMarketStateChanged(statusBeforeBuy, statusAfterBuy);

    const sellAmount = await formatTinySellAmount(fixture, liquidEdition, balanceAfterBuy);
    const sell = await step('buyer sells Liquid Edition', () =>
      jsonCommand<TokenTradeResult>(fixture.buyerHome, [
        'swap',
        'sell-token',
        '--token',
        liquidEdition,
        '--amount',
        sellAmount,
        '--yes',
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectLiquidEditionSwap(sell);

    const balanceAfterSell = await readTokenBalance(fixture, fixture.buyerAddress, liquidEdition);
    expect(balanceAfterSell).toBeLessThan(balanceAfterBuy);
    const statusAfterSell = await readLiquidEditionStatus(fixture, liquidEdition);
    expectLiquidMarketStateChanged(statusAfterBuy, statusAfterSell);
  });
});

function expectLiquidMarketStateChanged(
  before: LiquidEditionStatusResult,
  after: LiquidEditionStatusResult,
): void {
  expect(after.pool.poolId).toBe(before.pool.poolId);
  expect(after.currentPrice.contract).toBe(before.currentPrice.contract);
  expect(Number(after.currentPrice.rarePerToken)).toBeGreaterThan(0);
  expect(Number(after.currentPrice.tokenPerRare)).toBeGreaterThan(0);
  expect(after.marketState.sqrtPriceX96).not.toBe(before.marketState.sqrtPriceX96);
}

async function formatTinySellAmount(live: LiveFixture, token: `0x${string}`, balance: bigint): Promise<string> {
  const preferred = await parseTokenAmount(live, token, liveLiquidEditionSellAmount());
  const amount = balance < preferred ? balance : preferred;
  if (amount <= 0n) {
    throw new Error('Buyer did not receive any Liquid Edition tokens to sell.');
  }
  return formatTokenAmount(live, token, amount);
}
