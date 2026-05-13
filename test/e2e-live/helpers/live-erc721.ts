import type { Address } from 'viem';
import {
  E2E_TOKEN_URI,
  expectTx,
  jsonCommand,
  step,
  uniqueSymbol,
  uniqueTokenName,
  type LiveFixture,
  type TxResult,
} from './live-harness.js';

export type DeployErc721Result = TxResult & {
  contract: Address;
};

export type MintResult = TxResult & {
  tokenId: string;
  contract: Address;
  tokenUri: string;
};

export async function deployErc721Collection(
  live: LiveFixture,
  maxTokens = '12',
): Promise<DeployErc721Result> {
  const collection = await step(`deploy ERC-721 collection on ${live.chain}`, () =>
    jsonCommand<DeployErc721Result>(live.sellerHome, [
      'deploy',
      'erc721',
      uniqueTokenName('Rare CLI E2E'),
      uniqueSymbol('RCE'),
      '--max-tokens',
      maxTokens,
      '--chain',
      live.chain,
    ], 240_000),
  );

  expectTx(collection);
  return collection;
}

export async function mintToken(
  live: LiveFixture,
  contract: Address,
  opts: { to?: Address } = {},
): Promise<MintResult> {
  const baseArgs = [
    'mint',
    '--contract',
    contract,
    '--token-uri',
    E2E_TOKEN_URI,
    '--chain',
    live.chain,
  ];
  const args = opts.to === undefined ? baseArgs : [...baseArgs, '--to', opts.to];

  const result = await jsonCommand<MintResult>(live.sellerHome, args);

  expectTx(result);
  expectToken(result, contract);
  return result;
}

function expectToken(result: MintResult, contract: Address): void {
  if (result.contract !== contract) {
    throw new Error(`Minted token contract mismatch. Expected ${contract}, received ${result.contract}.`);
  }
  if (result.tokenUri !== E2E_TOKEN_URI) {
    throw new Error(`Minted token URI mismatch. Expected ${E2E_TOKEN_URI}, received ${result.tokenUri}.`);
  }
  if (!/^\d+$/.test(result.tokenId)) {
    throw new Error(`Minted token ID is not numeric: ${result.tokenId}`);
  }
}
