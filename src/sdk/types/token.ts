import type { Address } from 'viem';
import type { SupportedChain } from '../../contracts/addresses.js';
import type { IntegerInput } from './common.js';

export type TokenContractInfo = {
  contract: Address;
  chain: SupportedChain;
  name: string;
  symbol: string;
  totalSupply: bigint | null;
}

export type TokenInfo = {
  contract: Address;
  tokenId: bigint;
  owner: Address;
  tokenUri: string;
}

export type TokenStatus = {
  contract: TokenContractInfo;
  token?: TokenInfo;
}

export type TokenNamespace = {
  status: (params: { contract: Address; tokenId?: IntegerInput }) => Promise<TokenStatus>;
  getPrice: (symbol: string) => Promise<{ symbol: string; priceUsd: number; decimals: number; chainId: number; address: string }>;
}
