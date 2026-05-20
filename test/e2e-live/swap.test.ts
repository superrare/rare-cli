import { afterAll, beforeAll, describe, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formatEther } from 'viem';
import { ETH_ADDRESS } from '../../src/contracts/addresses.js';
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
  encodeEthToUsdcViaWethSwap,
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
        '--amount-in',
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
        '--amount-in',
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
        '--min-amount-out',
        minAmountOut,
        '--commands',
        encoded.commands,
        '--inputs-file',
        encoded.inputsFile,
        '--yes',
        '--chain',
        fixture.chain,
      ], 240_000),
    );

    expectTx(result);
  });

  it('swaps ETH for USDC through a router-funded WETH V4 pool', async () => {
    const fixture = live.value;
    if (fixture.chain !== 'sepolia') {
      return;
    }

    const encoded = await encodeEthToUsdcViaWethSwap(fixture, liveSwapEthAmount());
    const minAmountOut = await formatTokenAmount(fixture, fixture.usdcAddress, encoded.quote.minAmountOut);

    const result = await step('swap ETH for USDC through WETH V4 pool', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'swap',
        'swap',
        '--token-in',
        ETH_ADDRESS,
        '--amount-in',
        liveSwapEthAmount(),
        '--token-out',
        fixture.usdcAddress,
        '--min-amount-out',
        minAmountOut,
        '--commands',
        encoded.commands,
        '--inputs-file',
        encoded.inputsFile,
        '--yes',
        '--chain',
        fixture.chain,
      ], 240_000),
    );

    expectTx(result);
  });

  it('buys RARE through the curated buy-rare command', async () => {
    const fixture = live.value;
    const result = await step('buy RARE with curated buy-rare command', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'swap',
        'buy-rare',
        '--amount-in',
        liveSwapEthAmount(),
        '--yes',
        '--chain',
        fixture.chain,
      ], 240_000),
    );

    expectTx(result);
  });

  it('executes raw router buy and sell commands from quoted routes', async () => {
    const fixture = live.value;
    const buyQuote = await step('quote RARE raw buy route', () =>
      jsonCommand<{
        commands: `0x${string}`;
        inputs: `0x${string}`[];
        minRareOut: string;
      }>(fixture.sellerHome, [
        'swap',
        'buy-rare',
        '--amount-in',
        liveSwapEthAmount(),
        '--quote-only',
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    const buyInputsFile = await writeSwapInputsFile(fixture, 'rare-raw-buy-inputs.json', buyQuote.inputs);

    expectTx(await step('execute raw RARE buy route', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'swap',
        'buy-token',
        '--token',
        fixture.rareAddress,
        '--amount-in',
        liveSwapEthAmount(),
        '--route',
        'raw',
        '--min-amount-out',
        formatEther(BigInt(buyQuote.minRareOut)),
        '--commands',
        buyQuote.commands,
        '--inputs-file',
        buyInputsFile,
        '--yes',
        '--chain',
        fixture.chain,
      ], 240_000),
    ));

    await expectTokenBalanceAtLeast(fixture, fixture.sellerAddress, fixture.rareAddress, liveSwapRareAmount());
    const sellQuote = await step('quote RARE raw sell route', () =>
      jsonCommand<{
        commands: `0x${string}` | null;
        inputs: `0x${string}`[] | null;
        minAmountOut: string;
      }>(fixture.sellerHome, [
        'swap',
        'sell-token',
        '--token',
        fixture.rareAddress,
        '--amount-in',
        liveSwapRareAmount(),
        '--quote-only',
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    if (sellQuote.commands === null || sellQuote.inputs === null) {
      throw new Error('Expected RARE sell quote to use liquid-router calldata for raw sell coverage.');
    }
    const sellCommands = sellQuote.commands;
    const sellInputsFile = await writeSwapInputsFile(fixture, 'rare-raw-sell-inputs.json', sellQuote.inputs);

    expectTx(await step('execute raw RARE sell route', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'swap',
        'sell-token',
        '--token',
        fixture.rareAddress,
        '--amount-in',
        liveSwapRareAmount(),
        '--route',
        'raw',
        '--min-amount-out',
        formatEther(BigInt(sellQuote.minAmountOut)),
        '--commands',
        sellCommands,
        '--inputs-file',
        sellInputsFile,
        '--yes',
        '--chain',
        fixture.chain,
      ], 240_000),
    ));
  });
});

async function writeSwapInputsFile(
  fixture: LiveFixture,
  name: string,
  inputs: readonly `0x${string}`[],
): Promise<string> {
  const path = join(fixture.tempDir, name);
  await writeFile(path, JSON.stringify(inputs, null, 2), 'utf8');
  return path;
}
