import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPublicClient, http, zeroAddress, type Address, type PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect } from 'vitest';
import {
  chainIds,
  supportedChains,
  viemChains,
  type SupportedChain,
} from '../../src/contracts/addresses.js';
import { parseAddress, parseHexString } from '../../src/sdk/validation.js';
import { parseJsonStdout, runCli } from '../helpers/cli.js';
import { loadDotEnv, missingLiveEnv } from './env.mjs';

loadDotEnv();

export const describeLive = missingLiveEnv().length === 0 ? describe.sequential : describe.skip;

export type TxResult = {
  txHash: string;
  blockNumber: string;
  approvalTxHash?: string | null;
};

export async function configureLiveHome(home: string, privateKey: `0x${string}`, chain: SupportedChain): Promise<void> {
  const result = await runCli([
    'configure',
    '--default-chain',
    chain,
    '--chain',
    chain,
    '--private-key',
    privateKey,
    '--rpc-url',
    liveRpcUrl(),
  ], { home });

  expect(result.code).toBe(0);
  expect(result.stderr).toBe('');
  await writeFile(liveAccountPath(home), privateKeyToAccount(privateKey).address);
}

export async function jsonCommand<T>(home: string, args: string[], timeoutMs = 180_000): Promise<T> {
  const label = `rare ${args.join(' ')}`;
  return retryNonceConflict(label, async () => {
    const run = async (): Promise<T> => parseJsonStdout<T>(await runCli(['--json', ...args], { home, timeoutMs }));
    if (!isLiveWriteCommand(args)) {
      return run();
    }
    return withLiveTransactionLock(await readLiveAccount(home), label, run);
  });
}

export function expectTx(result: TxResult): void {
  expect(result.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  expect(result.blockNumber).toMatch(/^\d+$/);
}

export async function detectLiveChain(): Promise<SupportedChain> {
  const publicClient = createPublicClient({ transport: http(liveRpcUrl()) });
  const chainId = await publicClient.getChainId();
  const chain = supportedChains.find((supportedChain) => chainIds[supportedChain] === chainId);
  if (!chain) {
    throw new Error(`TEST_RPC_URL returned unsupported chain id ${chainId}. Supported chain ids: ${Object.values(chainIds).join(', ')}`);
  }
  return chain;
}

export function createLivePublicClient(chain: SupportedChain): PublicClient {
  return createPublicClient({
    chain: viemChains[chain],
    transport: http(liveRpcUrl()),
  });
}

export function livePrivateKey(name: 'E2E_SELLER_PRIVATE_KEY' | 'E2E_BUYER_PRIVATE_KEY'): `0x${string}` {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set to a 0x-prefixed private key.`);
  }
  return parseHexString(value, name);
}

export async function createTempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'rare-cli-live-e2e-home-'));
}

export async function cleanupTempHome(home: string | undefined): Promise<void> {
  if (!home) return;
  await rm(home, { recursive: true, force: true });
}

export async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  console.error(`[live e2e] ${label}`);
  return fn();
}

export async function retryNonceConflict<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const attempts = liveNonceRetryAttempts();
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isNonceConflict(error)) {
        throw error;
      }

      const delayMs = 1_000 * attempt;
      console.error(`[live e2e] retry nonce conflict for ${label} (${attempt + 1}/${attempts})`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

export async function withLiveTransactionLock<T>(account: Address, label: string, fn: () => Promise<T>): Promise<T> {
  const lockPath = liveTransactionLockPath(account);
  const start = Date.now();

  while (true) {
    try {
      await mkdir(lockPath);
      break;
    } catch (error) {
      if (!isPathExistsError(error)) {
        throw error;
      }
      await clearStaleTransactionLock(lockPath);
      if (Date.now() - start > liveTransactionLockTimeoutMs()) {
        throw new Error(`Timed out waiting for live E2E transaction lock for ${label}`);
      }
      await sleep(500);
    }
  }

  try {
    return await fn();
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

function isNonceConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return [
    /nonce too low/i,
    /nonce too high/i,
    /nonce has already been used/i,
    /nonce is too low/i,
    /replacement transaction underpriced/i,
    /future transaction tries to replace pending/i,
    /invalid transaction nonce/i,
    /account sequence mismatch/i,
  ].some((pattern) => pattern.test(message));
}

function isLiveWriteCommand(args: string[]): boolean {
  const [command, subcommand] = args;
  if (command === 'deploy' || command === 'mint') return true;
  if (command === 'listing') {
    if (subcommand === 'create' || subcommand === 'cancel' || subcommand === 'buy') return true;
    if (subcommand !== 'release') return false;
    const releaseSubcommand = args[2];
    if (releaseSubcommand === 'configure') return true;
    if (releaseSubcommand === 'mint') return true;
    if (releaseSubcommand === 'allowlist') return args[3] === 'set';
    if (releaseSubcommand === 'limits') return args[3]?.startsWith('set-') === true;
    return false;
  }
  if (command === 'auction') {
    return subcommand === 'create' || subcommand === 'cancel' || subcommand === 'bid' || subcommand === 'settle';
  }
  if (command === 'offer') return subcommand === 'create' || subcommand === 'cancel' || subcommand === 'accept';
  if (command === 'collection') {
    if (subcommand === 'create' || subcommand === 'mint-batch' || subcommand === 'prepare-lazy-mint') return true;
    if (subcommand === 'metadata') {
      const metadataSubcommand = args[2];
      return metadataSubcommand === 'update-base-uri' ||
        metadataSubcommand === 'update-token-uri' ||
        metadataSubcommand === 'lock-base-uri';
    }
    if (subcommand === 'royalty') {
      const royaltySubcommand = args[2];
      if (royaltySubcommand === 'set-default-receiver' || royaltySubcommand === 'set-token-receiver') return true;
      if (royaltySubcommand === 'registry') return args[3]?.startsWith('set-') === true;
    }
    return false;
  }
  return false;
}

export function liveRpcUrl(): string {
  const value = process.env.TEST_RPC_URL;
  if (!value) {
    throw new Error('TEST_RPC_URL must be set.');
  }
  return value;
}

function liveNonceRetryAttempts(): number {
  const attempts = Number.parseInt(process.env.E2E_NONCE_RETRY_ATTEMPTS ?? '3', 10);
  return Number.isFinite(attempts) && attempts > 0 ? attempts : 3;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readLiveAccount(home: string): Promise<Address> {
  try {
    return parseAddress((await readFile(liveAccountPath(home), 'utf8')).trim(), 'live account');
  } catch {
    return zeroAddress;
  }
}

async function clearStaleTransactionLock(lockPath: string): Promise<void> {
  try {
    const lockStat = await stat(lockPath);
    if (Date.now() - lockStat.mtimeMs > liveTransactionLockStaleMs()) {
      await rm(lockPath, { recursive: true, force: true });
    }
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
}

function liveAccountPath(home: string): string {
  return join(home, '.rare-cli-live-account');
}

function liveTransactionLockPath(account: Address): string {
  return join(tmpdir(), `rare-cli-live-e2e-${account.toLowerCase()}.lock`);
}

function liveTransactionLockTimeoutMs(): number {
  const timeout = Number.parseInt(process.env.E2E_TX_LOCK_TIMEOUT_MS ?? '600000', 10);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 600_000;
}

function liveTransactionLockStaleMs(): number {
  const timeout = Number.parseInt(process.env.E2E_TX_LOCK_STALE_MS ?? '600000', 10);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 600_000;
}

function isPathExistsError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
