import { formatEther, formatUnits, getAddress, isHex, type Address } from 'viem';
import type { BuyRareQuote, TokenTradeExecutionRoute, TokenTradeQuote } from '../sdk/swap.js';

const tokenTradeExecutionRoutes = ['auto', 'local', 'uniswap', 'raw'] as const;

export function parseInputsJson(raw: string, label: string): readonly `0x${string}`[] {
  const parsed = parseJson(raw, label);
  if (!Array.isArray(parsed)) {
    throw new Error(`Inputs file must be a JSON array of hex strings: ${label}`);
  }

  return parsed.map((value) => {
    if (typeof value !== 'string' || !isHex(value)) {
      throw new Error(`Inputs file must be a JSON array of hex strings: ${label}`);
    }
    return value;
  });
}

function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Invalid JSON in inputs file: ${label}`);
  }
}

export function ensureHex(value: string, label: string): `0x${string}` {
  if (!isHex(value)) {
    throw new Error(`${label} must be a hex string.`);
  }
  return value;
}

export function parseAddress(value: string, label: string): Address {
  try {
    return getAddress(value);
  } catch {
    throw new Error(`${label} must be a valid EVM address.`);
  }
}

export function parseOptionalAddress(value: string | undefined, label: string): Address | undefined {
  return value === undefined ? undefined : parseAddress(value, label);
}

export function parseTokenTradeExecutionRoute(value: string | undefined): TokenTradeExecutionRoute {
  if (value === undefined) {
    return 'auto';
  }
  if ((tokenTradeExecutionRoutes as readonly string[]).includes(value)) {
    return value as TokenTradeExecutionRoute;
  }
  throw new Error('--route must be one of: auto, local, uniswap, raw.');
}

export function formatBuyRareQuoteLines(params: {
  chain: string;
  router?: string;
  eth: string;
  quote: BuyRareQuote;
  recipient?: string;
  usedMinRareOutOverride: boolean;
}): string[] {
  const lines = [
    `Quote for buying RARE on ${params.chain}:`,
    ...(params.router ? [`  Router: ${params.router}`] : []),
    `  ETH in: ${params.eth}`,
    `  Estimated RARE out: ${formatEther(params.quote.estimatedRareOut)}`,
    `  Min RARE out: ${formatEther(params.quote.minRareOut)}`,
    params.usedMinRareOutOverride
      ? '  Min out source: manual override'
      : `  Slippage: ${params.quote.slippageBps} bps`,
    ...(params.recipient ? [`  Recipient: ${params.recipient}`] : []),
  ];

  return lines;
}

export function formatQuotedAmount(amount: bigint, decimals: number): string {
  return decimals === 18 ? formatEther(amount) : formatUnits(amount, decimals);
}

export function formatTokenTradeQuoteLines(params: {
  chain: string;
  direction: 'buy' | 'sell';
  token: string;
  amountLabel: string;
  amountIn: string;
  quote: TokenTradeQuote;
  recipient?: string;
  usedMinOutOverride: boolean;
}): string[] {
  const outputLabel = params.direction === 'buy' ? 'Estimated token out' : 'Estimated ETH out';
  const minOutputLabel = params.direction === 'buy' ? 'Min token out' : 'Min ETH out';

  return [
    `Quote for ${params.direction === 'buy' ? 'buying' : 'selling'} ${params.token} on ${params.chain}:`,
    `  Route source: ${params.quote.routeSource}`,
    `  Execution: ${params.quote.execution}`,
    `  Route: ${params.quote.routeDescription}`,
    `  ${params.amountLabel}: ${params.amountIn}`,
    `  ${outputLabel}: ${formatQuotedAmount(params.quote.estimatedAmountOut, params.quote.outputDecimals)}`,
    `  ${minOutputLabel}: ${formatQuotedAmount(params.quote.minAmountOut, params.quote.outputDecimals)}`,
    params.usedMinOutOverride
      ? '  Min out source: manual override'
      : `  Slippage: ${params.quote.slippageBps} bps`,
    ...(params.recipient ? [`  Recipient: ${params.recipient}`] : []),
  ];
}
