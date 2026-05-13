import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { getContractAddresses } from '../../src/contracts/addresses.js';
import { parseJsonStdout, runCli } from '../helpers/cli.js';
import { loadDotEnv } from './env.mjs';

loadDotEnv();

const requiredEnv = [
  'TEST_RPC_URL',
  'E2E_SELLER_PRIVATE_KEY',
] as const;

const missingEnv = requiredEnv.filter((name) => !process.env[name]);
const describeLive = missingEnv.length === 0 ? describe.sequential : describe.skip;

// Runtime dispatches owner() and mintTo(address). Creation code injects the seller as owner.
const releaseFixtureRuntimePrefix = '60003560e01c80638da5cb5b14601f578063755edd1714603d5760006000fd5b73';
const releaseFixtureRuntimeSuffix = '60005260206000f35b600160005260206000f3';

type TxResult = {
  txHash: string;
  blockNumber: string;
};

type ReleaseAllowlistSetResult = TxResult & {
  config: {
    rareMinter: Address;
    contract: Address;
    root: `0x${string}`;
    endTimestamp: string;
    active: boolean;
  };
};

type ReleaseLimitSetResult = TxResult & {
  config: {
    rareMinter: Address;
    contract: Address;
    limit: string;
    enabled: boolean;
  };
};

type LiveState = {
  sellerHome: string;
  sellerAddress: Address;
  releaseContract: Address;
};

let live: LiveState;

describeLive('live Sepolia RareMinter release settings', () => {
  beforeAll(async () => {
    const sellerHome = await createTempHome();
    const sellerAddress = privateKeyToAccount(livePrivateKey()).address;

    try {
      await step('configure seller wallet', () => configureLiveHome(sellerHome, process.env.E2E_SELLER_PRIVATE_KEY!));
      const releaseContract = await step('deploy RareMinter release fixture contract', () =>
        deployReleaseFixtureContract(livePrivateKey(), sellerAddress),
      );

      live = {
        sellerHome,
        sellerAddress,
        releaseContract,
      };
    } catch (error) {
      await cleanupTempHome(sellerHome);
      throw error;
    }
  });

  afterAll(async () => {
    await cleanupTempHome(live?.sellerHome);
  });

  it('configures release allowlist', async () => {
    const contract = live.releaseContract;
    const rareMinter = getContractAddresses('sepolia').rareMinter!;
    const endTimestamp = Math.floor(Date.now() / 1000) + 3_600;
    const allowlistCsv = join(live.sellerHome, 'release-allowlist.csv');
    const allowlistArtifact = join(live.sellerHome, 'release-allowlist-artifact.json');
    const extraWallet = '0x0000000000000000000000000000000000000002';

    await writeFile(
      allowlistCsv,
      `wallet\n${live.sellerAddress}\n${extraWallet}\n`,
      'utf8',
    );

    const artifactBuild = await step('build release allowlist artifact', () =>
      jsonCommand<{ artifact: { root: `0x${string}`; wallets: unknown[] }; outputPath: string }>(live.sellerHome, [
        'listing',
        'release',
        'allowlist',
        'build',
        '--input',
        allowlistCsv,
        '--output',
        allowlistArtifact,
      ]),
    );
    expect(artifactBuild.artifact.root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(artifactBuild.artifact.wallets).toHaveLength(2);
    expect(artifactBuild.outputPath).toBe(allowlistArtifact);

    const allowlist = await step('set release allowlist config', () =>
      jsonCommand<ReleaseAllowlistSetResult>(live.sellerHome, [
        'listing',
        'release',
        'allowlist',
        'set',
        '--contract',
        contract,
        '--input',
        allowlistArtifact,
        '--end-timestamp',
        endTimestamp.toString(),
        '--chain',
        'sepolia',
      ], 240_000),
    );
    expectTx(allowlist);
    expect(allowlist.config.rareMinter).toBe(rareMinter);
    expect(allowlist.config.contract.toLowerCase()).toBe(contract.toLowerCase());
    expect(allowlist.config.root).toBe(artifactBuild.artifact.root);
    expect(allowlist.config.endTimestamp).toBe(endTimestamp.toString());
    expect(allowlist.config.active).toBe(true);

    const status = await jsonCommand<{
      allowlistRoot: `0x${string}`;
      allowlistEndTimestamp: string;
    }>(live.sellerHome, [
      'listing',
      'release',
      'status',
      '--contract',
      contract,
      '--chain',
      'sepolia',
    ]);

    expect(status.allowlistRoot).toBe(artifactBuild.artifact.root);
    expect(status.allowlistEndTimestamp).toBe(endTimestamp.toString());
  });

  it('configures release mint limit', async () => {
    const contract = live.releaseContract;
    const rareMinter = getContractAddresses('sepolia').rareMinter!;

    const mintLimit = await step('set release mint limit', () =>
      jsonCommand<ReleaseLimitSetResult>(live.sellerHome, [
        'listing',
        'release',
        'limits',
        'set-mint',
        '--contract',
        contract,
        '--limit',
        '2',
        '--chain',
        'sepolia',
      ], 240_000),
    );
    expectTx(mintLimit);
    expect(mintLimit.config.rareMinter).toBe(rareMinter);
    expect(mintLimit.config.contract.toLowerCase()).toBe(contract.toLowerCase());
    expect(mintLimit.config.limit).toBe('2');
    expect(mintLimit.config.enabled).toBe(true);

    const status = await jsonCommand<{ mintLimit: string }>(live.sellerHome, [
      'listing',
      'release',
      'status',
      '--contract',
      contract,
      '--chain',
      'sepolia',
    ]);

    expect(status.mintLimit).toBe('2');
  });

  it('configures release transaction limit', async () => {
    const contract = live.releaseContract;
    const rareMinter = getContractAddresses('sepolia').rareMinter!;

    const txLimit = await step('set release transaction limit', () =>
      jsonCommand<ReleaseLimitSetResult>(live.sellerHome, [
        'listing',
        'release',
        'limits',
        'set-tx',
        '--contract',
        contract,
        '--limit',
        '1',
        '--chain',
        'sepolia',
      ], 240_000),
    );
    expectTx(txLimit);
    expect(txLimit.config.rareMinter).toBe(rareMinter);
    expect(txLimit.config.contract.toLowerCase()).toBe(contract.toLowerCase());
    expect(txLimit.config.limit).toBe('1');
    expect(txLimit.config.enabled).toBe(true);

    const status = await jsonCommand<{ txLimit: string }>(live.sellerHome, [
      'listing',
      'release',
      'status',
      '--contract',
      contract,
      '--chain',
      'sepolia',
    ]);

    expect(status.txLimit).toBe('1');
  });
});

async function configureLiveHome(home: string, privateKey: string): Promise<void> {
  const result = await runCli([
    'configure',
    '--default-chain',
    'sepolia',
    '--chain',
    'sepolia',
    '--private-key',
    privateKey,
    '--rpc-url',
    process.env.TEST_RPC_URL!,
  ], { home });

  expect(result.code).toBe(0);
  expect(result.stderr).toBe('');
}

async function deployReleaseFixtureContract(privateKey: `0x${string}`, owner: Address): Promise<Address> {
  const account = privateKeyToAccount(privateKey);
  const publicClient = createLivePublicClient();
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(process.env.TEST_RPC_URL!),
  });

  const txHash = await walletClient.sendTransaction({
    account,
    chain: sepolia,
    data: releaseFixtureBytecode(owner),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (!receipt.contractAddress) {
    throw new Error('Release fixture deployment did not return a contract address.');
  }
  return receipt.contractAddress;
}

function releaseFixtureBytecode(owner: Address): `0x${string}` {
  const ownerBytes = owner.slice(2).toLowerCase();
  return `0x6048600c60003960486000f3${releaseFixtureRuntimePrefix}${ownerBytes}${releaseFixtureRuntimeSuffix}`;
}

async function jsonCommand<T>(home: string, args: string[], timeoutMs = 180_000): Promise<T> {
  return parseJsonStdout<T>(await runCli(['--json', ...args], { home, timeoutMs }));
}

function expectTx(result: TxResult): void {
  expect(result.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  expect(result.blockNumber).toMatch(/^\d+$/);
}

function createLivePublicClient() {
  return createPublicClient({
    chain: sepolia,
    transport: http(process.env.TEST_RPC_URL!),
  });
}

function livePrivateKey(): `0x${string}` {
  const value = process.env.E2E_SELLER_PRIVATE_KEY;
  if (!value || !value.startsWith('0x')) {
    throw new Error('E2E_SELLER_PRIVATE_KEY must be set to a 0x-prefixed private key.');
  }
  return value as `0x${string}`;
}

async function createTempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'rare-cli-live-rareminter-home-'));
}

async function cleanupTempHome(home: string | undefined): Promise<void> {
  if (!home) return;
  await rm(home, { recursive: true, force: true });
}

async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  console.error(`[live rareminter e2e] ${label}`);
  return fn();
}
