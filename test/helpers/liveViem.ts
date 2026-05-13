import { createPublicClient, http, type PublicClient } from 'viem';
import {
  chainIds,
  supportedChains,
  viemChains,
  type SupportedChain,
} from '../../src/contracts/addresses.js';
import { loadDotEnv } from './env.js';

loadDotEnv();

const rpcTransportOptions = {
  retryCount: 1,
  timeout: 30_000,
} as const;

export type TestRpcClientContext = {
  publicClient: PublicClient;
  chain: SupportedChain;
  chainId: number;
};

export function hasTestRpcUrl(): boolean {
  return Boolean(process.env.TEST_RPC_URL);
}

export function getTestRpcUrl(): string {
  const rpcUrl = process.env.TEST_RPC_URL;
  if (!rpcUrl) {
    throw new Error('TEST_RPC_URL is required. Set it in .env before running integration tests.');
  }
  return rpcUrl;
}

export async function detectTestChain(): Promise<SupportedChain> {
  const publicClient = createPublicClient({
    transport: http(getTestRpcUrl(), rpcTransportOptions),
  });
  const chainId = await publicClient.getChainId();
  const chain = supportedChains.find((supportedChain) => chainIds[supportedChain] === chainId);
  if (chain === undefined) {
    throw new Error(`TEST_RPC_URL returned unsupported chain id ${chainId}. Supported chain ids: ${Object.values(chainIds).join(', ')}`);
  }
  return chain;
}

export async function createTestPublicClient(): Promise<PublicClient> {
  const context = await createTestPublicClientContext();
  return context.publicClient;
}

export async function createTestPublicClientContext(): Promise<TestRpcClientContext> {
  const chain = await detectTestChain();
  const chainId = chainIds[chain];
  return {
    publicClient: createPublicClient({
      chain: viemChains[chain],
      transport: http(getTestRpcUrl(), rpcTransportOptions),
    }),
    chain,
    chainId,
  };
}
