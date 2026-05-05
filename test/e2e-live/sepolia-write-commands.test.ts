import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseJsonStdout, runCli } from '../helpers/cli.js';
import { loadDotEnv } from './env.mjs';

loadDotEnv();

const requiredEnv = [
  'E2E_RPC_URL',
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
  collection: DeployResult;
  listingCancelToken: MintResult;
  listingBuyToken: MintResult;
  auctionCancelToken: MintResult;
  auctionSettleToken: MintResult;
  offerCancelToken: MintResult;
  offerCancelCreate: TxResult;
  offerCancelReady: Promise<void>;
  offerAcceptToken: MintResult;
};

let live: LiveState;

describeLive('live Sepolia CLI write commands', () => {
  beforeAll(async () => {
    const sellerHome = await createTempHome();
    const buyerHome = await createTempHome();
    const suffix = Date.now().toString(36);

    try {
      await step('configure seller wallet', () => configureLiveHome(sellerHome, process.env.E2E_SELLER_PRIVATE_KEY!));
      await step('configure buyer wallet', () => configureLiveHome(buyerHome, process.env.E2E_BUYER_PRIVATE_KEY!));

      const collection = await step('deploy ERC-721 collection', () =>
        jsonCommand<DeployResult>(sellerHome, [
          'deploy',
          'erc721',
          `Rare CLI E2E ${suffix}`,
          `RCE${suffix.slice(-4).toUpperCase()}`,
          '--max-tokens',
          '12',
          '--chain',
          'sepolia',
        ]),
      );
      expectTx(collection);
      expect(collection.contract).toMatch(/^0x[0-9a-fA-F]{40}$/);

      const offerCancelToken = await step('mint offer cancel token', () =>
        mintToken(sellerHome, collection.contract),
      );
      const offerCancelCreate = await step('create offer for cancellation', () =>
        jsonCommand<TxResult>(buyerHome, [
          'offer',
          'create',
          '--contract',
          collection.contract,
          '--token-id',
          offerCancelToken.tokenId,
          '--amount',
          '0.000001',
          '--chain',
          'sepolia',
        ]),
      );
      expectTx(offerCancelCreate);

      live = {
        sellerHome,
        buyerHome,
        collection,
        listingCancelToken: await step('mint listing cancel token', () =>
          mintToken(sellerHome, collection.contract),
        ),
        listingBuyToken: await step('mint listing buy token', () =>
          mintToken(sellerHome, collection.contract),
        ),
        auctionCancelToken: await step('mint auction cancel token', () =>
          mintToken(sellerHome, collection.contract),
        ),
        auctionSettleToken: await step('mint auction settle token', () =>
          mintToken(sellerHome, collection.contract),
        ),
        offerCancelToken,
        offerCancelCreate,
        offerCancelReady: startOfferCancelDelay(),
        offerAcceptToken: await step('mint offer accept token', () =>
          mintToken(sellerHome, collection.contract),
        ),
      };
    } catch (error) {
      await cleanupTempHome(sellerHome);
      await cleanupTempHome(buyerHome);
      throw error;
    }
  });

  afterAll(async () => {
    await cleanupTempHome(live?.sellerHome);
    await cleanupTempHome(live?.buyerHome);
  });

  it('deploys collection and mints token fixtures', () => {
    expectTx(live.collection);
    expect(live.collection.contract).toMatch(/^0x[0-9a-fA-F]{40}$/);
    for (const token of [
      live.listingCancelToken,
      live.listingBuyToken,
      live.auctionCancelToken,
      live.auctionSettleToken,
      live.offerCancelToken,
      live.offerAcceptToken,
    ]) {
      expectTx(token);
      expect(token.contract).toBe(live.collection.contract);
      expect(token.tokenUri).toBe(E2E_TOKEN_URI);
      expect(token.tokenId).toMatch(/^\d+$/);
    }
  });

  it('creates and cancels a listing', async () => {
    const listingCancelCreate = await step('create listing for cancellation', () =>
      jsonCommand<TxResult>(live.sellerHome, [
          'listing',
          'create',
          '--contract',
          live.collection.contract,
          '--token-id',
          live.listingCancelToken.tokenId,
          '--price',
          '0.000001',
          '--chain',
          'sepolia',
        ]),
    );
    expectTx(listingCancelCreate);
    expect(listingCancelCreate.approvalTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    await expectListingStatus(live.sellerHome, live.collection.contract, live.listingCancelToken.tokenId, true);

    expectTx(await step('cancel listing', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'listing',
        'cancel',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.listingCancelToken.tokenId,
        '--chain',
        'sepolia',
      ]),
    ));
    await expectListingStatus(live.sellerHome, live.collection.contract, live.listingCancelToken.tokenId, false);
  });

  it('creates and buys a listing', async () => {
    expectTx(await step('create listing for purchase', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'listing',
        'create',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.listingBuyToken.tokenId,
        '--price',
        '0.000001',
        '--chain',
        'sepolia',
      ]),
    ));
    expectTx(await step('buy listing', () =>
      jsonCommand<TxResult>(live.buyerHome, [
        'listing',
        'buy',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.listingBuyToken.tokenId,
        '--amount',
        '0.000001',
        '--chain',
        'sepolia',
      ]),
    ));
    await expectListingStatus(live.sellerHome, live.collection.contract, live.listingBuyToken.tokenId, false);
  });

  it('creates and cancels an auction', async () => {
    expectTx(await step('create auction for cancellation', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'auction',
        'create',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.auctionCancelToken.tokenId,
        '--starting-price',
        '0.000001',
        '--duration',
        liveAuctionDurationSeconds().toString(),
        '--chain',
        'sepolia',
      ]),
    ));
    await expectAuctionStatus(live.sellerHome, live.collection.contract, live.auctionCancelToken.tokenId, 'PENDING');
    expectTx(await step('cancel auction', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'auction',
        'cancel',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.auctionCancelToken.tokenId,
        '--chain',
        'sepolia',
      ]),
    ));
  });

  it('creates, bids, and settles an auction', async () => {
    expectTx(await step('create auction for settlement', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'auction',
        'create',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.auctionSettleToken.tokenId,
        '--starting-price',
        '0.000001',
        '--duration',
        liveAuctionDurationSeconds().toString(),
        '--chain',
        'sepolia',
      ]),
    ));
    expectTx(await step('bid on auction', () =>
      jsonCommand<TxResult>(live.buyerHome, [
        'auction',
        'bid',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.auctionSettleToken.tokenId,
        '--amount',
        '0.000001',
        '--chain',
        'sepolia',
      ]),
    ));
    await step('wait for auction to end', waitForAuctionToEnd);
    await expectAuctionStatus(live.sellerHome, live.collection.contract, live.auctionSettleToken.tokenId, 'ENDED');
    expectTx(await step('settle auction', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'auction',
        'settle',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.auctionSettleToken.tokenId,
        '--chain',
        'sepolia',
      ]),
    ));
  });

  it('creates and cancels an offer', async () => {
    expectTx(live.offerCancelCreate);
    await expectOfferStatus(live.sellerHome, live.collection.contract, live.offerCancelToken.tokenId, true);
    await live.offerCancelReady;
    expectTx(await step('cancel offer', () =>
      jsonCommand<TxResult>(live.buyerHome, [
        'offer',
        'cancel',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.offerCancelToken.tokenId,
        '--chain',
        'sepolia',
      ]),
    ));
    await expectOfferStatus(live.sellerHome, live.collection.contract, live.offerCancelToken.tokenId, false);
  });

  it('creates and accepts an offer', async () => {
    expectTx(await step('create offer for acceptance', () =>
      jsonCommand<TxResult>(live.buyerHome, [
        'offer',
        'create',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.offerAcceptToken.tokenId,
        '--amount',
        '0.000001',
        '--chain',
        'sepolia',
      ]),
    ));
    expectTx(await step('accept offer', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'offer',
        'accept',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.offerAcceptToken.tokenId,
        '--amount',
        '0.000001',
        '--chain',
        'sepolia',
      ]),
    ));
    await expectOfferStatus(live.sellerHome, live.collection.contract, live.offerAcceptToken.tokenId, false);
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
    process.env.E2E_RPC_URL!,
  ], { home });

  expect(result.code).toBe(0);
  expect(result.stderr).toBe('');
}

async function mintToken(home: string, contract: string): Promise<MintResult> {
  const result = await jsonCommand<MintResult>(home, [
    'mint',
    '--contract',
    contract,
    '--token-uri',
    E2E_TOKEN_URI,
    '--chain',
    'sepolia',
  ]);

  expectTx(result);
  expect(result.contract).toBe(contract);
  expect(result.tokenUri).toBe(E2E_TOKEN_URI);
  expect(result.tokenId).toMatch(/^\d+$/);
  return result;
}

async function expectListingStatus(
  home: string,
  contract: string,
  tokenId: string,
  hasListing: boolean,
): Promise<void> {
  const status = await jsonCommand<{ hasListing: boolean }>(home, [
    'listing',
    'status',
    '--contract',
    contract,
    '--token-id',
    tokenId,
    '--chain',
    'sepolia',
  ]);
  expect(status.hasListing).toBe(hasListing);
}

async function expectOfferStatus(
  home: string,
  contract: string,
  tokenId: string,
  hasOffer: boolean,
): Promise<void> {
  const status = await jsonCommand<{ hasOffer: boolean }>(home, [
    'offer',
    'status',
    '--contract',
    contract,
    '--token-id',
    tokenId,
    '--chain',
    'sepolia',
  ]);
  expect(status.hasOffer).toBe(hasOffer);
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

function liveAuctionDurationSeconds(): number {
  return Number.parseInt(process.env.E2E_AUCTION_DURATION_SECONDS ?? '60', 10);
}

function liveOfferCancelDelaySeconds(): number {
  return Number.parseInt(process.env.E2E_OFFER_CANCEL_DELAY_SECONDS ?? '310', 10);
}

async function waitForAuctionToEnd(): Promise<void> {
  const duration = liveAuctionDurationSeconds();
  await new Promise((resolve) => setTimeout(resolve, (duration + 10) * 1000));
}

async function waitForOfferCancelDelay(): Promise<void> {
  const duration = liveOfferCancelDelaySeconds();
  await new Promise((resolve) => setTimeout(resolve, duration * 1000));
}

function startOfferCancelDelay(): Promise<void> {
  console.error(`[live e2e] wait for offer cancellation delay (${liveOfferCancelDelaySeconds()}s)`);
  return waitForOfferCancelDelay();
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
