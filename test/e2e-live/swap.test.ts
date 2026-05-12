import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  cleanupLiveFixture,
  createLiveFixture,
  expectTokenBalanceAtLeast,
  expectTx,
  formatTokenAmount,
  jsonCommand,
  liveSwapEthAmount,
  liveSwapRareAmount,
  liveSwapRareToUsdcAmount,
  LiveFixtureRef,
  missingEnv,
  step,
  type LiveFixture,
  type TxResult,
} from './helpers/live-harness.js';
import {
  encodeRareToUsdcSwap,
  expectKnownPoolSwap,
  type TokenTradeResult,
} from './helpers/live-swap.js';

const describeLive = missingEnv.length === 0 ? describe.sequential : describe.skip;
const live = new LiveFixtureRef<LiveFixture>(`Live environment is not configured: ${missingEnv.join(', ')}`);

describeLive('live swap CLI write commands', () => {
  beforeAll(async () => {
    live.set(await createLiveFixture());
  });

  afterAll(async () => {
    await cleanupLiveFixture(live.optionalValue);
  });

  it('buys RARE with ETH', async () => {
    const fixture = live.value;
    const result = await step('buy RARE with ETH', () =>
      jsonCommand<TokenTradeResult>(fixture.sellerHome, [
        'swap',
        'buy-token',
        '--token',
        fixture.rareAddress,
        '--eth',
        liveSwapEthAmount(),
        '--yes',
        '--chain',
        fixture.chain,
      ], 240_000),
    );

    expectKnownPoolSwap(result);
  });

  it('sells RARE for ETH', async () => {
    const fixture = live.value;
    await expectTokenBalanceAtLeast(fixture, fixture.sellerAddress, fixture.rareAddress, liveSwapRareAmount());

    const result = await step('sell RARE for ETH', () =>
      jsonCommand<TokenTradeResult>(fixture.sellerHome, [
        'swap',
        'sell-token',
        '--token',
        fixture.rareAddress,
        '--amount',
        liveSwapRareAmount(),
        '--yes',
        '--chain',
        fixture.chain,
      ], 240_000),
    );

    expectKnownPoolSwap(result);
  });

  it('swaps RARE for USDC', async () => {
    const fixture = live.value;
    await expectTokenBalanceAtLeast(fixture, fixture.sellerAddress, fixture.rareAddress, liveSwapRareToUsdcAmount());

    const encoded = await encodeRareToUsdcSwap(fixture, liveSwapRareToUsdcAmount());
    const amountIn = await formatTokenAmount(fixture, fixture.rareAddress, encoded.amountIn);
    const minAmountOut = await formatTokenAmount(fixture, fixture.usdcAddress, encoded.quote.minAmountOut);

    const result = await step('swap RARE for USDC', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'swap',
        'swap',
        '--token-in',
        fixture.rareAddress,
        '--amount-in',
        amountIn,
        '--token-out',
        fixture.usdcAddress,
        '--min-out',
        minAmountOut,
        '--commands',
        encoded.commands,
        '--inputs-file',
        encoded.inputsFile,
        '--chain',
        fixture.chain,
      ], 240_000),
    );

    expectTx(result);
  });
});
