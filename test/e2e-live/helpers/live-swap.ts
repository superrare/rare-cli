import { expect } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEther } from 'viem';
import { createRareClient } from '@rareprotocol/rare-sdk/client';
import type { LiquidRouterTokenTradeQuote, TokenTradeQuote } from '@rareprotocol/rare-sdk';
import {
  expectTx,
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

export async function encodeRareToEthSwap(live: LiveFixture, rareAmount: string): Promise<{
  amountIn: bigint;
  quote: LiquidRouterTokenTradeQuote;
  commands: `0x${string}`;
  inputsFile: string;
}> {
  const quote = requireLiquidRouterQuote(await createRareClient({ publicClient: live.publicClient }).swap.quoteSellToken({
    token: live.rareAddress,
    amountIn: parseEther(rareAmount),
    slippageBps: 50,
    route: 'local',
  }));

  return {
    amountIn: quote.amountIn,
    quote,
    commands: quote.commands,
    inputsFile: await writeInputsFile(live, 'rare-eth-swap-inputs.json', quote.inputs),
  };
}

export async function encodeEthToUsdcSwap(live: LiveFixture, ethAmount: string): Promise<{
  amountIn: bigint;
  quote: LiquidRouterTokenTradeQuote;
  commands: `0x${string}`;
  inputsFile: string;
}> {
  const quote = requireLiquidRouterQuote(await createRareClient({ publicClient: live.publicClient }).swap.quoteBuyToken({
    token: live.usdcAddress,
    amountIn: parseEther(ethAmount),
    slippageBps: 50,
    route: 'local',
  }));

  return {
    amountIn: quote.amountIn,
    quote,
    commands: quote.commands,
    inputsFile: await writeInputsFile(live, 'eth-usdc-swap-inputs.json', quote.inputs),
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

function requireLiquidRouterQuote(
  quote: TokenTradeQuote,
): LiquidRouterTokenTradeQuote {
  if (quote.execution !== 'liquid-router') {
    throw new Error(`Expected a local liquid-router quote, got ${quote.execution}.`);
  }
  return quote;
}

async function writeInputsFile(live: LiveFixture, name: string, inputs: readonly `0x${string}`[]): Promise<string> {
  const path = join(live.tempDir, name);
  await writeFile(path, JSON.stringify(inputs, null, 2), 'utf8');
  return path;
}
