/* eslint-disable no-restricted-syntax */
import { getAddress, isAddressEqual, parseUnits, type Abi, type Address } from 'viem';
import {
  E2E_TOKEN_URI,
  jsonCommand,
  step,
  type LiveFixture,
  type TxResult,
} from './live-harness.js';

export type SovereignErc20DeployKind = 'sovereign' | 'sovereign-market' | 'sovereign-market-rewards';

export type DeploySovereignErc20Params = {
  kind: SovereignErc20DeployKind;
  name: string;
  symbol: string;
  initialSupply: string;
  maxSupply?: string;
  tokenUri?: string;
  rewardToken?: 'self' | 'rare' | 'usdc';
};

export type DeploySovereignErc20Result = TxResult & {
  contract: Address;
  chainId: number;
  kind: SovereignErc20DeployKind;
  name: string;
  symbol: string;
  owner: Address;
  tokenUri: string;
  initialSupply: string;
  maxSupply: string;
  rewardToken?: Address | 'self' | 'rare' | 'usdc';
};

export type SovereignErc20OnchainState = {
  contract: Address;
  owner: Address;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  maxSupply: bigint;
  marketSupply?: bigint;
  tokenUri: string;
  rewardToken?: Address;
};

const sovereignErc20ReadAbi = [
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'name',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'maxSupply',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'tokenURI',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'tokenUri',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'rewardToken',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'marketSupply',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const satisfies Abi;

export async function deploySovereignErc20(
  live: LiveFixture,
  params: DeploySovereignErc20Params,
): Promise<DeploySovereignErc20Result> {
  const maxSupplyArgs = params.maxSupply === undefined ? [] : ['--max-supply', params.maxSupply];
  const tokenUriArgs = params.tokenUri === undefined ? [] : ['--token-uri', params.tokenUri];
  const curvesArgs = params.kind === 'sovereign' ? [] : ['--curves-file', live.curvesFile];
  const rewardTokenArgs = params.rewardToken === undefined ? [] : ['--reward-token', params.rewardToken];

  return step(`deploy Sovereign ERC20 ${params.kind} on ${live.chain}`, () =>
    jsonCommand<DeploySovereignErc20Result>(live.sellerHome, [
      'erc20',
      'deploy',
      params.name,
      params.symbol,
      '--kind',
      params.kind,
      '--initial-supply',
      params.initialSupply,
      ...maxSupplyArgs,
      ...tokenUriArgs,
      ...curvesArgs,
      ...rewardTokenArgs,
      '--chain',
      live.chain,
    ], 300_000),
  );
}

export async function readSovereignErc20OnchainState(
  live: LiveFixture,
  contract: Address,
  options: { market?: boolean; rewards?: boolean } = {},
): Promise<SovereignErc20OnchainState> {
  const [owner, name, symbol, decimals, totalSupply, maxSupply, tokenUri] = await Promise.all([
    readContractValue<Address>(live, contract, 'owner'),
    readContractValue<string>(live, contract, 'name'),
    readContractValue<string>(live, contract, 'symbol'),
    readContractValue<number>(live, contract, 'decimals'),
    readContractValue<bigint>(live, contract, 'totalSupply'),
    readContractValue<bigint>(live, contract, 'maxSupply'),
    readTokenUri(live, contract),
  ]);

  return {
    contract,
    owner: getAddress(owner),
    name,
    symbol,
    decimals,
    totalSupply,
    maxSupply,
    marketSupply: options.market || options.rewards ? await readContractValue<bigint>(live, contract, 'marketSupply') : undefined,
    tokenUri,
    rewardToken: options.rewards ? await readContractValue<Address>(live, contract, 'rewardToken') : undefined,
  };
}

export function expectedSupply(amount: string): bigint {
  return parseUnits(amount, 18);
}

export function expectedTokenUri(value: string | undefined): string {
  return value?.trim() ?? '';
}

export function assertCommonSovereignErc20State(
  state: SovereignErc20OnchainState,
  deployed: DeploySovereignErc20Result,
  live: LiveFixture,
  params: DeploySovereignErc20Params,
): void {
  if (!isAddressEqual(state.contract, deployed.contract)) {
    throw new Error(`Expected ERC20 state for ${deployed.contract}, received ${state.contract}.`);
  }
  if (!isAddressEqual(state.owner, live.sellerAddress)) {
    throw new Error(`Expected ERC20 owner ${live.sellerAddress}, received ${state.owner}.`);
  }
  if (state.name !== params.name) {
    throw new Error(`Expected ERC20 name "${params.name}", received "${state.name}".`);
  }
  if (state.symbol !== params.symbol) {
    throw new Error(`Expected ERC20 symbol "${params.symbol}", received "${state.symbol}".`);
  }
  if (state.decimals !== 18) {
    throw new Error(`Expected ERC20 decimals 18, received ${state.decimals}.`);
  }
  const requestedSupply = expectedSupply(params.initialSupply);
  if (params.kind === 'sovereign') {
    if (state.totalSupply !== requestedSupply) {
      throw new Error(`Expected ERC20 total supply ${requestedSupply}, received ${state.totalSupply}.`);
    }
    if (state.maxSupply !== (params.maxSupply === undefined ? 0n : expectedSupply(params.maxSupply))) {
      throw new Error(`Expected ERC20 max supply ${params.maxSupply ?? '0'}, received ${state.maxSupply}.`);
    }
  } else {
    if (state.totalSupply <= 0n || state.totalSupply > requestedSupply) {
      throw new Error(`Expected ERC20 market total supply in range 1..${requestedSupply}, received ${state.totalSupply}.`);
    }
    if (state.maxSupply !== requestedSupply) {
      throw new Error(`Expected ERC20 market max supply ${requestedSupply}, received ${state.maxSupply}.`);
    }
    if (state.marketSupply !== state.totalSupply) {
      throw new Error(`Expected ERC20 market supply ${state.totalSupply}, received ${String(state.marketSupply)}.`);
    }
  }
  if (state.tokenUri !== expectedTokenUri(params.tokenUri)) {
    throw new Error(`Expected ERC20 token URI "${expectedTokenUri(params.tokenUri)}", received "${state.tokenUri}".`);
  }
}

export function defaultMarketTokenUri(kind: SovereignErc20DeployKind): string | undefined {
  return kind === 'sovereign' ? undefined : E2E_TOKEN_URI;
}

export function expectedRewardToken(
  live: LiveFixture,
  rewardToken: DeploySovereignErc20Params['rewardToken'],
  deployedContract: Address,
): Address {
  if (rewardToken === 'rare') return live.rareAddress;
  if (rewardToken === 'usdc') return live.usdcAddress;
  return deployedContract;
}

async function readTokenUri(live: LiveFixture, contract: Address): Promise<string> {
  try {
    return await readContractValue<string>(live, contract, 'tokenURI');
  } catch {
    return readContractValue<string>(live, contract, 'tokenUri');
  }
}

async function readContractValue<TResult>(
  live: LiveFixture,
  contract: Address,
  functionName:
    | 'owner'
    | 'name'
    | 'symbol'
    | 'decimals'
    | 'totalSupply'
    | 'maxSupply'
    | 'marketSupply'
    | 'tokenURI'
    | 'tokenUri'
    | 'rewardToken',
): Promise<TResult> {
  return live.publicClient.readContract({
    address: contract,
    abi: sovereignErc20ReadAbi,
    functionName,
  }) as Promise<TResult>;
}
