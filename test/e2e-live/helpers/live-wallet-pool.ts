import { mkdir, rm, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address } from 'viem';
import { parseHexString } from '../../../src/sdk/validation.js';
import { chainIds, type SupportedChain } from '../../../src/contracts/addresses.js';

export type LiveWalletRole = 'seller' | 'buyer';

export type LiveWalletLease = {
  role: LiveWalletRole;
  privateKey: `0x${string}`;
  address: Address;
  release: () => Promise<void>;
};

export type LiveWalletPairLease = {
  sellerWallet: LiveWalletLease;
  buyerWallet: LiveWalletLease;
};

export async function reserveLiveWallet(role: LiveWalletRole, chain: SupportedChain): Promise<LiveWalletLease> {
  const candidates = livePrivateKeys(role);
  const start = Date.now();
  let waitingLogged = false;

  while (true) {
    for (const privateKey of candidates) {
      const lease = await tryReserveLiveWallet(role, chain, privateKey);
      if (lease !== undefined) {
        return lease;
      }
    }

    if (Date.now() - start > liveWalletLeaseTimeoutMs()) {
      throw new Error(
        `Timed out waiting for an available ${role} live E2E wallet. ` +
        `Configured ${candidates.length} ${role} wallet(s); add more keys or raise E2E_WALLET_LEASE_TIMEOUT_MS.`,
      );
    }

    if (!waitingLogged) {
      console.error(
        `[live e2e] waiting for available ${role} live wallet ` +
          `(${candidates.length} configured, timeout ${liveWalletLeaseTimeoutMs()}ms)`,
      );
      waitingLogged = true;
    }
    await sleep(liveWalletLeasePollMs());
  }
}

export async function reserveLiveWalletPair(chain: SupportedChain): Promise<LiveWalletPairLease> {
  const sellerCandidates = livePrivateKeys('seller');
  const buyerCandidates = livePrivateKeys('buyer');
  const start = Date.now();
  let waitingLogged = false;

  while (true) {
    for (const sellerPrivateKey of sellerCandidates) {
      const sellerWallet = await tryReserveLiveWallet('seller', chain, sellerPrivateKey);
      if (sellerWallet === undefined) {
        continue;
      }

      let buyerWallet: LiveWalletLease | undefined;
      try {
        for (const buyerPrivateKey of buyerCandidates) {
          buyerWallet = await tryReserveLiveWallet('buyer', chain, buyerPrivateKey);
          if (buyerWallet !== undefined) {
            return { sellerWallet, buyerWallet };
          }
        }
      } finally {
        if (buyerWallet === undefined) {
          await sellerWallet.release();
        }
      }
    }

    if (Date.now() - start > liveWalletLeaseTimeoutMs()) {
      throw new Error(
        'Timed out waiting for available seller and buyer live E2E wallets. ' +
          `Configured ${sellerCandidates.length} seller wallet(s) and ${buyerCandidates.length} buyer wallet(s); ` +
          'add more keys or raise E2E_WALLET_LEASE_TIMEOUT_MS.',
      );
    }

    if (!waitingLogged) {
      console.error(
        '[live e2e] waiting for available seller and buyer live wallets ' +
          `(${sellerCandidates.length} seller configured, ${buyerCandidates.length} buyer configured, ` +
          `timeout ${liveWalletLeaseTimeoutMs()}ms)`,
      );
      waitingLogged = true;
    }
    await sleep(liveWalletLeasePollMs());
  }
}

export async function releaseLiveWallets(leases: readonly (LiveWalletLease | undefined)[]): Promise<void> {
  await Promise.all(leases.map(async (lease) => {
    await lease?.release();
  }));
}

function livePrivateKeys(role: LiveWalletRole): `0x${string}`[] {
  const pluralName = role === 'seller' ? 'E2E_SELLER_PRIVATE_KEYS' : 'E2E_BUYER_PRIVATE_KEYS';
  const rawPool = process.env[pluralName];
  const rawKeys = rawPool === undefined || rawPool.trim() === ''
    ? []
    : rawPool.split(/[\s,]+/).filter((value) => value.trim() !== '');

  const keys = rawKeys.map((value, index) => parseHexString(value, `${pluralName}[${index}]`));
  if (keys.length === 0) {
    throw new Error(`${pluralName} must provide at least one 0x-prefixed private key.`);
  }

  return uniqueKeys(keys);
}

function uniqueKeys(keys: readonly `0x${string}`[]): `0x${string}`[] {
  return keys.reduce<`0x${string}`[]>(
    (unique, key) => unique.some((existing) => existing.toLowerCase() === key.toLowerCase())
      ? unique
      : [...unique, key],
    [],
  );
}

async function tryReserveLiveWallet(
  role: LiveWalletRole,
  chain: SupportedChain,
  privateKey: `0x${string}`,
): Promise<LiveWalletLease | undefined> {
  const address = privateKeyToAccount(privateKey).address;
  const lockPath = liveWalletLeasePath(chain, address);

  try {
    await mkdir(lockPath);
    const heartbeat = createLiveWalletLeaseHeartbeat(lockPath);
    return {
      role,
      privateKey,
      address,
      release: async (): Promise<void> => {
        clearInterval(heartbeat);
        await rm(lockPath, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (!isPathExistsError(error)) {
      throw error;
    }
    await clearStaleWalletLease(lockPath);
    return undefined;
  }
}

function liveWalletLeasePath(chain: SupportedChain, address: Address): string {
  return join(tmpdir(), `rare-cli-live-e2e-wallet-${chainIds[chain]}-${address.toLowerCase()}.lock`);
}

async function clearStaleWalletLease(lockPath: string): Promise<void> {
  try {
    const lockStat = await stat(lockPath);
    if (Date.now() - lockStat.mtimeMs > liveWalletLeaseStaleMs()) {
      await rm(lockPath, { recursive: true, force: true });
    }
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
}

function liveWalletLeaseTimeoutMs(): number {
  const timeout = Number.parseInt(process.env.E2E_WALLET_LEASE_TIMEOUT_MS ?? '3600000', 10);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 3_600_000;
}

function liveWalletLeaseStaleMs(): number {
  const timeout = Number.parseInt(process.env.E2E_WALLET_LEASE_STALE_MS ?? '3600000', 10);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 3_600_000;
}

function liveWalletLeasePollMs(): number {
  const timeout = Number.parseInt(process.env.E2E_WALLET_LEASE_POLL_MS ?? '500', 10);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 500;
}

function isPathExistsError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function createLiveWalletLeaseHeartbeat(lockPath: string): NodeJS.Timeout {
  const interval = setInterval(() => {
    const now = new Date();
    void utimes(lockPath, now, now).catch(() => {
      // The lease may have been released between heartbeat ticks.
    });
  }, liveWalletLeaseHeartbeatMs());
  interval.unref();
  return interval;
}

function liveWalletLeaseHeartbeatMs(): number {
  return Math.max(1_000, Math.min(60_000, Math.floor(liveWalletLeaseStaleMs() / 3)));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
