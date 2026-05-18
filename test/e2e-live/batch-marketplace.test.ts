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

type BatchProofResult = {
  root: `0x${string}`;
  contractAddress: Address;
  tokenId: string;
  proofLength: number;
  valid: boolean;
  output: string;
};

type BatchOfferCreateResult = TxResult & {
  creator: Address;
  root: `0x${string}`;
  amount: string;
  expiry: string;
};

type BatchOfferStatus = {
  state: string;
  creator: Address;
  root: `0x${string}`;
  hasOffer: boolean;
  revoked: boolean | null;
  fillable: boolean;
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

type BatchListingProofResult = {
  root: `0x${string}`;
  contract: Address;
  tokenId: string;
  proof: `0x${string}`[];
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

  it('creates a batch listing and buys it from the taker side', async () => {
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
    expect(created.root).toBe(listing.root);

    const proof = await buildBatchListingProof(fixture, listing.artifactPath, 'listing-buy', token);
    expect(proof.root).toBe(listing.root);
    expect(proof.contract.toLowerCase()).toBe(fixture.collection.contract.toLowerCase());
    expect(proof.tokenId).toBe(token.tokenId);
    expect(proof.proof.length).toBeGreaterThan(0);

    const bought = await step('buy batch listing as taker', () =>
      jsonCommand<TxResult & { tokenContract: Address; tokenId: string }>(fixture.buyerHome, [
        'listing',
        'batch',
        'buy',
        '--proof',
        listing.proofPath,
        '--creator',
        fixture.sellerAddress,
        '--currency',
        'eth',
        '--price',
        '0.000001',
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(bought);
    expect(bought.tokenContract.toLowerCase()).toBe(fixture.collection.contract.toLowerCase());
    expect(bought.tokenId).toBe(token.tokenId);
    await expectTokenOwner(fixture, fixture.buyerHome, fixture.collection.contract, token.tokenId, fixture.buyerAddress);
  });

  it('creates, reads, and revokes a batch offer', async () => {
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
    expect(created.root).toBe(tree.root);

    const active = await readBatchOfferStatus(fixture, tree.root);
    expect(active.state).toBe('ACTIVE');
    expect(active.hasOffer).toBe(true);
    expect(active.fillable).toBe(true);

    const revoked = await step('revoke batch offer', () =>
      jsonCommand<TxResult & { creator: Address; root: `0x${string}` }>(fixture.buyerHome, [
        'offer',
        'batch',
        'revoke',
        '--root',
        tree.root,
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(revoked);
    expect(revoked.creator.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());
    expect(revoked.root).toBe(tree.root);

    const revokedStatus = await readBatchOfferStatus(fixture, tree.root);
    expect(revokedStatus.state).toBe('NONE');
    expect(revokedStatus.revoked).toBeNull();
    expect(revokedStatus.fillable).toBe(false);
  });

  it('creates and accepts a proof-backed batch offer', async () => {
    const fixture = live.value;
    const tokens = await mintBatchTokenPair(fixture, 'batch offer accept');
    const [token] = tokens;
    const tree = await buildBatchTree(fixture, 'offer-accept', tokens);
    const proof = await buildBatchProof(fixture, tree.artifactPath, 'offer-accept', token);
    const expiry = Math.floor(Date.now() / 1000) + 3_600;

    expectTx(await step('create batch offer for accept', () =>
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
    ));

    const accepted = await step('accept batch offer', () =>
      jsonCommand<TxResult & { seller: Address; buyer: Address; root: `0x${string}` }>(fixture.sellerHome, [
        'offer',
        'batch',
        'accept',
        '--creator',
        fixture.buyerAddress,
        '--proof',
        proof.proofPath,
        '--contract',
        fixture.collection.contract,
        '--token-id',
        token.tokenId,
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(accepted);
    expect(accepted.seller.toLowerCase()).toBe(fixture.sellerAddress.toLowerCase());
    expect(accepted.buyer.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());
    expect(accepted.root).toBe(tree.root);
    await expectTokenOwner(fixture, fixture.buyerHome, fixture.collection.contract, token.tokenId, fixture.buyerAddress);
  });

  it('creates, reads, and cancels a batch auction root', async () => {
    const fixture = live.value;
    const tokens = await mintBatchTokenPair(fixture, 'batch auction cancel');
    const tree = await buildBatchTree(fixture, 'auction-cancel', tokens);
    const [token] = tokens;
    const proof = await buildBatchProof(fixture, tree.artifactPath, 'auction-cancel', token);
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
    expect(created.root).toBe(tree.root);

    const configured = await readBatchAuctionStatus(fixture, token, proof.proofPath, tree.root);
    expect(configured.state).toBe('RESERVE_NOT_MET');
    expect(configured.hasRootConfig).toBe(true);
    expect(configured.root).toBe(tree.root);

    const cancelled = await step('cancel batch auction root', () =>
      jsonCommand<TxResult & { creator: Address; root: `0x${string}` }>(fixture.sellerHome, [
        'auction',
        'batch',
        'cancel',
        '--root',
        tree.root,
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(cancelled);
    expect(cancelled.creator.toLowerCase()).toBe(fixture.sellerAddress.toLowerCase());
    expect(cancelled.root).toBe(tree.root);
  });

  it('creates, bids, and settles a proof-backed batch auction', async () => {
    const fixture = live.value;
    const tokens = await mintBatchTokenPair(fixture, 'batch auction settle');
    const [token] = tokens;
    const tree = await buildBatchTree(fixture, 'auction-settle', tokens);
    const proof = await buildBatchProof(fixture, tree.artifactPath, 'auction-settle', token);
    const endTime = Math.floor(Date.now() / 1000) + liveAuctionDurationSeconds();

    expectTx(await step('create batch auction for settlement', () =>
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
    ));

    expectTx(await step('bid on batch auction', () =>
      jsonCommand<TxResult & { bidder: Address; root: `0x${string}` }>(fixture.buyerHome, [
        'auction',
        'batch',
        'bid',
        '--creator',
        fixture.sellerAddress,
        '--proof',
        proof.proofPath,
        '--contract',
        fixture.collection.contract,
        '--token-id',
        token.tokenId,
        '--price',
        '0.000001',
        '--chain',
        fixture.chain,
      ], 240_000),
    ));

    const ended = await step('wait for batch auction to end', () =>
      waitForBatchAuctionToEnd(fixture, token, proof.proofPath, tree.root),
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
): Promise<{ artifactPath: string; proofPath: string; root: `0x${string}` }> {
  const artifactPath = join(fixture.sellerHome, `${name}-listing-root.json`);
  const proofPath = join(fixture.sellerHome, `${name}-listing-proof-${tokens[0].tokenId}.json`);
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

  return { artifactPath, proofPath, root };
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

async function buildBatchListingProof(
  fixture: BatchFixture,
  artifactPath: string,
  name: string,
  token: MintResult,
): Promise<BatchListingProofResult> {
  const proofPath = join(fixture.sellerHome, `${name}-listing-proof-${token.tokenId}.json`);
  return jsonCommand<BatchListingProofResult>(fixture.sellerHome, [
    'utils',
    'merkle',
    'proof',
    '--input',
    artifactPath,
    '--contract',
    fixture.collection.contract,
    '--token-id',
    token.tokenId,
    '--output',
    proofPath,
  ]);
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

async function buildBatchProof(
  fixture: BatchFixture,
  artifactPath: string,
  name: string,
  token: MintResult,
): Promise<{ proofPath: string; root: `0x${string}` }> {
  const proofPath = join(fixture.sellerHome, `${name}-proof-${token.tokenId}.json`);
  const result = await jsonCommand<BatchProofResult>(fixture.sellerHome, [
    'utils',
    'tree',
    'proof',
    '--input',
    artifactPath,
    '--contract',
    fixture.collection.contract,
    '--token-id',
    token.tokenId,
    '--output',
    proofPath,
  ]);

  expect(result.valid).toBe(true);
  expect(result.proofLength).toBeGreaterThan(0);
  expect(result.output).toBe(proofPath);
  return { proofPath, root: result.root };
}

async function readBatchOfferStatus(fixture: BatchFixture, root: `0x${string}`): Promise<BatchOfferStatus> {
  return jsonCommand<BatchOfferStatus>(fixture.buyerHome, [
    'offer',
    'batch',
    'status',
    '--creator',
    fixture.buyerAddress,
    '--root',
    root,
    '--chain',
    fixture.chain,
  ]);
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
  proofPath: string,
  root: `0x${string}`,
): Promise<BatchAuctionStatus> {
  return jsonCommand<BatchAuctionStatus>(fixture.sellerHome, [
    'auction',
    'batch',
    'status',
    '--contract',
    fixture.collection.contract,
    '--token-id',
    token.tokenId,
    '--creator',
    fixture.sellerAddress,
    '--root',
    root,
    '--proof',
    proofPath,
    '--chain',
    fixture.chain,
  ]);
}

async function waitForBatchAuctionToEnd(
  fixture: BatchFixture,
  token: MintResult,
  proofPath: string,
  root: `0x${string}`,
): Promise<BatchAuctionStatus> {
  const timeoutAt = Date.now() + (liveAuctionDurationSeconds() + 120) * 1000;
  let latest = await readBatchAuctionStatus(fixture, token, proofPath, root);

  while (latest.state !== 'ENDED' || !latest.settlementEligible) {
    if (Date.now() >= timeoutAt) {
      throw new Error(
        `Timed out waiting for batch auction to end. Last state: ${latest.state}, ` +
          `settlementEligible: ${String(latest.settlementEligible)}, endTime: ${String(latest.endTime)}.`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 5_000));
    latest = await readBatchAuctionStatus(fixture, token, proofPath, root);
  }

  return latest;
}
