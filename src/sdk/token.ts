import { type PublicClient } from 'viem';
import { tokenAbi } from '../contracts/abis/token.js';
import { type SupportedChain } from '../contracts/addresses.js';
import { getTokenPrice as getTokenPriceApi } from './api.js';
import type { RareClient } from './types.js';
import { toInteger } from './helpers.js';

export function createTokenNamespace(
  publicClient: PublicClient,
  chain: SupportedChain,
): RareClient['token'] {
  return {
    async getContractInfo(params) {
      const [name, symbol, totalSupply] = await Promise.all([
        publicClient.readContract({
          address: params.contract,
          abi: tokenAbi,
          functionName: 'name',
        }),
        publicClient.readContract({
          address: params.contract,
          abi: tokenAbi,
          functionName: 'symbol',
        }),
        publicClient.readContract({
          address: params.contract,
          abi: tokenAbi,
          functionName: 'totalSupply',
        }),
      ]);

      return {
        contract: params.contract,
        chain,
        name,
        symbol,
        totalSupply,
      };
    },

    async getTokenInfo(params) {
      const tokenId = toInteger(params.tokenId, 'tokenId');
      const [owner, tokenUri] = await Promise.all([
        publicClient.readContract({
          address: params.contract,
          abi: tokenAbi,
          functionName: 'ownerOf',
          args: [tokenId],
        }),
        publicClient.readContract({
          address: params.contract,
          abi: tokenAbi,
          functionName: 'tokenURI',
          args: [tokenId],
        }),
      ]);

      return {
        contract: params.contract,
        tokenId,
        owner,
        tokenUri,
      };
    },

    async getPrice(symbol) {
      return getTokenPriceApi(symbol);
    },
  };
}
