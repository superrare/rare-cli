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

export async function deployLiquidEdition(
  live: LiveFixture,
  name: string,
  symbol: string,
  initialRareLiquidity?: string,
): Promise<DeployLiquidEditionResult> {
  const liquidityArgs = initialRareLiquidity ? ['--initial-rare-liquidity', initialRareLiquidity] : [];
  return step(`deploy Liquid Edition on ${live.chain}`, () =>
    jsonCommand<DeployLiquidEditionResult>(live.sellerHome, [
      'deploy',
      'liquid-edition',
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
