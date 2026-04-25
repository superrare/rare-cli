import type { Address } from 'viem';

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export interface ResolvedV4RouteStep {
  kind: 'v4Swap';
  tokenIn: Address;
  tokenOut: Address;
  poolKey: PoolKey;
  zeroForOne: boolean;
}

export interface WrapEthRouteStep {
  kind: 'wrapEth';
  token: Address;
}

export interface UnwrapWethRouteStep {
  kind: 'unwrapWeth';
  token: Address;
}

export type ResolvedRouteStep = ResolvedV4RouteStep | WrapEthRouteStep | UnwrapWethRouteStep;

export interface ResolvedRoute {
  steps: ResolvedRouteStep[];
  tokenIn: Address;
  tokenOut: Address;
  routeSource: 'liquid-edition' | 'known-pool';
  routeDescription: string;
}

export interface RouteQuote {
  amountOut: bigint;
  minAmountOut: bigint;
  steps: ResolvedRouteStep[];
}
