import type { Address, PublicClient } from 'viem';
import { uniswapV4QuoterAbi } from '../contracts/abis/uniswap-v4-quoter.js';
import type { PoolKey, ResolvedRoute, ResolvedRouteStep, ResolvedV4RouteStep, RouteQuote } from './route-types.js';
import { buildExactInputSingleRoute } from './build-route.js';

function parseQuoteExactInputSingleResult(value: unknown): { amountOut: bigint; gasEstimate: bigint } {
  if (!isQuoteExactInputSingleResult(value)) {
    throw new Error('Unexpected V4 quoter result.');
  }
  const [amountOut, gasEstimate] = value;
  return { amountOut, gasEstimate };
}

function isQuoteExactInputSingleResult(value: unknown): value is readonly [bigint, bigint] {
  return Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'bigint' &&
    typeof value[1] === 'bigint';
}

export async function quoteExactInputSingle(
  publicClient: PublicClient,
  quoterAddress: Address,
  tokenIn: Address,
  tokenOut: Address,
  poolKey: PoolKey,
  amountIn: bigint,
): Promise<{ amountOut: bigint; gasEstimate: bigint; step: ResolvedV4RouteStep }> {
  const [step] = buildExactInputSingleRoute(tokenIn, tokenOut, poolKey);
  if (step === undefined) {
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

  const { amountOut, gasEstimate } = parseQuoteExactInputSingleResult(simulation.result);
  return { amountOut, gasEstimate, step };
}

export async function quoteRoute(
  publicClient: PublicClient,
  quoterAddress: Address,
  route: ResolvedRoute,
  amountIn: bigint,
  minAmountOut: bigint,
): Promise<RouteQuote> {
  const { amountOut, steps } = await quoteRouteSteps(publicClient, quoterAddress, route.steps, amountIn);

  return {
    amountOut,
    minAmountOut,
    steps,
  };
}

async function quoteRouteSteps(
  publicClient: PublicClient,
  quoterAddress: Address,
  routeSteps: readonly ResolvedRouteStep[],
  currentAmount: bigint,
  quotedSteps: readonly ResolvedRouteStep[] = [],
): Promise<{ amountOut: bigint; steps: ResolvedRouteStep[] }> {
  const [step, ...remainingSteps] = routeSteps;
  if (step === undefined) {
    return { amountOut: currentAmount, steps: [...quotedSteps] };
  }

  if (step.kind !== 'v4Swap') {
    return quoteRouteSteps(publicClient, quoterAddress, remainingSteps, currentAmount, [...quotedSteps, step]);
  }

  const quote = await quoteExactInputSingle(
    publicClient,
    quoterAddress,
    step.tokenIn,
    step.tokenOut,
    step.poolKey,
    currentAmount,
  );

  return quoteRouteSteps(publicClient, quoterAddress, remainingSteps, quote.amountOut, [...quotedSteps, quote.step]);
}
