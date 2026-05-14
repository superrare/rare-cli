import { afterAll, beforeAll, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Address } from 'viem';
import { chainIds } from '../../src/contracts/addresses.js';
import { describeLive, expectTx, jsonCommand, step, type TxResult } from './live-helpers.js';
import {
  cleanupLiveCliFixture,
  createLiveCliFixture,
  deployErc721Collection,
  expectTokenOwner,
  liveAuctionDurationSeconds,
  mintToken,
  waitForAuctionToEnd,
  type DeployResult,
  type LiveCliFixture,
  type MintResult,
  LiveCliFixtureRef,
} from './helpers/live-cli-fixture.js';

type BatchFixture = LiveCliFixture & {
  collection: DeployResult;
  offerRevokeTokens: [MintResult, MintResult];
  offerAcceptTokens: [MintResult, MintResult];
  auctionCancelTokens: [MintResult, MintResult];
  auctionSettleTokens: [MintResult, MintResult];
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
  settlementEligible: boolean;
};

const live = new LiveCliFixtureRef<BatchFixture>('Live batch marketplace CLI fixture has not been initialized.');

describeLive('live batch marketplace CLI commands', () => {
  beforeAll(async () => {
    const fixture = await createLiveCliFixture();
    try {
      const collection = await deployErc721Collection(fixture, '8');
      live.set({
        ...fixture,
        collection,
        offerRevokeTokens: [
          await step('mint batch offer revoke token 1', () => mintToken(fixture, collection.contract)),
          await step('mint batch offer revoke token 2', () => mintToken(fixture, collection.contract)),
        ],
        offerAcceptTokens: [
          await step('mint batch offer accept token 1', () => mintToken(fixture, collection.contract)),
          await step('mint batch offer accept token 2', () => mintToken(fixture, collection.contract)),
        ],
        auctionCancelTokens: [
          await step('mint batch auction cancel token 1', () => mintToken(fixture, collection.contract)),
          await step('mint batch auction cancel token 2', () => mintToken(fixture, collection.contract)),
        ],
        auctionSettleTokens: [
          await step('mint batch auction settle token 1', () => mintToken(fixture, collection.contract)),
          await step('mint batch auction settle token 2', () => mintToken(fixture, collection.contract)),
        ],
      });
    } catch (error) {
      await cleanupLiveCliFixture(fixture);
      throw error;
    }
  });

  afterAll(async () => {
    await cleanupLiveCliFixture(live.optionalValue);
  });

  it('creates, reads, and revokes a batch offer', async () => {
    const fixture = live.value;
    const tree = await buildBatchTree(fixture, 'offer-revoke', fixture.offerRevokeTokens);
    const expiry = Math.floor(Date.now() / 1000) + 3_600;

    const created = await step('create batch offer for revoke', () =>
      jsonCommand<BatchOfferCreateResult>(fixture.buyerHome, [
        'batch',
        'offer',
        'create',
        '--input',
        tree.artifactPath,
        '--amount',
        '0.000001',
        '--expiry',
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
        'batch',
        'offer',
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
    const [token] = fixture.offerAcceptTokens;
    const tree = await buildBatchTree(fixture, 'offer-accept', fixture.offerAcceptTokens);
    const proof = await buildBatchProof(fixture, tree.artifactPath, 'offer-accept', token);
    const expiry = Math.floor(Date.now() / 1000) + 3_600;

    expectTx(await step('create batch offer for accept', () =>
      jsonCommand<BatchOfferCreateResult>(fixture.buyerHome, [
        'batch',
        'offer',
        'create',
        '--input',
        tree.artifactPath,
        '--amount',
        '0.000001',
        '--expiry',
        expiry.toString(),
        '--chain',
        fixture.chain,
      ], 240_000),
    ));

    const accepted = await step('accept batch offer', () =>
      jsonCommand<TxResult & { seller: Address; buyer: Address; root: `0x${string}` }>(fixture.sellerHome, [
        'batch',
        'offer',
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
    const tree = await buildBatchTree(fixture, 'auction-cancel', fixture.auctionCancelTokens);
    const [token] = fixture.auctionCancelTokens;
    const proof = await buildBatchProof(fixture, tree.artifactPath, 'auction-cancel', token);

    const created = await step('create batch auction for cancel', () =>
      jsonCommand<BatchAuctionCreateResult>(fixture.sellerHome, [
        'batch',
        'auction',
        'create',
        '--input',
        tree.artifactPath,
        '--reserve',
        '0.000001',
        '--duration',
        liveAuctionDurationSeconds().toString(),
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(created);
    expect(created.creator.toLowerCase()).toBe(fixture.sellerAddress.toLowerCase());
    expect(created.root).toBe(tree.root);

    const configured = await readBatchAuctionStatus(fixture, token, proof.proofPath, tree.root);
    expect(configured.state).toBe('CONFIGURED');
    expect(configured.hasRootConfig).toBe(true);
    expect(configured.root).toBe(tree.root);

    const cancelled = await step('cancel batch auction root', () =>
      jsonCommand<TxResult & { creator: Address; root: `0x${string}` }>(fixture.sellerHome, [
        'batch',
        'auction',
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
    const [token] = fixture.auctionSettleTokens;
    const tree = await buildBatchTree(fixture, 'auction-settle', fixture.auctionSettleTokens);
    const proof = await buildBatchProof(fixture, tree.artifactPath, 'auction-settle', token);

    expectTx(await step('create batch auction for settlement', () =>
      jsonCommand<BatchAuctionCreateResult>(fixture.sellerHome, [
        'batch',
        'auction',
        'create',
        '--input',
        tree.artifactPath,
        '--reserve',
        '0.000001',
        '--duration',
        liveAuctionDurationSeconds().toString(),
        '--chain',
        fixture.chain,
      ], 240_000),
    ));

    expectTx(await step('bid on batch auction', () =>
      jsonCommand<TxResult & { bidder: Address; root: `0x${string}` }>(fixture.buyerHome, [
        'batch',
        'auction',
        'bid',
        '--creator',
        fixture.sellerAddress,
        '--proof',
        proof.proofPath,
        '--contract',
        fixture.collection.contract,
        '--token-id',
        token.tokenId,
        '--amount',
        '0.000001',
        '--chain',
        fixture.chain,
      ], 240_000),
    ));

    await step('wait for batch auction to end', waitForAuctionToEnd);
    const ended = await readBatchAuctionStatus(fixture, token, proof.proofPath, tree.root);
    expect(ended.state).toBe('ENDED');
    expect(ended.settlementEligible).toBe(true);

    expectTx(await step('settle batch auction', () =>
      jsonCommand<TxResult & { seller: Address; bidder: Address }>(fixture.sellerHome, [
        'batch',
        'auction',
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
    'batch',
    'offer',
    'status',
    '--creator',
    fixture.buyerAddress,
    '--root',
    root,
    '--chain',
    fixture.chain,
  ]);
}

async function readBatchAuctionStatus(
  fixture: BatchFixture,
  token: MintResult,
  proofPath: string,
  root: `0x${string}`,
): Promise<BatchAuctionStatus> {
  return jsonCommand<BatchAuctionStatus>(fixture.sellerHome, [
    'batch',
    'auction',
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
