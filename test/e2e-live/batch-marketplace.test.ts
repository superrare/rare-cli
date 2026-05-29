import { afterAll, beforeAll, expect, it } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAddressEqual, zeroAddress, type Address } from 'viem';
import { chainIds } from '../../src/contracts/addresses.js';
import { describeLive, expectTx, jsonCommand, step, type TxResult } from './live-helpers.js';
import {
  cleanupLiveCliFixture,
  createLiveCliFixture,
  deployErc721Collection,
  expectTokenOwner,
  liveAuctionDurationSeconds,
  mintToken,
  type DeployResult,
  type LiveCliFixture,
  type MintResult,
  LiveCliFixtureRef,
} from './helpers/live-cli-fixture.js';

type BatchFixture = LiveCliFixture & {
  collection: DeployResult;
};

type BatchTreeBuildResult = {
  root: `0x${string}`;
  count: number;
  chainId: number;
  output: string;
};

type BatchOfferCreateResult = TxResult & {
  creator: Address;
  root: `0x${string}`;
  amount: string;
  expiry: string;
};

type BatchAuctionCreateResult = TxResult & {
  creator: Address;
  root: `0x${string}`;
  approvalTxHashes: string[];
};

type BatchAuctionStatus = {
  state: string;
  seller: Address;
  root: `0x${string}` | null;
  hasRootConfig: boolean;
  hasAuction: boolean;
  endTime: string | null;
  settlementEligible: boolean;
};

type BatchOfferStatus = {
  state: string;
  creator: Address;
  root: `0x${string}`;
  hasOffer: boolean;
  fillable: boolean;
};

type BatchListingCreateResult = TxResult & {
  root: `0x${string}`;
  approvalTxHashes: string[] | null;
};

type BatchListingStatus = {
  root: `0x${string}`;
  seller: Address;
  amount: string;
  currencyAddress: Address;
  splitRecipients: Address[];
  splitRatios: number[];
  hasListing: boolean;
};

type BatchListingSetAllowlistResult = TxResult & {
  root: `0x${string}`;
  allowListRoot: `0x${string}`;
  endTime: string;
};

const live = new LiveCliFixtureRef<BatchFixture>('Live batch marketplace CLI fixture has not been initialized.');
const batchMarketplaceCsvFixture = fileURLToPath(new URL('../fixtures/batch-marketplace-tokens.csv', import.meta.url));

describeLive('live batch marketplace CLI commands', () => {
  beforeAll(async () => {
    const fixture = await createLiveCliFixture();
    try {
      const collection = await deployErc721Collection(fixture, '10');
      live.set({
        ...fixture,
        collection,
      });
    } catch (error) {
      await cleanupLiveCliFixture(fixture);
      throw error;
    }
  });

  afterAll(async () => {
    await cleanupLiveCliFixture(live.optionalValue);
  });

  it('creates a batch listing and buys it through rare-api proof resolution', async () => {
    const fixture = live.value;
    const tokens = await mintBatchTokenPair(fixture, 'batch listing');
    const [token] = tokens;
    const csvInput = await writeBatchTokenCsv(fixture, 'listing-buy', tokens);

    const created = await step('create batch listing directly from CSV as maker', () =>
      jsonCommand<BatchListingCreateResult>(fixture.sellerHome, [
        'listing',
        'batch',
        'create',
        '--input',
        csvInput,
        '--price',
        '0.000001',
        '--currency',
        'eth',
        '--split',
        `${fixture.sellerAddress}=70`,
        '--split',
        `${fixture.buyerAddress}=30`,
        '--yes',
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(created);
    expect(created.root).toMatch(/^0x[0-9a-fA-F]{64}$/);

    const status = await step('read batch listing status', () =>
      jsonCommand<BatchListingStatus>(fixture.sellerHome, [
        'listing',
        'batch',
        'status',
        '--root',
        created.root,
        '--creator',
        fixture.sellerAddress,
        '--chain',
        fixture.chain,
      ]),
    );
    expect(status.root).toBe(created.root);
    expect(status.seller.toLowerCase()).toBe(fixture.sellerAddress.toLowerCase());
    expect(status.hasListing).toBe(true);
    expect(status.amount).toBe('1000000000000');
    expect(isAddressEqual(status.currencyAddress, zeroAddress)).toBe(true);
    expect(status.splitRecipients).toHaveLength(2);
    expect(isAddressEqual(status.splitRecipients[0]!, fixture.sellerAddress)).toBe(true);
    expect(isAddressEqual(status.splitRecipients[1]!, fixture.buyerAddress)).toBe(true);
    expect(status.splitRatios).toEqual([70, 30]);

    const allowlistEndTimestamp = Math.floor(Date.now() / 1000) + 3_600;
    const allowlistInput = await writeBatchListingAllowlistArtifact(
      fixture,
      'listing-buy',
      tokens,
      created.root,
      allowlistEndTimestamp,
    );
    const allowlisted = await step('set batch listing allowlist from artifact', () =>
      jsonCommand<BatchListingSetAllowlistResult>(fixture.sellerHome, [
        'listing',
        'batch',
        'set-allowlist',
        '--input',
        allowlistInput,
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(allowlisted);
    expect(allowlisted.root).toBe(created.root);
    expect(allowlisted.allowListRoot).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(allowlisted.endTime).toBe(allowlistEndTimestamp.toString());

    const bought = await step('buy batch listing as taker', () =>
      retryRareApiMerkleResolution(() =>
        jsonCommand<TxResult & { tokenContract: Address; tokenId: string }>(fixture.buyerHome, [
          'listing',
          'batch',
          'buy',
          '--contract',
          fixture.collection.contract,
          '--token-id',
          token.tokenId,
          '--creator',
          fixture.sellerAddress,
          '--currency',
          'eth',
          '--price',
          '0.000001',
          '--chain',
          fixture.chain,
        ], 240_000),
      ),
    );
    expectTx(bought);
    expect(bought.tokenContract.toLowerCase()).toBe(fixture.collection.contract.toLowerCase());
    expect(bought.tokenId).toBe(token.tokenId);
    await expectTokenOwner(fixture, fixture.buyerHome, fixture.collection.contract, token.tokenId, fixture.buyerAddress);
  });

  it('creates and revokes a batch offer through rare-api root resolution', async () => {
    const fixture = live.value;
    const tokens = await mintBatchTokenPair(fixture, 'batch offer revoke');
    const tree = await buildBatchTree(fixture, 'offer-revoke', tokens);
    const expiry = Math.floor(Date.now() / 1000) + 3_600;

    const created = await step('create batch offer for revoke', () =>
      jsonCommand<BatchOfferCreateResult>(fixture.buyerHome, [
        'offer',
        'batch',
        'create',
        '--input',
        tree.artifactPath,
        '--price',
        '0.000001',
        '--end-time',
        expiry.toString(),
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(created);
    expect(created.creator.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());
    expect(created.root).toMatch(/^0x[0-9a-fA-F]{64}$/);

    const status = await step('read batch offer status', () =>
      jsonCommand<BatchOfferStatus>(fixture.buyerHome, [
        'offer',
        'batch',
        'status',
        '--creator',
        fixture.buyerAddress,
        '--root',
        created.root,
        '--chain',
        fixture.chain,
      ]),
    );
    expect(status.state).toBe('ACTIVE');
    expect(status.creator.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());
    expect(status.root).toBe(created.root);
    expect(status.hasOffer).toBe(true);
    expect(status.fillable).toBe(true);

    const revoked = await step('revoke batch offer through rare-api root resolution', () =>
      retryRareApiMerkleResolution(() =>
        jsonCommand<TxResult & { creator: Address; root: `0x${string}` }>(fixture.buyerHome, [
          'offer',
          'batch',
          'revoke',
          '--contract',
          fixture.collection.contract,
          '--token-id',
          tokens[0].tokenId,
          '--chain',
          fixture.chain,
        ], 240_000),
      ),
    );
    expectTx(revoked);
    expect(revoked.creator.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());
    expect(revoked.root).toBe(created.root);
  });

  it('creates and accepts a batch offer through rare-api proof resolution', async () => {
    const fixture = live.value;
    const tokens = await mintBatchTokenPair(fixture, 'batch offer accept');
    const [token] = tokens;
    const tree = await buildBatchTree(fixture, 'offer-accept', tokens);
    const expiry = Math.floor(Date.now() / 1000) + 3_600;

    const created = await step('create batch offer for accept', () =>
      jsonCommand<BatchOfferCreateResult>(fixture.buyerHome, [
        'offer',
        'batch',
        'create',
        '--input',
        tree.artifactPath,
        '--price',
        '0.000001',
        '--end-time',
        expiry.toString(),
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(created);

    const accepted = await step('accept batch offer', () =>
      retryRareApiMerkleResolution(() =>
        jsonCommand<TxResult & { seller: Address; buyer: Address; root: `0x${string}` }>(fixture.sellerHome, [
          'offer',
          'batch',
          'accept',
          '--creator',
          fixture.buyerAddress,
          '--contract',
          fixture.collection.contract,
          '--token-id',
          token.tokenId,
          '--chain',
          fixture.chain,
        ], 240_000),
      ),
    );
    expectTx(accepted);
    expect(accepted.seller.toLowerCase()).toBe(fixture.sellerAddress.toLowerCase());
    expect(accepted.buyer.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());
    expect(accepted.root).toBe(created.root);
    await expectTokenOwner(fixture, fixture.buyerHome, fixture.collection.contract, token.tokenId, fixture.buyerAddress);
  });

  it('creates, reads, and cancels a batch auction root', async () => {
    const fixture = live.value;
    const tokens = await mintBatchTokenPair(fixture, 'batch auction cancel');
    const tree = await buildBatchTree(fixture, 'auction-cancel', tokens);
    const [token] = tokens;
    const endTime = Math.floor(Date.now() / 1000) + liveAuctionDurationSeconds();

    const created = await step('create batch auction for cancel', () =>
      jsonCommand<BatchAuctionCreateResult>(fixture.sellerHome, [
        'auction',
        'batch',
        'create',
        '--input',
        tree.artifactPath,
        '--price',
        '0.000001',
        '--end-time',
        endTime.toString(),
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(created);
    expect(created.creator.toLowerCase()).toBe(fixture.sellerAddress.toLowerCase());
    expect(created.root).toMatch(/^0x[0-9a-fA-F]{64}$/);

    const configured = await readBatchAuctionStatus(fixture, token);
    expect(configured.state).toBe('RESERVE_NOT_MET');
    expect(configured.hasRootConfig).toBe(true);
    expect(configured.root).toBe(created.root);

    const cancelled = await step('cancel batch auction root', () =>
      jsonCommand<TxResult & { creator: Address; root: `0x${string}` }>(fixture.sellerHome, [
        'auction',
        'batch',
        'cancel',
        '--root',
        created.root,
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(cancelled);
    expect(cancelled.creator.toLowerCase()).toBe(fixture.sellerAddress.toLowerCase());
    expect(cancelled.root).toBe(created.root);
  });

  it('creates, bids, and settles a batch auction through rare-api proof resolution', async () => {
    const fixture = live.value;
    const tokens = await mintBatchTokenPair(fixture, 'batch auction settle');
    const [token] = tokens;
    const tree = await buildBatchTree(fixture, 'auction-settle', tokens);
    const endTime = Math.floor(Date.now() / 1000) + liveAuctionDurationSeconds();

    const created = await step('create batch auction for settlement', () =>
      jsonCommand<BatchAuctionCreateResult>(fixture.sellerHome, [
        'auction',
        'batch',
        'create',
        '--input',
        tree.artifactPath,
        '--price',
        '0.000001',
        '--end-time',
        endTime.toString(),
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(created);

    const bid = await step('bid on batch auction', () =>
      retryRareApiMerkleResolution(() =>
        jsonCommand<TxResult & { bidder: Address; root: `0x${string}` }>(fixture.buyerHome, [
          'auction',
          'batch',
          'bid',
          '--creator',
          fixture.sellerAddress,
          '--contract',
          fixture.collection.contract,
          '--token-id',
          token.tokenId,
          '--price',
          '0.000001',
          '--chain',
          fixture.chain,
        ], 240_000),
      ),
    );
    expectTx(bid);
    expect(bid.root).toBe(created.root);

    const ended = await step('wait for batch auction to end', () =>
      waitForBatchAuctionToEnd(fixture, token),
    );
    expect(ended.state).toBe('ENDED');
    expect(ended.settlementEligible).toBe(true);

    expectTx(await step('settle batch auction', () =>
      jsonCommand<TxResult & { seller: Address; bidder: Address }>(fixture.sellerHome, [
        'auction',
        'batch',
        'settle',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        token.tokenId,
        '--chain',
        fixture.chain,
      ], 240_000),
    ));
    await expectTokenOwner(fixture, fixture.buyerHome, fixture.collection.contract, token.tokenId, fixture.buyerAddress);
  });
});

async function mintBatchTokenPair(
  fixture: BatchFixture,
  label: string,
): Promise<[MintResult, MintResult]> {
  return [
    await step(`mint ${label} token 1`, () => mintToken(fixture, fixture.collection.contract)),
    await step(`mint ${label} token 2`, () => mintToken(fixture, fixture.collection.contract)),
  ];
}

async function buildBatchTree(
  fixture: BatchFixture,
  name: string,
  tokens: readonly [MintResult, MintResult],
): Promise<{ artifactPath: string; root: `0x${string}` }> {
  const inputPath = await writeBatchTokenCsv(fixture, name, tokens);
  const artifactPath = join(fixture.sellerHome, `${name}-tree.json`);

  const result = await jsonCommand<BatchTreeBuildResult>(fixture.sellerHome, [
    'utils',
    'tree',
    'build',
    '--input',
    inputPath,
    '--output',
    artifactPath,
  ]);

  expect(result.count).toBe(2);
  expect(result.output).toBe(artifactPath);
  return { artifactPath, root: result.root };
}

async function writeBatchTokenCsv(
  fixture: BatchFixture,
  name: string,
  tokens: readonly [MintResult, MintResult],
): Promise<string> {
  const inputPath = join(fixture.sellerHome, `${name}-tokens.csv`);
  const template = await readFile(batchMarketplaceCsvFixture, 'utf8');
  await writeFile(
    inputPath,
    template
      .replaceAll('{{CONTRACT_ADDRESS}}', fixture.collection.contract)
      .replaceAll('{{TOKEN_ID_1}}', tokens[0].tokenId)
      .replaceAll('{{TOKEN_ID_2}}', tokens[1].tokenId)
      .replaceAll('{{CHAIN_ID}}', String(chainIds[fixture.chain])),
    'utf8',
  );
  return inputPath;
}

async function writeBatchListingAllowlistArtifact(
  fixture: BatchFixture,
  name: string,
  tokens: readonly [MintResult, MintResult],
  root: `0x${string}`,
  endTimestamp: number,
): Promise<string> {
  const inputPath = join(fixture.sellerHome, `${name}-listing-allowlist-root.json`);
  await writeFile(
    inputPath,
    `${JSON.stringify({
      root,
      currency: zeroAddress,
      amount: '1000000000000',
      splitAddresses: [],
      splitRatios: [],
      tokens: tokens.map((token) => ({
        contract: fixture.collection.contract,
        tokenId: token.tokenId,
      })),
      allowList: {
        root: `0x${'00'.repeat(32)}`,
        addresses: [
          fixture.buyerAddress,
          '0x0000000000000000000000000000000000000002',
        ],
        endTimestamp: endTimestamp.toString(),
      },
    }, null, 2)}\n`,
    'utf8',
  );
  return inputPath;
}

async function readBatchAuctionStatus(
  fixture: BatchFixture,
  token: MintResult,
): Promise<BatchAuctionStatus> {
  return retryRareApiMerkleResolution(() =>
    jsonCommand<BatchAuctionStatus>(fixture.sellerHome, [
      'auction',
      'batch',
      'status',
      '--contract',
      fixture.collection.contract,
      '--token-id',
      token.tokenId,
      '--creator',
      fixture.sellerAddress,
      '--chain',
      fixture.chain,
    ]),
  );
}

async function waitForBatchAuctionToEnd(
  fixture: BatchFixture,
  token: MintResult,
): Promise<BatchAuctionStatus> {
  const timeoutAt = Date.now() + (liveAuctionDurationSeconds() + 120) * 1000;
  let latest = await readBatchAuctionStatus(fixture, token);

  while (latest.state !== 'ENDED' || !latest.settlementEligible) {
    if (Date.now() >= timeoutAt) {
      throw new Error(
        `Timed out waiting for batch auction to end. Last state: ${latest.state}, ` +
          `settlementEligible: ${String(latest.settlementEligible)}, endTime: ${String(latest.endTime)}.`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 5_000));
    latest = await readBatchAuctionStatus(fixture, token);
  }

  return latest;
}

async function retryRareApiMerkleResolution<T>(fn: () => Promise<T>): Promise<T> {
  const timeoutAt = Date.now() + 180_000;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (!isRareApiMerkleProofNotFound(error) || Date.now() >= timeoutAt) {
        throw error;
      }

      await sleep(5_000);
    }
  }
}

function isRareApiMerkleProofNotFound(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('API error 404 on /v1/merkle-roots/nfts/proof') &&
    (
      message.includes('No Merkle root found') ||
      message.includes('Merkle list not found')
    )
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
