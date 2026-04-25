import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeAbiParameters, parseAbiParameters } from 'viem';
import { ETH_ADDRESS } from '../src/contracts/addresses.js';
import {
  buildCanonicalTokenBuyRoute,
  buildCanonicalTokenSellRoute,
  buildExactInputSingleRoute,
} from '../src/swap/build-route.js';
import { encodeBuyRareRoute, encodeRoute } from '../src/swap/route-encoding.js';
import { quoteExactInputSingle } from '../src/swap/quoter.js';

const rareAddress = '0xba5BDe662c17e2aDFF1075610382B9B691296350' as const;
const wethAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const;
const liquidTokenAddress = '0xf100000000000000000000000000000000000001' as const;
const rarePoolKey = {
  currency0: ETH_ADDRESS,
  currency1: rareAddress,
  fee: 3000,
  tickSpacing: 60,
  hooks: ETH_ADDRESS,
};
const wethLiquidPoolKey = {
  currency0: wethAddress,
  currency1: liquidTokenAddress,
  fee: 0,
  tickSpacing: 60,
  hooks: '0x1111111111111111111111111111111111111111' as const,
};

test('buildExactInputSingleRoute creates an ETH -> RARE step', () => {
  const [step] = buildExactInputSingleRoute(ETH_ADDRESS, rareAddress, rarePoolKey);
  assert.ok(step);
  assert.equal(step?.zeroForOne, true);
  assert.equal(step?.tokenIn, ETH_ADDRESS);
  assert.equal(step?.tokenOut, rareAddress);
});

test('buildCanonicalTokenBuyRoute wraps ETH when the canonical base token is WETH', () => {
  const route = buildCanonicalTokenBuyRoute('mainnet', liquidTokenAddress, wethLiquidPoolKey, 'liquid-edition');
  assert.ok(route);
  assert.equal(route?.steps.length, 2);
  assert.equal(route?.steps[0]?.kind, 'wrapEth');
  assert.equal(route?.steps[1]?.kind, 'v4Swap');
});

test('buildCanonicalTokenSellRoute unwraps WETH when the canonical base token is WETH', () => {
  const route = buildCanonicalTokenSellRoute('mainnet', liquidTokenAddress, wethLiquidPoolKey, 'liquid-edition');
  assert.ok(route);
  assert.equal(route?.steps.length, 2);
  assert.equal(route?.steps[0]?.kind, 'v4Swap');
  assert.equal(route?.steps[1]?.kind, 'unwrapWeth');
});

test('quoteExactInputSingle returns the mocked quote result', async () => {
  const publicClient = {
    simulateContract: async () => ({ result: [123n, 456n] }),
  } as any;

  const quote = await quoteExactInputSingle(publicClient, '0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203', ETH_ADDRESS, rareAddress, rarePoolKey, 1n);
  assert.equal(quote.amountOut, 123n);
  assert.equal(quote.gasEstimate, 456n);
  assert.equal(quote.step.zeroForOne, true);
});

test('encodeBuyRareRoute emits one V4 command with swap/settle/take actions', () => {
  const [step] = buildExactInputSingleRoute(ETH_ADDRESS, rareAddress, rarePoolKey);
  assert.ok(step);

  const encoded = encodeBuyRareRoute(
    {
      amountOut: 1000n,
      minAmountOut: 950n,
      steps: [step!],
    },
    1_000n,
    ETH_ADDRESS,
    rareAddress,
  );

  assert.equal(encoded.commands, '0x10');
  assert.equal(encoded.inputs.length, 1);

  const [decoded] = decodeAbiParameters(parseAbiParameters('bytes actions, bytes[] params'), encoded.inputs[0]!);
  const actions = decoded as `0x${string}`;
  assert.equal(actions, '0x070c0f');
});

test('encodeRoute emits WRAP_ETH then a single-hop V4 swap block', () => {
  const route = buildCanonicalTokenBuyRoute('mainnet', liquidTokenAddress, wethLiquidPoolKey, 'liquid-edition');
  assert.ok(route);

  const encoded = encodeRoute(
    {
      amountOut: 500n,
      minAmountOut: 475n,
      steps: route!.steps,
    },
    1_000n,
    ETH_ADDRESS,
    liquidTokenAddress,
  );

  assert.equal(encoded.commands, '0x0b10');
  assert.equal(encoded.inputs.length, 2);

  const [decoded] = decodeAbiParameters(parseAbiParameters('bytes actions, bytes[] params'), encoded.inputs[1]!);
  const actions = decoded as `0x${string}`;
  assert.equal(actions, '0x0b060f');
});

test('encodeRoute emits a V4 swap block followed by UNWRAP_WETH', () => {
  const route = buildCanonicalTokenSellRoute('mainnet', liquidTokenAddress, wethLiquidPoolKey, 'liquid-edition');
  assert.ok(route);

  const encoded = encodeRoute(
    {
      amountOut: 500n,
      minAmountOut: 475n,
      steps: route!.steps,
    },
    1_000n,
    liquidTokenAddress,
    ETH_ADDRESS,
  );

  assert.equal(encoded.commands, '0x100c');
  assert.equal(encoded.inputs.length, 2);
});
