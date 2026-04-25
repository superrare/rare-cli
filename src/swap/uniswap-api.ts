import type { Address } from 'viem';

export { getQuotedRecipientAmount } from './trade-core.js';

const DEFAULT_UNISWAP_TRADE_API_BASE_URL = 'https://trade-api.gateway.uniswap.org/v1';

export interface UniswapTransactionRequest {
  to: Address;
  from: Address;
  data: `0x${string}`;
  value: string;
  chainId: number;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasPrice?: string;
}

export interface UniswapApprovalResponse {
  requestId: string;
  approval: UniswapTransactionRequest | null;
  cancel: UniswapTransactionRequest | null;
  gasFee?: string;
  cancelGasFee?: string;
}

export interface UniswapQuoteRouteToken {
  chainId: number;
  decimals: string;
  address: Address;
  symbol?: string;
}

export interface UniswapQuoteRouteHop {
  type: string;
  address?: string;
  tokenIn: UniswapQuoteRouteToken;
  tokenOut: UniswapQuoteRouteToken;
  fee?: string;
  tickSpacing?: string;
  hooks?: Address;
  amountIn?: string;
  amountOut?: string;
}

export interface UniswapQuotePayload {
  chainId: number;
  input: {
    amount: string;
    token: Address;
  };
  output: {
    amount: string;
    token: Address;
    recipient: Address;
  };
  swapper: Address;
  route: UniswapQuoteRouteHop[][];
  slippage: number;
  tradeType: 'EXACT_INPUT' | 'EXACT_OUTPUT';
  quoteId: string;
  routeString?: string;
  aggregatedOutputs?: Array<{
    amount: string;
    token: Address;
    recipient: Address;
    bps: number;
    minAmount: string;
  }>;
  txFailureReasons?: string[];
}

export interface UniswapQuoteResponse {
  requestId: string;
  routing: string;
  quote: UniswapQuotePayload;
  permitData: unknown | null;
}

interface UniswapSwapResponse {
  requestId: string;
  swap: UniswapTransactionRequest;
  gasFee?: string;
}

interface UniswapApiRequestOptions {
  apiKey?: string;
  baseUrl?: string;
}

interface QuoteRequestParams {
  apiKey?: string;
  baseUrl?: string;
  chainId: number;
  tokenIn: Address;
  tokenOut: Address;
  amount: bigint;
  swapper: Address;
  slippageBps: number;
}

function getBaseUrl(options?: UniswapApiRequestOptions): string {
  return options?.baseUrl ?? process.env.UNISWAP_TRADE_API_BASE_URL ?? DEFAULT_UNISWAP_TRADE_API_BASE_URL;
}

function requireApiKey(options?: UniswapApiRequestOptions): string {
  const apiKey = options?.apiKey ?? process.env.UNISWAP_API_KEY;
  if (!apiKey) {
    throw new Error('UNISWAP_API_KEY is required to use the Uniswap fallback route.');
  }
  return apiKey;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let parsed: unknown = null;

  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Ignore and surface raw text below.
    }
  }

  if (!response.ok) {
    const message =
      typeof parsed === 'object' && parsed !== null && 'message' in parsed && typeof parsed.message === 'string'
        ? parsed.message
        : text || response.statusText;
    throw new Error(`Uniswap API ${response.status} ${response.statusText}: ${message}`);
  }

  return parsed as T;
}

function buildHeaders(options?: UniswapApiRequestOptions): HeadersInit {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-api-key': requireApiKey(options),
    'x-permit2-disabled': 'true',
    'x-universal-router-version': '2.0',
  };
}

export async function requestUniswapQuote(params: QuoteRequestParams): Promise<UniswapQuoteResponse> {
  const response = await fetch(`${getBaseUrl(params)}/quote`, {
    method: 'POST',
    headers: buildHeaders(params),
    body: JSON.stringify({
      type: 'EXACT_INPUT',
      tokenInChainId: params.chainId,
      tokenOutChainId: params.chainId,
      amount: params.amount.toString(),
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      swapper: params.swapper,
      protocols: ['V4', 'V3', 'V2'],
      routingPreference: 'BEST_PRICE',
      urgency: 'normal',
      slippageTolerance: params.slippageBps / 100,
    }),
  });

  return parseJsonResponse<UniswapQuoteResponse>(response);
}

export async function requestUniswapApproval(params: {
  apiKey?: string;
  baseUrl?: string;
  chainId: number;
  walletAddress: Address;
  token: Address;
  amount: bigint;
  tokenOut: Address;
}): Promise<UniswapApprovalResponse> {
  const response = await fetch(`${getBaseUrl(params)}/check_approval`, {
    method: 'POST',
    headers: buildHeaders(params),
    body: JSON.stringify({
      chainId: params.chainId,
      walletAddress: params.walletAddress,
      token: params.token,
      amount: params.amount.toString(),
      tokenOut: params.tokenOut,
      tokenOutChainId: params.chainId,
      includeGasInfo: true,
      urgency: 'normal',
    }),
  });

  return parseJsonResponse<UniswapApprovalResponse>(response);
}

export async function requestUniswapSwap(params: {
  apiKey?: string;
  baseUrl?: string;
  quote: UniswapQuotePayload;
  deadline?: number;
}): Promise<UniswapSwapResponse> {
  const response = await fetch(`${getBaseUrl(params)}/swap`, {
    method: 'POST',
    headers: buildHeaders(params),
    body: JSON.stringify({
      quote: params.quote,
      refreshGasPrice: true,
      simulateTransaction: true,
      safetyMode: 'SAFE',
      urgency: 'normal',
      ...(params.deadline !== undefined ? { deadline: params.deadline } : {}),
    }),
  });

  return parseJsonResponse<UniswapSwapResponse>(response);
}
