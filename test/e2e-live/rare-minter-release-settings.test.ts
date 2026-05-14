import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createWalletClient, http, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getContractAddresses, viemChains, type SupportedChain } from '../../src/contracts/addresses.js';
import {
  cleanupTempHome,
  configureLiveHome,
  createLivePublicClient,
  createTempHome,
  detectLiveChain,
  expectTx,
  jsonCommand,
  liveRpcUrl,
  retryNonceConflict,
  step,
  withLiveTransactionLock,
  type TxResult,
} from './live-helpers.js';
import { hasLiveWalletEnv } from './env.mjs';
import { releaseLiveWallets, reserveLiveWallet, type LiveWalletLease } from './helpers/live-wallet-pool.js';

const requiredEnv = [
  'TEST_RPC_URL',
] as const;

const missingEnv = [
  ...requiredEnv.filter((name) => !process.env[name]),
  ...(hasLiveWalletEnv('seller') ? [] : ['E2E_SELLER_PRIVATE_KEYS']),
];
const describeLive = missingEnv.length === 0 ? describe.sequential : describe.skip;

// Runtime dispatches owner() and mintTo(address). Creation code injects the seller as owner.
const releaseFixtureRuntimePrefix = '60003560e01c80638da5cb5b14601f578063755edd1714603d5760006000fd5b73';
const releaseFixtureRuntimeSuffix = '60005260206000f35b600160005260206000f3';

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
  sellerWallet: LiveWalletLease;
  releaseContract: Address;
  chain: SupportedChain;
};

let live: LiveState;

describeLive('live RareMinter release settings', () => {
  beforeAll(async () => {
    const sellerHome = await createTempHome();
    const chain = await detectLiveChain();
    const sellerWallet = await reserveLiveWallet('seller', chain);
    const sellerAddress = sellerWallet.address;

    try {
      await step('configure seller wallet', () =>
        configureLiveHome(sellerHome, sellerWallet.privateKey, chain),
      );
      const releaseContract = await step('deploy RareMinter release fixture contract', () =>
        deployReleaseFixtureContract(chain, sellerWallet.privateKey, sellerAddress),
      );

      live = {
        sellerHome,
        sellerAddress,
        sellerWallet,
        releaseContract,
        chain,
      };
    } catch (error) {
      await cleanupTempHome(sellerHome);
      await releaseLiveWallets([sellerWallet]);
      throw error;
    }
  });

  afterAll(async () => {
    await cleanupTempHome(live?.sellerHome);
    await releaseLiveWallets([live?.sellerWallet]);
  });

  it('configures release allowlist', async () => {
    const contract = live.releaseContract;
    const rareMinter = getContractAddresses(live.chain).rareMinter!;
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
        live.chain,
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
      live.chain,
    ]);

    expect(status.allowlistRoot).toBe(artifactBuild.artifact.root);
    expect(status.allowlistEndTimestamp).toBe(endTimestamp.toString());

    const cleared = await step('clear release allowlist config', () =>
      jsonCommand<ReleaseAllowlistSetResult>(live.sellerHome, [
        'listing',
        'release',
        'allowlist',
        'clear',
        '--contract',
        contract,
        '--chain',
        live.chain,
      ], 240_000),
    );
    expectTx(cleared);
    expect(cleared.config.rareMinter).toBe(rareMinter);
    expect(cleared.config.contract.toLowerCase()).toBe(contract.toLowerCase());
    expect(cleared.config.active).toBe(false);
  });

  it('configures release mint limit', async () => {
    const contract = live.releaseContract;
    const rareMinter = getContractAddresses(live.chain).rareMinter!;

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
        live.chain,
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
      live.chain,
    ]);

    expect(status.mintLimit).toBe('2');
  });

  it('configures release transaction limit', async () => {
    const contract = live.releaseContract;
    const rareMinter = getContractAddresses(live.chain).rareMinter!;

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
        live.chain,
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
      live.chain,
    ]);

    expect(status.txLimit).toBe('1');
  });

});

async function deployReleaseFixtureContract(chain: SupportedChain, privateKey: `0x${string}`, owner: Address): Promise<Address> {
  const account = privateKeyToAccount(privateKey);
  const publicClient = createLivePublicClient(chain);
  const viemChain = viemChains[chain];
  const walletClient = createWalletClient({
    account,
    chain: viemChain,
    transport: http(liveRpcUrl()),
  });

  const txHash = await retryNonceConflict('deploy RareMinter release fixture contract', () =>
    withLiveTransactionLock(account.address, 'deploy RareMinter release fixture contract', () =>
      walletClient.sendTransaction({
        account,
        chain: viemChain,
        data: releaseFixtureBytecode(owner),
      }),
    ),
  );
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
