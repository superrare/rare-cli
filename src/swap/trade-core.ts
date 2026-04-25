import type { Address } from 'viem';
import type { SupportedChain } from '../contracts/addresses.js';
import { buildCanonicalTokenBuyRoute, buildCanonicalTokenSellRoute } from './build-route.js';
import type { PoolKey, ResolvedRoute, RouteQuote } from './route-types.js';

export type TokenTradeDirection = 'buy' | 'sell';
export type TokenTradeRouteSource = 'liquid-edition' | 'known-pool' | 'uniswap-api';
export type TokenTradeExecution = 'liquid-router' | 'uniswap-api';

export interface TokenTradeQuoteCore {
  amountIn: bigint;
  estimatedAmountOut: bigint;
  minAmountOut: bigint;
  tokenIn: Address;
  tokenOut: Address;
  inputDecimals: number;
  outputDecimals: number;
  slippageBps: number;
  routeSource: TokenTradeRouteSource;
  execution: TokenTradeExecution;
  routeDescription: string;
  commands?: `0x${string}`;
  inputs?: readonly `0x${string}`[];
}

interface UniswapQuoteLike {
  output: {
    amount: string;
  };
  aggregatedOutputs?: Array<{
    amount: string;
    recipient: Address;
    minAmount: string;
  }>;
  routeString?: string;
}

function toTradeInteger(value: bigint | number | string, field: string): bigint {
  if (typeof value === 'bigint') return value;

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error(`${field} must be an integer.`);
    }
    return BigInt(value);
  }

  try {
    return BigInt(value);
  } catch {
    throw new Error(`${field} must be an integer.`);
  }
}

export function resolveSlippageBps(value?: bigint | number | string): number {
  const slippageBps = value === undefined ? 50 : Number(toTradeInteger(value, 'slippageBps'));
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10_000) {
    throw new Error('slippageBps must be an integer between 0 and 9999.');
  }
  return slippageBps;
}

export function computeMinAmountOut(amountOut: bigint, slippageBps: number): bigint {
  return (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
}

export function computeSlippageBpsFromAmounts(estimatedAmountOut: bigint, minAmountOut: bigint): number {
  if (estimatedAmountOut <= 0n || minAmountOut >= estimatedAmountOut) {
    return 0;
  }
  return Number(((estimatedAmountOut - minAmountOut) * 10_000n) / estimatedAmountOut);
}

export function buildCanonicalEthTradeRoute(params: {
  chain: SupportedChain;
  token: Address;
  direction: TokenTradeDirection;
  poolKey: PoolKey;
  routeSource: Extract<TokenTradeRouteSource, 'liquid-edition' | 'known-pool'>;
}): ResolvedRoute | null {
  return params.direction === 'buy'
    ? buildCanonicalTokenBuyRoute(params.chain, params.token, params.poolKey, params.routeSource)
    : buildCanonicalTokenSellRoute(params.chain, params.token, params.poolKey, params.routeSource);
}

export function buildLiquidRouterTradeQuote(params: {
  amountIn: bigint;
  route: ResolvedRoute;
  routeQuote: RouteQuote;
  minAmountOut: bigint;
  inputDecimals: number;
  outputDecimals: number;
  defaultSlippageBps: number;
  usedMinAmountOutOverride: boolean;
  commands: `0x${string}`;
  inputs: readonly `0x${string}`[];
}): TokenTradeQuoteCore {
  return {
    amountIn: params.amountIn,
    estimatedAmountOut: params.routeQuote.amountOut,
    minAmountOut: params.minAmountOut,
    tokenIn: params.route.tokenIn,
    tokenOut: params.route.tokenOut,
    inputDecimals: params.inputDecimals,
    outputDecimals: params.outputDecimals,
    slippageBps: params.usedMinAmountOutOverride
      ? computeSlippageBpsFromAmounts(params.routeQuote.amountOut, params.minAmountOut)
      : params.defaultSlippageBps,
    routeSource: params.route.routeSource,
    execution: 'liquid-router',
    routeDescription: params.route.routeDescription,
    commands: params.commands,
    inputs: params.inputs,
  };
}

export function getQuotedRecipientAmount(quote: UniswapQuoteLike, recipient: Address): {
  estimatedAmountOut: bigint;
  minAmountOut: bigint;
} {
  const normalizedRecipient = recipient.toLowerCase();
  const recipientOutput = quote.aggregatedOutputs?.find(
    (output) => output.recipient.toLowerCase() === normalizedRecipient,
  );

  if (recipientOutput) {
    return {
      estimatedAmountOut: BigInt(recipientOutput.amount),
      minAmountOut: BigInt(recipientOutput.minAmount),
    };
  }

  return {
    estimatedAmountOut: BigInt(quote.output.amount),
    minAmountOut: BigInt(quote.output.amount),
  };
}

export function assertSupportedUniswapRouting(routing: string): void {
  if (routing !== 'CLASSIC' && routing !== 'WRAP' && routing !== 'UNWRAP') {
    throw new Error(`Unsupported Uniswap routing mode: ${routing}`);
  }
}

export function assertRecipientSupportedForUniswapFallback(recipient: Address | undefined, accountAddress: Address): void {
  if (recipient && recipient.toLowerCase() !== accountAddress.toLowerCase()) {
    throw new Error('recipient override is not supported for Uniswap API fallback routes.');
  }
}

export function assertRequestedMinAmountOut(estimatedAmountOut: bigint, requestedMinAmountOut: bigint): void {
  if (requestedMinAmountOut > estimatedAmountOut) {
    throw new Error('Requested minimum output exceeds the current quoted output.');
  }
}

export function assertRequotedMinAmountOut(requotedMinAmountOut: bigint, requestedMinAmountOut: bigint): void {
  if (requotedMinAmountOut < requestedMinAmountOut) {
    throw new Error('Unable to satisfy the requested minimum output with the Uniswap fallback route.');
  }
}

export function buildUniswapTradeQuote(params: {
  amountIn: bigint;
  quote: UniswapQuoteLike;
  recipient: Address;
  tokenIn: Address;
  tokenOut: Address;
  inputDecimals: number;
  outputDecimals: number;
  routing: string;
}): TokenTradeQuoteCore {
  const { estimatedAmountOut, minAmountOut } = getQuotedRecipientAmount(params.quote, params.recipient);

  return {
    amountIn: params.amountIn,
    estimatedAmountOut,
    minAmountOut,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    inputDecimals: params.inputDecimals,
    outputDecimals: params.outputDecimals,
    slippageBps: computeSlippageBpsFromAmounts(estimatedAmountOut, minAmountOut),
    routeSource: 'uniswap-api',
    execution: 'uniswap-api',
    routeDescription: params.quote.routeString ?? params.routing,
  };
}

export function buildBuyRareQuoteFromTokenQuote(rareAddress: Address, quote: TokenTradeQuoteCore) {
  if (quote.execution !== 'liquid-router' || !quote.commands || !quote.inputs) {
    throw new Error('Failed to build the canonical RARE route.');
  }

  return {
    ethAmount: quote.amountIn,
    rareAddress,
    estimatedRareOut: quote.estimatedAmountOut,
    minRareOut: quote.minAmountOut,
    slippageBps: quote.slippageBps,
    commands: quote.commands,
    inputs: quote.inputs,
  };
}
