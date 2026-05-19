import { describe, expect, it } from 'vitest';
import { isHex, parseEther, parseUnits } from 'viem';
import { ETH_ADDRESS, resolveCurrency } from '../../../src/contracts/addresses.js';
import { createRareClient } from '../../../src/sdk/client.js';
import { createTestSepoliaPublicClient, hasTestRpcUrl } from '../../helpers/liveViem.js';

const describeLive = hasTestRpcUrl() ? describe : describe.skip;
const rareAddress = resolveCurrency('rare', 'sepolia');

describeLive('Swap SDK live integration', () => {
  it('quotes the canonical RARE buy route with the live V4 quoter', async () => {
    const rare = createRareClient({ publicClient: createTestSepoliaPublicClient() });

    const quote = await rare.swap.quoteBuyRare({
      amountIn: '0.001',
      slippageBps: 100,
    });

    expect(quote.ethAmount).toBe(parseEther('0.001'));
    expect(quote.rareAddress).toBe(rareAddress);
    expect(quote.estimatedRareOut).toBeGreaterThan(0n);
    expect(quote.minRareOut).toBeGreaterThan(0n);
    expect(quote.minRareOut).toBeLessThanOrEqual(quote.estimatedRareOut);
    expect(isHex(quote.commands)).toBe(true);
    expect(quote.inputs.length).toBeGreaterThan(0);
  }, 30_000);

  it('quotes canonical RARE token buy and sell routes through the SDK', async () => {
    const rare = createRareClient({ publicClient: createTestSepoliaPublicClient() });

    const buy = await rare.swap.quoteBuyToken({
      token: rareAddress,
      amountIn: '0.001',
      slippageBps: 100,
    });
    const sell = await rare.swap.quoteSellToken({
      token: rareAddress,
      amountIn: '1',
      slippageBps: 100,
    });

    expect(buy).toMatchObject({
      amountIn: parseEther('0.001'),
      tokenIn: ETH_ADDRESS,
      tokenOut: rareAddress,
      routeSource: 'known-pool',
      execution: 'liquid-router',
    });
    expect(buy.estimatedAmountOut).toBeGreaterThan(0n);
    expect(buy.minAmountOut).toBeLessThanOrEqual(buy.estimatedAmountOut);

    expect(sell).toMatchObject({
      amountIn: parseUnits('1', 18),
      tokenIn: rareAddress,
      tokenOut: ETH_ADDRESS,
      routeSource: 'known-pool',
      execution: 'liquid-router',
    });
    expect(sell.estimatedAmountOut).toBeGreaterThan(0n);
    expect(sell.minAmountOut).toBeLessThanOrEqual(sell.estimatedAmountOut);
  }, 30_000);
});
