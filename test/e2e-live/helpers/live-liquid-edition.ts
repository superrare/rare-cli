import type { Address } from 'viem';
import {
  E2E_TOKEN_URI,
  jsonCommand,
  step,
  type LiveFixture,
  type TxResult,
} from './live-harness.js';

export type DeployLiquidEditionResult = TxResult & {
  contract: Address;
  chainId: number;
  liquidEditionUrl: string;
  tokenUri: string;
  source: string;
  curves: Array<{
    tickLower: number;
    tickUpper: number;
    numPositions: number;
    shares: string;
  }>;
};

export type LiquidEditionStatusResult = {
  contract: Address;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  maxTotalSupply: string;
  poolLaunchSupply: string;
  creatorLaunchReward: string;
  baseToken: Address;
  tokenCreator: Address;
  initialTokenUri: string;
  tokenUri: string;
  renderContract: Address;
  poolManager: Address;
  pool: {
    contract: Address;
    poolId: `0x${string}`;
    poolKey: {
      currency0: Address;
      currency1: Address;
      fee: number;
      tickSpacing: number;
      hooks: Address;
    };
  };
  lpTickLower: number;
  lpTickUpper: number;
  lpLiquidity: string;
  totalLiquidity: string;
  marketState: {
    rarePerToken: string;
    tokenPerRare: string;
    sqrtPriceX96: string;
    currentTick: number;
    liquidity: string;
    currentSupply: string;
  };
  currentPrice: {
    contract: Address;
    rarePerToken: string;
    tokenPerRare: string;
  };
};

export async function deployLiquidEdition(
  live: LiveFixture,
  name: string,
  symbol: string,
  initialRareLiquidity?: string,
): Promise<DeployLiquidEditionResult> {
  const liquidityArgs = initialRareLiquidity ? ['--initial-rare-liquidity', initialRareLiquidity] : [];
  return step(`deploy Liquid Edition on ${live.chain}`, () =>
    jsonCommand<DeployLiquidEditionResult>(live.sellerHome, [
      'liquid-edition',
      'deploy',
      'multicurve',
      name,
      symbol,
      '--curves-file',
      live.curvesFile,
      '--token-uri',
      E2E_TOKEN_URI,
      '--yes',
      ...liquidityArgs,
      '--chain',
      live.chain,
    ], 300_000),
  );
}

export async function readLiquidEditionStatus(
  live: LiveFixture,
  contract: Address,
): Promise<LiquidEditionStatusResult> {
  return step(`read Liquid Edition status on ${live.chain}`, () =>
    jsonCommand<LiquidEditionStatusResult>(live.sellerHome, [
      'liquid-edition',
      'status',
      '--contract',
      contract,
      '--chain',
      live.chain,
    ], 180_000),
  );
}

export async function readLiquidEditionTokenUri(
  live: LiveFixture,
  contract: Address,
): Promise<{ contract: Address; tokenUri: string }> {
  return step(`read Liquid Edition token URI on ${live.chain}`, () =>
    jsonCommand<{ contract: Address; tokenUri: string }>(live.sellerHome, [
      'liquid-edition',
      'token-uri',
      '--contract',
      contract,
      '--chain',
      live.chain,
    ], 180_000),
  );
}
