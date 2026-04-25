import type { Address, PublicClient } from 'viem';
import { uniswapV4QuoterAbi } from '../contracts/abis/uniswap-v4-quoter.js';
import type { PoolKey, ResolvedRoute, ResolvedRouteStep, ResolvedV4RouteStep, RouteQuote } from './route-types.js';
import { buildExactInputSingleRoute } from './build-route.js';

export async function quoteExactInputSingle(
  publicClient: PublicClient,
  quoterAddress: Address,
  tokenIn: Address,
  tokenOut: Address,
  poolKey: PoolKey,
  amountIn: bigint,
): Promise<{ amountOut: bigint; gasEstimate: bigint; step: ResolvedV4RouteStep }> {
  const [step] = buildExactInputSingleRoute(tokenIn, tokenOut, poolKey);
  if (!step) {
    throw new Error('Failed to build swap route.');
  }

  const simulation = await publicClient.simulateContract({
    address: quoterAddress,
    abi: uniswapV4QuoterAbi,
    functionName: 'quoteExactInputSingle',
    args: [
      {
        poolKey: {
          currency0: poolKey.currency0,
          currency1: poolKey.currency1,
          fee: poolKey.fee,
          tickSpacing: poolKey.tickSpacing,
          hooks: poolKey.hooks,
        },
        zeroForOne: step.zeroForOne,
        exactAmount: amountIn,
        hookData: '0x',
      },
    ],
  });

  const [amountOut, gasEstimate] = simulation.result as readonly [bigint, bigint];
  return { amountOut, gasEstimate, step };
}

export async function quoteRoute(
  publicClient: PublicClient,
  quoterAddress: Address,
  route: ResolvedRoute,
  amountIn: bigint,
  minAmountOut: bigint,
): Promise<RouteQuote> {
  let currentAmount = amountIn;
  const quotedSteps: ResolvedRouteStep[] = [];

  for (const step of route.steps) {
    if (step.kind !== 'v4Swap') {
      quotedSteps.push(step);
      continue;
    }

    const quote = await quoteExactInputSingle(
      publicClient,
      quoterAddress,
      step.tokenIn,
      step.tokenOut,
      step.poolKey,
      currentAmount,
    );

    currentAmount = quote.amountOut;
    quotedSteps.push(quote.step);
  }

  return {
    amountOut: currentAmount,
    minAmountOut,
    steps: quotedSteps,
  };
}
