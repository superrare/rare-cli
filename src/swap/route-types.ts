import type { Address } from 'viem';

export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export type ResolvedV4RouteStep = {
  kind: 'v4Swap';
  tokenIn: Address;
  tokenOut: Address;
  poolKey: PoolKey;
  zeroForOne: boolean;
}

export type WrapEthRouteStep = {
  kind: 'wrapEth';
  token: Address;
}

export type UnwrapWethRouteStep = {
  kind: 'unwrapWeth';
  token: Address;
}

export type ResolvedRouteStep = ResolvedV4RouteStep | WrapEthRouteStep | UnwrapWethRouteStep;

export type ResolvedRoute = {
  steps: ResolvedRouteStep[];
  tokenIn: Address;
  tokenOut: Address;
  routeSource: 'liquid-edition' | 'known-pool';
  routeDescription: string;
}

export type RouteQuote = {
  amountOut: bigint;
  minAmountOut: bigint;
  steps: ResolvedRouteStep[];
}
