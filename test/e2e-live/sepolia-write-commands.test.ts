import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { parseHexString } from '../../src/sdk/validation.js';
import { parseJsonStdout, runCli } from '../helpers/cli.js';
import { loadDotEnv } from '../helpers/env.js';

loadDotEnv();

const requiredEnv = [
  'TEST_RPC_URL',
  'E2E_SELLER_PRIVATE_KEY',
  'E2E_BUYER_PRIVATE_KEY',
] as const;

const missingEnv = requiredEnv.filter((name) => !process.env[name]);
const describeLive = missingEnv.length === 0 ? describe.sequential : describe.skip;
const E2E_TOKEN_URI = 'ipfs://bafybeidznwopf6bnfakqbertnhohgh65usqlo7bhnehycurg4xmc5ebnm4/metadata.json';

type DeployResult = {
  txHash: string;
  blockNumber: string;
  contract: string;
};

type CreateSovereignResult = {
  txHash: string;
  blockNumber: string;
  contract: string;
  factory: string;
  contractType: string;
  nextStep?: string;
};

type MintResult = {
  txHash: string;
  blockNumber: string;
  tokenId: string;
  contract: string;
  tokenUri: string;
};

type TxResult = {
  txHash: string;
  blockNumber: string;
  approvalTxHash?: string | null;
};

type LiveState = {
  sellerHome: string;
  buyerHome: string;
  sellerAddress: Address;
  buyerAddress: Address;
  collection: DeployResult;
  auctionCancelToken: MintResult;
  auctionSettleToken: MintResult;
  buyerAuctionCancelToken: MintResult;
  buyerMintToken: MintResult;
};

class LiveStateRef {
  #value: LiveState | undefined;

  get value(): LiveState {
    if (!this.#value) {
      throw new Error('Live E2E state has not been initialized.');
    }

    return this.#value;
  }

  get optionalValue(): LiveState | undefined {
    return this.#value;
  }

  set(value: LiveState): void {
    this.#value = value;
  }
}

const live = new LiveStateRef();

describeLive('live Sepolia CLI write commands', () => {
  beforeAll(async () => {
    const sellerHome = await createTempHome();
    const buyerHome = await createTempHome();
    const suffix = Date.now().toString(36);
    const sellerAddress = privateKeyToAccount(livePrivateKey('E2E_SELLER_PRIVATE_KEY')).address;
    const buyerAddress = privateKeyToAccount(livePrivateKey('E2E_BUYER_PRIVATE_KEY')).address;

    try {
      await step('configure seller wallet', () => configureLiveHome(sellerHome, livePrivateKey('E2E_SELLER_PRIVATE_KEY')));
      await step('configure buyer wallet', () => configureLiveHome(buyerHome, livePrivateKey('E2E_BUYER_PRIVATE_KEY')));

      const collection = await step('deploy ERC-721 collection', () =>
        jsonCommand<DeployResult>(sellerHome, [
          'deploy',
          'erc721',
          `Rare CLI E2E ${suffix}`,
          `RCE${suffix.slice(-4).toUpperCase()}`,
          '--max-tokens',
          '6',
          '--chain',
          'sepolia',
        ]),
      );
      expectTx(collection);
      expect(collection.contract).toMatch(/^0x[0-9a-fA-F]{40}$/);

      live.set({
        sellerHome,
        buyerHome,
        sellerAddress,
        buyerAddress,
        collection,
        auctionCancelToken: await step('mint auction cancel token', () =>
          mintToken(sellerHome, collection.contract),
        ),
        auctionSettleToken: await step('mint auction settle token', () =>
          mintToken(sellerHome, collection.contract),
        ),
        buyerAuctionCancelToken: await step('mint buyer-owned auction token', () =>
          mintToken(sellerHome, collection.contract, { to: buyerAddress }),
        ),
        buyerMintToken: await step('mint token directly to buyer', () =>
          mintToken(sellerHome, collection.contract, { to: buyerAddress }),
        ),
      });
    } catch (error) {
      await cleanupTempHome(sellerHome);
      await cleanupTempHome(buyerHome);
      throw error;
    }
  });

  afterAll(async () => {
    await cleanupTempHome(live.optionalValue?.sellerHome);
    await cleanupTempHome(live.optionalValue?.buyerHome);
  });

  it('deploys collection and mints token fixtures', () => {
    expectTx(live.value.collection);
    expect(live.value.collection.contract).toMatch(/^0x[0-9a-fA-F]{40}$/);
    for (const token of [
      live.value.auctionCancelToken,
      live.value.auctionSettleToken,
      live.value.buyerAuctionCancelToken,
      live.value.buyerMintToken,
    ]) {
      expectTx(token);
      expect(token.contract).toBe(live.value.collection.contract);
      expect(token.tokenUri).toBe(E2E_TOKEN_URI);
      expect(token.tokenId).toMatch(/^\d+$/);
    }
  });

  it('creates a standard Sovereign collection through the newer factory', async () => {
    const suffix = Date.now().toString(36);
    const created = await step('create standard Sovereign collection', () =>
      jsonCommand<CreateSovereignResult>(live.sellerHome, [
        'collection',
        'create',
        'sovereign',
        `Rare CLI Sovereign E2E ${suffix}`,
        `RCS${suffix.slice(-4).toUpperCase()}`,
        '--max-tokens',
        '3',
        '--chain',
        'sepolia',
      ]),
    );

    expectTx(created);
    expect(created.contract).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(created.factory).toBe('0x46B2850ba7787734F648A6848b5eDE0815C1F8Bf');
    expect(created.contractType).toBe('standard');
  });

  it('creates a Lazy Sovereign release collection through the lazy factory', async () => {
    const suffix = Date.now().toString(36);
    const created = await step('create Lazy Sovereign collection', () =>
      jsonCommand<CreateSovereignResult>(live.sellerHome, [
        'collection',
        'create',
        'lazy-sovereign',
        `Rare CLI Lazy E2E ${suffix}`,
        `RCL${suffix.slice(-4).toUpperCase()}`,
        '--max-tokens',
        '3',
        '--chain',
        'sepolia',
      ]),
    );

    expectTx(created);
    expect(created.contract).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(created.factory).toBe('0xc5B8Ad9003673a23d005A6448C74d8955a1a38fA');
    expect(created.contractType).toBe('lazy');
    expect(created.nextStep).toContain('Configure release sale and mint settings');
  });

  it('mints directly to another recipient', async () => {
    await expectTokenOwner(live.value.sellerHome, live.value.collection.contract, live.value.buyerMintToken.tokenId, live.value.buyerAddress);
  });

  it('creates and cancels an auction', async () => {
    const auctionCancelCreate = await step('create auction for cancellation', () =>
      jsonCommand<TxResult>(live.value.sellerHome, [
        'auction',
        'create',
        '--contract',
        live.value.collection.contract,
        '--token-id',
        live.value.auctionCancelToken.tokenId,
        '--starting-price',
        '0.000001',
        '--duration',
        liveAuctionDurationSeconds().toString(),
        '--chain',
        'sepolia',
      ]),
    );
    expectTx(auctionCancelCreate);
    expect(auctionCancelCreate.approvalTxHash).toBeNull();

    await expectAuctionStatus(live.value.sellerHome, live.value.collection.contract, live.value.auctionCancelToken.tokenId, 'PENDING');
    expectTx(await step('cancel auction', () =>
      jsonCommand<TxResult>(live.value.sellerHome, [
        'auction',
        'cancel',
        '--contract',
        live.value.collection.contract,
        '--token-id',
        live.value.auctionCancelToken.tokenId,
        '--chain',
        'sepolia',
      ]),
    ));
  });

  it('auto-approves a buyer-owned token before creating and cancelling an auction', async () => {
    const buyerAuctionCreate = await step('create buyer-owned auction for cancellation', () =>
      jsonCommand<TxResult>(live.value.buyerHome, [
        'auction',
        'create',
        '--contract',
        live.value.collection.contract,
        '--token-id',
        live.value.buyerAuctionCancelToken.tokenId,
        '--starting-price',
        '0.000001',
        '--duration',
        liveAuctionDurationSeconds().toString(),
        '--chain',
        'sepolia',
      ]),
    );

    expectTx(buyerAuctionCreate);
    expect(buyerAuctionCreate.approvalTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    await expectAuctionStatus(live.value.buyerHome, live.value.collection.contract, live.value.buyerAuctionCancelToken.tokenId, 'PENDING');

    expectTx(await step('cancel buyer-owned auction', () =>
      jsonCommand<TxResult>(live.value.buyerHome, [
        'auction',
        'cancel',
        '--contract',
        live.value.collection.contract,
        '--token-id',
        live.value.buyerAuctionCancelToken.tokenId,
        '--chain',
        'sepolia',
      ]),
    ));
  });

  it('creates, bids, and settles an auction', async () => {
    const auctionSettleCreate = await step('create auction for settlement', () =>
      jsonCommand<TxResult>(live.value.sellerHome, [
        'auction',
        'create',
        '--contract',
        live.value.collection.contract,
        '--token-id',
        live.value.auctionSettleToken.tokenId,
        '--starting-price',
        '0.000001',
        '--duration',
        liveAuctionDurationSeconds().toString(),
        '--chain',
        'sepolia',
      ]),
    );
    expectTx(auctionSettleCreate);
    expect(auctionSettleCreate.approvalTxHash).toBeNull();

    expectTx(await step('bid on auction', () =>
      jsonCommand<TxResult>(live.value.buyerHome, [
        'auction',
        'bid',
        '--contract',
        live.value.collection.contract,
        '--token-id',
        live.value.auctionSettleToken.tokenId,
        '--amount',
        '0.000001',
        '--chain',
        'sepolia',
      ]),
    ));
    await step('wait for auction to end', waitForAuctionToEnd);
    await expectAuctionStatus(live.value.sellerHome, live.value.collection.contract, live.value.auctionSettleToken.tokenId, 'ENDED');
    expectTx(await step('settle auction', () =>
      jsonCommand<TxResult>(live.value.sellerHome, [
        'auction',
        'settle',
        '--contract',
        live.value.collection.contract,
        '--token-id',
        live.value.auctionSettleToken.tokenId,
        '--chain',
        'sepolia',
      ]),
    ));
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
    testRpcUrl(),
  ], { home });

  expect(result.code).toBe(0);
  expect(result.stderr).toBe('');
}

async function mintToken(home: string, contract: string, opts: { to?: string } = {}): Promise<MintResult> {
  const baseArgs = [
    'mint',
    '--contract',
    contract,
    '--token-uri',
    E2E_TOKEN_URI,
    '--chain',
    'sepolia',
  ];
  const args = opts.to ? [...baseArgs, '--to', opts.to] : baseArgs;

  const result = await jsonCommand<MintResult>(home, args);

  expectTx(result);
  expect(result.contract).toBe(contract);
  expect(result.tokenUri).toBe(E2E_TOKEN_URI);
  expect(result.tokenId).toMatch(/^\d+$/);
  return result;
}

async function expectAuctionStatus(
  home: string,
  contract: string,
  tokenId: string,
  expectedStatus: 'PENDING' | 'RUNNING' | 'ENDED',
): Promise<void> {
  const status = await jsonCommand<{ status: string }>(home, [
    'auction',
    'status',
    '--contract',
    contract,
    '--token-id',
    tokenId,
    '--chain',
    'sepolia',
  ]);
  expect(status.status).toBe(expectedStatus);
}

async function jsonCommand<T>(home: string, args: string[], timeoutMs = 180_000): Promise<T> {
  return parseJsonStdout<T>(await runCli(['--json', ...args], { home, timeoutMs }));
}

function expectTx(result: TxResult): void {
  expect(result.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  expect(result.blockNumber).toMatch(/^\d+$/);
}

async function expectTokenOwner(home: string, contract: string, tokenId: string, owner: Address): Promise<void> {
  const status = await jsonCommand<{
    token: { owner: Address; tokenUri: string; tokenId: string } | null;
  }>(home, [
    'status',
    '--contract',
    contract,
    '--token-id',
    tokenId,
    '--chain',
    'sepolia',
  ]);

  const token = status.token;
  expect(token).not.toBeNull();
  if (!token) {
    throw new Error('Expected token status response to include token details.');
  }
  expect(token.owner.toLowerCase()).toBe(owner.toLowerCase());
  expect(token.tokenUri).toBe(E2E_TOKEN_URI);
}

function livePrivateKey(name: 'E2E_SELLER_PRIVATE_KEY' | 'E2E_BUYER_PRIVATE_KEY'): `0x${string}` {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set to a 0x-prefixed private key.`);
  }
  return parseHexString(value, name);
}

function testRpcUrl(): string {
  const value = process.env.TEST_RPC_URL;
  if (!value) {
    throw new Error('TEST_RPC_URL must be set.');
  }
  return value;
}

function liveAuctionDurationSeconds(): number {
  return Number.parseInt(process.env.E2E_AUCTION_DURATION_SECONDS ?? '60', 10);
}

async function waitForAuctionToEnd(): Promise<void> {
  const duration = liveAuctionDurationSeconds();
  await new Promise((resolve) => setTimeout(resolve, (duration + 10) * 1000));
}

async function createTempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'rare-cli-live-e2e-home-'));
}

async function cleanupTempHome(home: string | undefined): Promise<void> {
  if (!home) return;
  await rm(home, { recursive: true, force: true });
}

async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  console.error(`[live e2e] ${label}`);
  return fn();
}
