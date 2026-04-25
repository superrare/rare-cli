import { formatEther, formatUnits, isHex } from 'viem';
import type { BuyRareQuote, TokenTradeQuote } from '../sdk/client.js';

export function parseInputsJson(raw: string, label: string): readonly `0x${string}`[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in inputs file: ${label}`);
  }

  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== 'string' || !isHex(value))) {
    throw new Error(`Inputs file must be a JSON array of hex strings: ${label}`);
  }

  return parsed as readonly `0x${string}`[];
}

export function ensureHex(value: string, label: string): `0x${string}` {
  if (!isHex(value)) {
    throw new Error(`${label} must be a hex string.`);
  }
  return value as `0x${string}`;
}

export function isAffirmativeResponse(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes';
}

export function shouldPromptForConfirmation(
  opts: { yes?: boolean; quoteOnly?: boolean },
  isTty: boolean,
  jsonMode: boolean,
): boolean {
  return isTty && !jsonMode && !opts.yes && !opts.quoteOnly;
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
