import { afterAll, beforeAll, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MerkleTree } from 'merkletreejs';
import { encodePacked, getAddress, keccak256, parseEther, type Address } from 'viem';
import { chainIds, ETH_ADDRESS } from '../../src/contracts/addresses.js';
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

type BatchListingCreateResult = TxResult & {
  root: `0x${string}`;
  approvalTxHashes: string[] | null;
};

const live = new LiveCliFixtureRef<BatchFixture>('Live batch marketplace CLI fixture has not been initialized.');

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
    const listing = await buildBatchListingArtifact(fixture, 'listing-buy', tokens);

    const created = await step('create batch listing as maker', () =>
      jsonCommand<BatchListingCreateResult>(fixture.sellerHome, [
        'listing',
        'batch',
        'create',
        '--input',
        listing.artifactPath,
        '--yes',
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(created);
    expect(created.root).toMatch(/^0x[0-9a-fA-F]{64}$/);

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

async function buildBatchListingArtifact(
  fixture: BatchFixture,
  name: string,
  tokens: readonly [MintResult, MintResult],
): Promise<{ artifactPath: string; root: `0x${string}` }> {
  const artifactPath = join(fixture.sellerHome, `${name}-listing-root.json`);
  const tokenEntries = tokens.map((token) => ({
    contract: fixture.collection.contract,
    tokenId: token.tokenId,
  }));
  const root = buildBatchListingRoot(tokenEntries);

  await writeFile(artifactPath, `${JSON.stringify({
    root,
    currency: ETH_ADDRESS,
    amount: parseEther('0.000001').toString(),
    splitAddresses: [],
    splitRatios: [],
    tokens: tokenEntries,
  }, null, 2)}\n`, 'utf8');

  return { artifactPath, root };
}

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
  const inputPath = join(fixture.sellerHome, `${name}-tokens.csv`);
  const artifactPath = join(fixture.sellerHome, `${name}-tree.json`);
  await writeFile(inputPath, [
    'contract_address,token_id,chain_id',
    `${fixture.collection.contract},${tokens[0].tokenId},${chainIds[fixture.chain]}`,
    `${fixture.collection.contract},${tokens[1].tokenId},${chainIds[fixture.chain]}`,
    '',
  ].join('\n'), 'utf8');

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

function buildBatchListingRoot(tokens: readonly { contract: Address; tokenId: string }[]): `0x${string}` {
  const leaves = [...tokens]
    .map((token) => ({
      contract: getAddress(token.contract),
      tokenId: BigInt(token.tokenId),
    }))
    .sort((a, b) => {
      const addressSort = a.contract.localeCompare(b.contract);
      return addressSort === 0 ? a.tokenId.toString().localeCompare(b.tokenId.toString()) : addressSort;
    })
    .map((token) => hexBuffer(keccak256(encodePacked(['address', 'uint256'], [token.contract, token.tokenId]))));
  const tree = new MerkleTree(leaves, (data: Buffer) => hexBuffer(keccak256(data)), {
    sortPairs: true,
  });
  const root = tree.getHexRoot();
  assertBytes32(root);
  return root;
}

function hexBuffer(hex: `0x${string}` | Buffer): Buffer {
  if (Buffer.isBuffer(hex)) return hex;
  return Buffer.from(hex.slice(2), 'hex');
}

function assertBytes32(value: string): asserts value is `0x${string}` {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`Invalid batch listing root generated by test fixture: ${value}`);
  }
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
