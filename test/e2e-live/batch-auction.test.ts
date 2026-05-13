import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isAddressEqual, parseEther, type Address, type Hex } from 'viem';
import { ETH_ADDRESS, getContractAddresses } from '../../src/contracts/addresses.js';
import {
  cleanupLiveFixture,
  createLiveFixture,
  expectTx,
  jsonCommand,
  LiveFixtureRef,
  missingEnv,
  requireBuyerFixture,
  step,
  type BuyerLiveFixture,
  type TxResult,
} from './helpers/live-harness.js';
import {
  deployErc721Collection,
  expectTokenOwner,
  mintToken,
  type DeployErc721Result,
  type MintResult,
} from './helpers/live-erc721.js';

const describeLive = missingEnv.length === 0 ? describe.sequential : describe.skip;
const live = new LiveFixtureRef<BatchAuctionFixture>(`Live environment is not configured: ${missingEnv.join(', ')}`);
const RESERVE_AMOUNT = '0.000001';

describeLive('live batch auction CLI write commands', () => {
  beforeAll(async () => {
    const fixture = requireBuyerFixture(await createLiveFixture({ buyer: true }));
    try {
      const batchAuctionHouse = getContractAddresses(fixture.chain).batchAuctionHouse;
      if (batchAuctionHouse === undefined) {
        live.set({ ...fixture });
        return;
      }

      const collection = await deployErc721Collection(fixture, '2');
      live.set({
        ...fixture,
        batchAuctionHouse,
        collection,
        batchAuctionToken: await step('mint batch auction token', () =>
          mintToken(fixture, collection.contract),
        ),
        batchAuctionProofToken: await step('mint batch auction proof token', () =>
          mintToken(fixture, collection.contract),
        ),
      });
    } catch (error) {
      await cleanupLiveFixture(fixture);
      throw error;
    }
  });

  afterAll(async () => {
    await cleanupLiveFixture(live.optionalValue);
  });

  it('creates, bids, and settles a batch auction', async () => {
    const fixture = live.value;
    if (
      fixture.batchAuctionHouse === undefined ||
      fixture.collection === undefined ||
      fixture.batchAuctionToken === undefined ||
      fixture.batchAuctionProofToken === undefined
    ) {
      return;
    }

    const tokenCsv = join(fixture.tempDir, 'batch-auction-tokens.csv');
    const artifactPath = join(fixture.tempDir, 'batch-auction-artifact.json');
    const proofPath = join(fixture.tempDir, 'batch-auction-proof.json');
    await writeFile(tokenCsv, [
      'contract_address,token_id,chain_id',
      `${fixture.collection.contract},${fixture.batchAuctionToken.tokenId},${fixture.chainId}`,
      `${fixture.collection.contract},${fixture.batchAuctionProofToken.tokenId},${fixture.chainId}`,
    ].join('\n'), 'utf8');

    const artifact = await step('build batch auction token tree artifact', () =>
      jsonCommand<BatchTreeBuildResult>(fixture.sellerHome, [
        'batch',
        'tree',
        'build',
        '--input',
        tokenCsv,
        '--output',
        artifactPath,
      ]),
    );
    expect(artifact.count).toBe(2);
    expect(artifact.chainId).toBe(fixture.chainId);
    expect(artifact.output).toBe(artifactPath);

    const proof = await step('build batch auction token proof', () =>
      jsonCommand<BatchTreeProofResult>(fixture.sellerHome, [
        'batch',
        'tree',
        'proof',
        '--input',
        artifactPath,
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.batchAuctionToken.tokenId,
        '--output',
        proofPath,
      ]),
    );
    expect(proof.root).toBe(artifact.root);
    expect(proof.valid).toBe(true);
    expect(proof.output).toBe(proofPath);

    const created = await step('create batch auction root', () =>
      jsonCommand<BatchAuctionWriteResult>(fixture.sellerHome, [
        'batch',
        'auction',
        'create',
        '--input',
        artifactPath,
        '--reserve',
        RESERVE_AMOUNT,
        '--duration',
        '1',
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(created);
    expect(isAddressEqual(created.batchAuctionHouse, fixture.batchAuctionHouse)).toBe(true);
    expect(isAddressEqual(created.creator, fixture.sellerAddress)).toBe(true);
    expect(created.root).toBe(artifact.root);
    expect(isAddressEqual(created.currency, ETH_ADDRESS)).toBe(true);
    expect(created.approvalTxHashes?.length).toBeGreaterThanOrEqual(1);

    await expectBatchAuctionStatus({
      fixture,
      artifactPath,
      contract: fixture.collection.contract,
      tokenId: fixture.batchAuctionToken.tokenId,
      state: 'RESERVE_NOT_MET',
      hasAuction: false,
    });

    const bid = await step('bid on batch auction token', () =>
      jsonCommand<BatchAuctionWriteResult>(fixture.buyerHome, [
        'batch',
        'auction',
        'bid',
        '--creator',
        fixture.sellerAddress,
        '--proof',
        proofPath,
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.batchAuctionToken.tokenId,
        '--amount',
        RESERVE_AMOUNT,
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(bid);
    expect(isAddressEqual(bid.creator, fixture.sellerAddress)).toBe(true);
    expect(bid.root).toBe(artifact.root);
    expect(BigInt(bid.requiredPayment ?? '0')).toBeGreaterThanOrEqual(parseEther(RESERVE_AMOUNT));

    await expectBatchAuctionStatus({
      fixture,
      artifactPath,
      contract: fixture.collection.contract,
      tokenId: fixture.batchAuctionToken.tokenId,
      state: 'ACTIVE',
      hasAuction: true,
      currentBidder: fixture.buyerAddress,
    });

    await waitForBatchAuctionSettlement();

    const settled = await step('settle batch auction token', () =>
      jsonCommand<BatchAuctionWriteResult>(fixture.sellerHome, [
        'batch',
        'auction',
        'settle',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.batchAuctionToken.tokenId,
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(settled);
    await expectTokenOwner(fixture, fixture.collection.contract, fixture.batchAuctionToken.tokenId, fixture.buyerAddress);
  });
});

type BatchAuctionFixture = BuyerLiveFixture & {
  batchAuctionHouse?: Address;
  collection?: DeployErc721Result;
  batchAuctionToken?: MintResult;
  batchAuctionProofToken?: MintResult;
};

type BatchTreeBuildResult = {
  root: Hex;
  count: number;
  chainId: number;
  output: string;
};

type BatchTreeProofResult = {
  root: Hex;
  valid: boolean;
  output: string;
};

type BatchAuctionWriteResult = TxResult & {
  approvalTxHashes?: string[];
  batchAuctionHouse: Address;
  creator: Address;
  root: Hex;
  currency: Address;
  requiredPayment?: string;
};

type BatchAuctionStatusResult = {
  state: string;
  hasAuction: boolean;
  currentBidder: Address | null;
};

async function expectBatchAuctionStatus(opts: {
  fixture: BatchAuctionFixture;
  artifactPath: string;
  contract: Address;
  tokenId: string;
  state: string;
  hasAuction: boolean;
  currentBidder?: Address;
}): Promise<void> {
  const status = await jsonCommand<BatchAuctionStatusResult>(opts.fixture.sellerHome, [
    'batch',
    'auction',
    'status',
    '--creator',
    opts.fixture.sellerAddress,
    '--input',
    opts.artifactPath,
    '--proof',
    opts.artifactPath.replace('-artifact.json', '-proof.json'),
    '--contract',
    opts.contract,
    '--token-id',
    opts.tokenId,
    '--chain',
    opts.fixture.chain,
  ]);

  expect(status.state).toBe(opts.state);
  expect(status.hasAuction).toBe(opts.hasAuction);
  if (opts.currentBidder !== undefined) {
    expect(status.currentBidder === null ? false : isAddressEqual(status.currentBidder, opts.currentBidder)).toBe(true);
  }
}

async function waitForBatchAuctionSettlement(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 15_000));
}
