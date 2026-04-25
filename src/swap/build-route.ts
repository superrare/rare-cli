import { ETH_ADDRESS, type SupportedChain } from '../contracts/addresses.js';
import {
  getCanonicalRareEthPoolKey,
  getCanonicalUsdcEthPoolKey,
  getRareAddress,
  getUsdcAddress,
  getWrappedEthAddress,
} from './known-pools.js';
import { inferBaseCurrencyAddress, normalizeAddress } from './pool-core.js';
import type { PoolKey, ResolvedRoute, ResolvedRouteStep, ResolvedV4RouteStep } from './route-types.js';

export function sortCurrencies(tokenA: `0x${string}`, tokenB: `0x${string}`): [`0x${string}`, `0x${string}`] {
  return normalizeAddress(tokenA) < normalizeAddress(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA];
}

export function buildV4SwapStep(
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  poolKey: PoolKey,
): ResolvedV4RouteStep {
  const [currency0, currency1] = sortCurrencies(tokenIn, tokenOut);
  if (
    normalizeAddress(currency0) !== normalizeAddress(poolKey.currency0) ||
    normalizeAddress(currency1) !== normalizeAddress(poolKey.currency1)
  ) {
    throw new Error('Pool key does not match the requested input/output currencies.');
  }

  return {
    kind: 'v4Swap',
    tokenIn,
    tokenOut,
    poolKey,
    zeroForOne: normalizeAddress(tokenIn) === normalizeAddress(poolKey.currency0),
  };
}

export function buildExactInputSingleRoute(
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  poolKey: PoolKey,
): ResolvedV4RouteStep[] {
  return [buildV4SwapStep(tokenIn, tokenOut, poolKey)];
}

function buildWrapEthStep(token: `0x${string}`): ResolvedRouteStep {
  return { kind: 'wrapEth', token };
}

function buildUnwrapWethStep(token: `0x${string}`): ResolvedRouteStep {
  return { kind: 'unwrapWeth', token };
}

function buildRouteDescription(steps: ResolvedRouteStep[]): string {
  return steps
    .map((step) => {
      if (step.kind === 'wrapEth') {
        return 'WRAP_ETH';
      }
      if (step.kind === 'unwrapWeth') {
        return 'UNWRAP_WETH';
      }
      return `${step.tokenIn}->${step.tokenOut}`;
    })
    .join(' | ');
}

function routeWithMetadata(
  steps: ResolvedRouteStep[],
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  routeSource: ResolvedRoute['routeSource'],
): ResolvedRoute {
  return {
    steps,
    tokenIn,
    tokenOut,
    routeSource,
    routeDescription: buildRouteDescription(steps),
  };
}

export function buildCanonicalTokenBuyRoute(
  chain: SupportedChain,
  token: `0x${string}`,
  poolKey: PoolKey,
  routeSource: ResolvedRoute['routeSource'],
): ResolvedRoute | null {
  const baseCurrency = inferBaseCurrencyAddress(poolKey, token);
  if (!baseCurrency) {
    return null;
  }

  const rareAddress = getRareAddress(chain);
  const usdcAddress = getUsdcAddress(chain);
  const wethAddress = getWrappedEthAddress(chain);

  if (normalizeAddress(baseCurrency) === normalizeAddress(ETH_ADDRESS)) {
    return routeWithMetadata([buildV4SwapStep(ETH_ADDRESS, token, poolKey)], ETH_ADDRESS, token, routeSource);
  }

  if (wethAddress && normalizeAddress(baseCurrency) === normalizeAddress(wethAddress)) {
    return routeWithMetadata(
      [buildWrapEthStep(wethAddress), buildV4SwapStep(wethAddress, token, poolKey)],
      ETH_ADDRESS,
      token,
      routeSource,
    );
  }

  if (normalizeAddress(baseCurrency) === normalizeAddress(rareAddress)) {
    return routeWithMetadata(
      [
        buildV4SwapStep(ETH_ADDRESS, rareAddress, getCanonicalRareEthPoolKey(chain)),
        buildV4SwapStep(rareAddress, token, poolKey),
      ],
      ETH_ADDRESS,
      token,
      routeSource,
    );
  }

  if (normalizeAddress(baseCurrency) === normalizeAddress(usdcAddress)) {
    return routeWithMetadata(
      [
        buildV4SwapStep(ETH_ADDRESS, usdcAddress, getCanonicalUsdcEthPoolKey(chain)),
        buildV4SwapStep(usdcAddress, token, poolKey),
      ],
      ETH_ADDRESS,
      token,
      routeSource,
    );
  }

  return null;
}

export function buildCanonicalTokenSellRoute(
  chain: SupportedChain,
  token: `0x${string}`,
  poolKey: PoolKey,
  routeSource: ResolvedRoute['routeSource'],
): ResolvedRoute | null {
  const baseCurrency = inferBaseCurrencyAddress(poolKey, token);
  if (!baseCurrency) {
    return null;
  }

  const rareAddress = getRareAddress(chain);
  const usdcAddress = getUsdcAddress(chain);
  const wethAddress = getWrappedEthAddress(chain);

  if (normalizeAddress(baseCurrency) === normalizeAddress(ETH_ADDRESS)) {
    return routeWithMetadata([buildV4SwapStep(token, ETH_ADDRESS, poolKey)], token, ETH_ADDRESS, routeSource);
  }

  if (wethAddress && normalizeAddress(baseCurrency) === normalizeAddress(wethAddress)) {
    return routeWithMetadata(
      [buildV4SwapStep(token, wethAddress, poolKey), buildUnwrapWethStep(wethAddress)],
      token,
      ETH_ADDRESS,
      routeSource,
    );
  }

  if (normalizeAddress(baseCurrency) === normalizeAddress(rareAddress)) {
    return routeWithMetadata(
      [
        buildV4SwapStep(token, rareAddress, poolKey),
        buildV4SwapStep(rareAddress, ETH_ADDRESS, getCanonicalRareEthPoolKey(chain)),
      ],
      token,
      ETH_ADDRESS,
      routeSource,
    );
  }

  if (normalizeAddress(baseCurrency) === normalizeAddress(usdcAddress)) {
    return routeWithMetadata(
      [
        buildV4SwapStep(token, usdcAddress, poolKey),
        buildV4SwapStep(usdcAddress, ETH_ADDRESS, getCanonicalUsdcEthPoolKey(chain)),
      ],
      token,
      ETH_ADDRESS,
      routeSource,
    );
  }

  return null;
}
