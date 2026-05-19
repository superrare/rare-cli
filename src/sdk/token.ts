import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  type PublicClient,
} from 'viem';
import { tokenAbi } from '../contracts/abis/token.js';
import { type SupportedChain } from '../contracts/addresses.js';
import { getTokenPrice as getTokenPriceApi } from './api.js';
import type { RareClient, TokenContractInfo, TokenInfo } from './types.js';
import { toInteger } from './helpers.js';

export function createTokenNamespace(
  publicClient: PublicClient,
  chain: SupportedChain,
): RareClient['token'] {
  return {
    async status(params): ReturnType<RareClient['token']['status']> {
      const contract = await readContractInfo(publicClient, chain, params.contract);
      const token = params.tokenId === undefined
        ? undefined
        : await readTokenInfo(publicClient, params.contract, params.tokenId);

      return token === undefined ? { contract } : { contract, token };
    },

    async getPrice(symbol): ReturnType<RareClient['token']['getPrice']> {
      return getTokenPriceApi(symbol);
    },
  };
}

async function readContractInfo(
  publicClient: PublicClient,
  chain: SupportedChain,
  contract: `0x${string}`,
): Promise<TokenContractInfo> {
  const [name, symbol, totalSupply] = await Promise.all([
    publicClient.readContract({
      address: contract,
      abi: tokenAbi,
      functionName: 'name',
    }),
    publicClient.readContract({
      address: contract,
      abi: tokenAbi,
      functionName: 'symbol',
    }),
    readOptionalTotalSupply(publicClient, contract),
  ]);

  return {
    contract,
    chain,
    name,
    symbol,
    totalSupply,
  };
}

async function readTokenInfo(
  publicClient: PublicClient,
  contract: `0x${string}`,
  tokenIdInput: NonNullable<Parameters<RareClient['token']['status']>[0]['tokenId']>,
): Promise<TokenInfo> {
  const tokenId = toInteger(tokenIdInput, 'tokenId');
  const [owner, tokenUri] = await Promise.all([
    publicClient.readContract({
      address: contract,
      abi: tokenAbi,
      functionName: 'ownerOf',
      args: [tokenId],
    }),
    publicClient.readContract({
      address: contract,
      abi: tokenAbi,
      functionName: 'tokenURI',
      args: [tokenId],
    }),
  ]);

  return {
    contract,
    tokenId,
    owner,
    tokenUri,
  };
}

async function readOptionalTotalSupply(
  publicClient: PublicClient,
  contract: `0x${string}`,
): Promise<bigint | null> {
  try {
    return await publicClient.readContract({
      address: contract,
      abi: tokenAbi,
      functionName: 'totalSupply',
    });
  } catch (error) {
    if (isUnavailableContractFunction(error)) {
      return null;
    }

    throw error;
  }
}

function isUnavailableContractFunction(error: unknown): boolean {
  if (!(error instanceof ContractFunctionExecutionError)) {
    return false;
  }

  return (
    error.cause instanceof ContractFunctionRevertedError ||
    error.cause instanceof ContractFunctionZeroDataError
  );
}
