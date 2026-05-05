import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { loadDotEnv } from '../e2e-live/env.mjs';

loadDotEnv();

export function getTestRpcUrl(): string {
  const rpcUrl = process.env.TEST_RPC_URL;
  if (!rpcUrl) {
    throw new Error('TEST_RPC_URL is required. Set it in .env before running integration tests.');
  }
  return rpcUrl;
}

export function createTestSepoliaPublicClient() {
  return createPublicClient({
    chain: sepolia,
    transport: http(getTestRpcUrl(), {
      retryCount: 1,
      timeout: 30_000,
    }),
  });
}
