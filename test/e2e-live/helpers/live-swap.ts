import { expect } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEther, zeroAddress } from 'viem';
import {
  ETH_ADDRESS,
  getCanonicalRareEthPool,
  getCanonicalUsdcEthPool,
  getV4QuoterAddress,
} from '../../../src/contracts/addresses.js';
import { buildCanonicalTokenBuyRoute, buildV4SwapStep } from '../../../src/swap/build-route.js';
import { quoteRoute } from '../../../src/swap/quoter.js';
import { encodeRoute } from '../../../src/swap/route-encoding.js';
import type { ResolvedRoute, RouteQuote } from '../../../src/swap/route-types.js';
import {
  expectTx,
  parseTokenAmount,
  type LiveFixture,
  type TxResult,
} from './live-harness.js';

export type TokenTradeResult = TxResult & {
  execution: string;
  routeSource: string;
  estimatedAmountOut: string;
  minAmountOut: string;
  approvalTxHash?: string | null;
  commands?: `0x${string}`[] | `0x${string}` | null;
  inputs?: `0x${string}`[] | null;
};

export async function encodeRareToUsdcSwap(live: LiveFixture, rareAmount: string): Promise<{
  amountIn: bigint;
  quote: RouteQuote;
  commands: `0x${string}`;
  inputsFile: string;
}> {
  const amountIn = await parseTokenAmount(live, live.rareAddress, rareAmount);
  const quote = await quoteRareToUsdc(live, amountIn, rareAmount);
  const encoded = encodeRoute(quote, amountIn, live.rareAddress, live.usdcAddress);

  return {
    amountIn,
    quote,
    commands: encoded.commands,
    inputsFile: await writeInputsFile(live, 'rare-usdc-swap-inputs.json', encoded.inputs),
  };
}

export async function encodeEthToUsdcViaWethSwap(live: LiveFixture, ethAmount: string): Promise<{
  amountIn: bigint;
  quote: RouteQuote;
  commands: `0x${string}`;
  inputsFile: string;
}> {
  if (live.chain !== 'sepolia') {
    throw new Error(`ETH -> WETH -> USDC live swap coverage is configured for sepolia, got ${live.chain}.`);
  }

  const amountIn = parseEther(ethAmount);
  const route = buildCanonicalTokenBuyRoute('sepolia', live.usdcAddress, sepoliaWethUsdcPoolKey, 'known-pool');
  if (route === null) {
    throw new Error('Expected Sepolia WETH/USDC pool to build an ETH -> USDC route.');
  }

  const quoted = await quoteRoute(live.publicClient, getV4QuoterAddress(live.chain), route, amountIn, 0n);
  if (quoted.amountOut <= 0n) {
    throw new Error(`WETH -> USDC quote returned zero output for ${ethAmount} ETH on ${live.chain}.`);
  }
  const quote = {
    ...quoted,
    minAmountOut: applySlippage(quoted.amountOut, 50n),
  };
  const encoded = encodeRoute(quote, amountIn, ETH_ADDRESS, live.usdcAddress);

  return {
    amountIn,
    quote,
    commands: encoded.commands,
    inputsFile: await writeInputsFile(live, 'eth-weth-usdc-swap-inputs.json', encoded.inputs),
  };
}

export function expectKnownPoolSwap(result: TokenTradeResult): void {
  expectTx(result);
  expect(result.execution).toBe('liquid-router');
  expect(result.routeSource).toBe('known-pool');
  expect(BigInt(result.estimatedAmountOut)).toBeGreaterThan(0n);
  expect(BigInt(result.minAmountOut)).toBeGreaterThan(0n);
}

export function expectLiquidEditionSwap(result: TokenTradeResult): void {
  expectTx(result);
  expect(result.execution).toBe('liquid-router');
  expect(result.routeSource).toBe('liquid-edition');
  expect(BigInt(result.estimatedAmountOut)).toBeGreaterThan(0n);
  expect(BigInt(result.minAmountOut)).toBeGreaterThan(0n);
}

async function quoteRareToUsdc(live: LiveFixture, amountIn: bigint, displayAmount: string): Promise<RouteQuote> {
  const route = buildRareToUsdcRoute(live);
  const quoted = await quoteRoute(live.publicClient, getV4QuoterAddress(live.chain), route, amountIn, 0n);
  if (quoted.amountOut <= 0n) {
    throw new Error(`RARE -> USDC quote returned zero output for ${displayAmount} RARE on ${live.chain}. Increase E2E_SWAP_RARE_TO_USDC_AMOUNT.`);
  }
  return {
    ...quoted,
    minAmountOut: applySlippage(quoted.amountOut, 50n),
  };
}

function buildRareToUsdcRoute(live: LiveFixture): ResolvedRoute {
  const steps = [
    buildV4SwapStep(live.rareAddress, ETH_ADDRESS, getCanonicalRareEthPool(live.chain)),
    buildV4SwapStep(ETH_ADDRESS, live.usdcAddress, getCanonicalUsdcEthPool(live.chain)),
  ];

  return {
    steps,
    tokenIn: live.rareAddress,
    tokenOut: live.usdcAddress,
    routeSource: 'known-pool',
    routeDescription: `${live.rareAddress}->${ETH_ADDRESS} | ${ETH_ADDRESS}->${live.usdcAddress}`,
  };
}

const sepoliaWethUsdcPoolKey = {
  currency0: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  currency1: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
  fee: 500,
  tickSpacing: 20,
  hooks: zeroAddress,
} as const;

function applySlippage(amount: bigint, slippageBps: bigint): bigint {
  const adjusted = amount * (10_000n - slippageBps) / 10_000n;
  return adjusted > 0n ? adjusted : 1n;
}

async function writeInputsFile(live: LiveFixture, name: string, inputs: readonly `0x${string}`[]): Promise<string> {
  const path = join(live.tempDir, name);
  await writeFile(path, JSON.stringify(inputs, null, 2), 'utf8');
  return path;
}
