import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddressEqual,
  type Address,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  chainIds,
  supportedChains,
  viemChains,
  type SupportedChain,
} from '../../../src/contracts/addresses.js';
import { createRareClient } from '../../../src/sdk/client.js';
import type { RareClient } from '../../../src/sdk/types.js';
import {
  releaseLiveWallets,
  reserveLiveWalletPair,
  type LiveWalletPairLease,
} from '../../e2e-live/helpers/live-wallet-pool.js';
import { loadDotEnv } from '../../helpers/env.js';

loadDotEnv();

const describeFork = hasForkEnv() ? describe.sequential : describe.skip;
const localForkRpcUrl = 'http://127.0.0.1:8545';
const localForkHost = '127.0.0.1';
const localForkPort = '8545';
const localForkStartupTimeoutMs = 30_000;
const tokenUri = 'ipfs://bafybeidznwopf6bnfakqbertnhohgh65usqlo7bhnehycurg4xmc5ebnm4/fork-sdk.json';

describeFork('SDK fork integration: batch offers', () => {
  it('creates, reads, revokes, and accepts batch offers through the SDK directly', async (ctx) => {
    const fork = await startLocalFork();
    if ('skipReason' in fork) {
      ctx.skip(fork.skipReason);
      return;
    }

    const publicClient = createForkPublicClient();
    const snapshotId = await createForkSnapshot(publicClient);
    let walletPair: LiveWalletPairLease | undefined;

    try {
      const chain = await detectForkChain(publicClient);
      walletPair = await reserveLiveWalletPair(chain);
      const seller = createForkRareClient(chain, walletPair.sellerWallet.privateKey);
      const buyer = createForkRareClient(chain, walletPair.buyerWallet.privateKey);

      const collection = await seller.rare.deploy.erc721({
        name: `Rare SDK Fork Batch ${Date.now().toString(36)}`,
        symbol: 'RSFB',
        maxTokens: 4,
      });
      expect(collection.contract).toMatch(/^0x[0-9a-fA-F]{40}$/);

      const tokens = [
        await mintToken(seller.rare, collection.contract),
        await mintToken(seller.rare, collection.contract),
        await mintToken(seller.rare, collection.contract),
        await mintToken(seller.rare, collection.contract),
      ] as const;

      const revokeTree = seller.rare.batch.buildTree({
        content: JSON.stringify([
          { contractAddress: collection.contract, tokenId: tokens[0] },
          { contractAddress: collection.contract, tokenId: tokens[1] },
        ]),
        format: 'json',
        chainId: chainIds[chain],
      });
      const expiry = Math.floor(Date.now() / 1000) + 3_600;
      const created = await buyer.rare.batch.offer.create({
        root: revokeTree.root,
        amount: '0.000001',
        expiry,
      });
      expect(created.creator).toBe(buyer.account);
      expect(created.root).toBe(revokeTree.root);

      const active = await seller.rare.batch.offer.getStatus({
        creator: buyer.account,
        root: revokeTree.root,
      });
      expect(active.state).toBe('ACTIVE');
      expect(active.fillable).toBe(true);

      const revoked = await buyer.rare.batch.offer.revoke({ root: revokeTree.root });
      expect(revoked.root).toBe(revokeTree.root);
      const revokedStatus = await seller.rare.batch.offer.getStatus({
        creator: buyer.account,
        root: revokeTree.root,
      });
      expect(revokedStatus.state).toBe('NONE');
      expect(revokedStatus.revoked).toBeNull();
      expect(revokedStatus.fillable).toBe(false);

      const acceptTree = seller.rare.batch.buildTree({
        content: JSON.stringify([
          { contractAddress: collection.contract, tokenId: tokens[2] },
          { contractAddress: collection.contract, tokenId: tokens[3] },
        ]),
        format: 'json',
        chainId: chainIds[chain],
      });
      const proof = seller.rare.batch.getTreeProof({
        artifact: acceptTree,
        contractAddress: collection.contract,
        tokenId: tokens[2],
        chainId: chainIds[chain],
      });

      await buyer.rare.batch.offer.create({
        root: acceptTree.root,
        amount: '0.000001',
        expiry,
      });
      const accepted = await seller.rare.batch.offer.accept({
        creator: buyer.account,
        root: proof.root,
        proof: proof.proof,
        contract: collection.contract,
        tokenId: tokens[2],
      });
      expect(accepted.seller).toBe(seller.account);
      expect(accepted.buyer).toBe(buyer.account);
      expect(accepted.root).toBe(acceptTree.root);

      const token = await buyer.rare.token.getTokenInfo({
        contract: collection.contract,
        tokenId: tokens[2],
      });
      expect(isAddressEqual(token.owner, buyer.account)).toBe(true);
    } finally {
      await releaseLiveWallets([walletPair?.sellerWallet, walletPair?.buyerWallet]);
      await revertForkSnapshot(publicClient, snapshotId);
      await fork.stop();
    }
  }, 240_000);
});

type ForkRareClient = {
  account: Address;
  rare: RareClient;
};

function hasForkEnv(): boolean {
  return Boolean(
    process.env.E2E_SELLER_PRIVATE_KEYS &&
      process.env.E2E_BUYER_PRIVATE_KEYS,
  );
}

function createForkPublicClient(chain?: SupportedChain): PublicClient {
  const transport = http(localForkRpcUrl, {
    retryCount: 1,
    timeout: 30_000,
  });

  return chain === undefined
    ? createPublicClient({ transport })
    : createPublicClient({ chain: viemChains[chain], transport });
}

function createForkRareClient(
  chain: SupportedChain,
  privateKey: `0x${string}`,
): ForkRareClient {
  const account = privateKeyToAccount(privateKey);
  const publicClient = createForkPublicClient(chain);
  const walletClient: WalletClient = createWalletClient({
    account,
    chain: viemChains[chain],
    transport: http(localForkRpcUrl),
  });
  return {
    account: account.address,
    rare: createRareClient({ publicClient, walletClient }),
  };
}

async function detectForkChain(publicClient: PublicClient): Promise<SupportedChain> {
  const chainId = await publicClient.getChainId();
  const chain = supportedChains.find((candidate) => chainIds[candidate] === chainId);
  if (chain === undefined) {
    throw new Error(`Local fork RPC returned unsupported chain id ${chainId}.`);
  }
  return chain;
}

async function mintToken(rare: RareClient, contract: Address): Promise<string> {
  const minted = await rare.mint.mintTo({ contract, tokenUri });
  return minted.tokenId.toString();
}

type LocalFork = {
  readonly stop: () => Promise<void>;
};

type LocalForkStartResult = LocalFork | {
  readonly skipReason: string;
};

async function startLocalFork(): Promise<LocalForkStartResult> {
  if (await isLocalForkReady()) {
    return {
      stop: async (): Promise<void> => {},
    };
  }

  const forkUrl = process.env.TEST_RPC_URL?.trim();
  if (!forkUrl) {
    return {
      skipReason: 'TEST_RPC_URL is required as the upstream RPC for the local Anvil fork.',
    };
  }

  const output = createProcessOutputBuffer();
  const child = spawn('anvil', [
    '--host',
    localForkHost,
    '--port',
    localForkPort,
    '--fork-url',
    forkUrl,
  ], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', output.append);
  child.stderr.on('data', output.append);

  let spawnError: Error | undefined;
  child.once('error', (error) => {
    spawnError = error;
  });

  const deadline = Date.now() + localForkStartupTimeoutMs;
  while (Date.now() < deadline) {
    if (spawnError !== undefined) {
      if (isCommandNotFoundError(spawnError)) {
        return {
          skipReason: 'Anvil is required for SDK fork integration tests but was not found on PATH.',
        };
      }
      throw spawnError;
    }

    if (child.exitCode !== null) {
      throw new Error(`Anvil exited before the local fork was ready.\n${output.read()}`);
    }

    if (await isLocalForkReady()) {
      return {
        stop: async (): Promise<void> => {
          await stopProcess(child);
        },
      };
    }

    await sleep(250);
  }

  await stopProcess(child);
  throw new Error(`Timed out waiting for Anvil local fork at ${localForkRpcUrl}.\n${output.read()}`);
}

async function isLocalForkReady(): Promise<boolean> {
  try {
    const response = await fetch(localForkRpcUrl, {
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(1_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function createForkSnapshot(publicClient: PublicClient): Promise<string> {
  try {
    const snapshotId = await publicClient.request({
      method: 'evm_snapshot',
      params: [],
    });
    if (typeof snapshotId !== 'string') {
      throw new Error(`evm_snapshot returned ${typeof snapshotId}`);
    }
    return snapshotId;
  } catch (error) {
    throw new Error(
      `SDK fork integration requires the local fork RPC at ${localForkRpcUrl} to support evm_snapshot.`,
      { cause: error },
    );
  }
}

async function revertForkSnapshot(publicClient: PublicClient, snapshotId: string): Promise<void> {
  const reverted = await publicClient.request({
    method: 'evm_revert',
    params: [snapshotId],
  });
  if (reverted !== true) {
    throw new Error('Failed to revert SDK fork integration snapshot.');
  }
}

function createProcessOutputBuffer(): {
  readonly append: (chunk: string) => void;
  readonly read: () => string;
} {
  let output = '';
  return {
    append: (chunk: string): void => {
      output = `${output}${chunk}`.slice(-8_000);
    },
    read: (): string => output.trim(),
  };
}

async function stopProcess(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  const closed = await waitForClose(child, 5_000);
  if (!closed) {
    child.kill('SIGKILL');
    await waitForClose(child, 5_000);
  }
}

async function waitForClose(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return true;
  }

  return await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    const close = (): void => {
      cleanup();
      resolve(true);
    };
    const cleanup = (): void => {
      clearTimeout(timeout);
      child.off('close', close);
    };
    child.once('close', close);
  });
}

function isCommandNotFoundError(error: Error): boolean {
  return 'code' in error && error.code === 'ENOENT';
}
