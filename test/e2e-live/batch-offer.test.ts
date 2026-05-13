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
const live = new LiveFixtureRef<BatchOfferFixture>(`Live environment is not configured: ${missingEnv.join(', ')}`);
const OFFER_AMOUNT = '0.000001';

describeLive('live batch offer CLI write commands', () => {
  beforeAll(async () => {
    const fixture = requireBuyerFixture(await createLiveFixture({ buyer: true }));
    try {
      const batchOfferCreator = getContractAddresses(fixture.chain).batchOfferCreator;
      if (batchOfferCreator === undefined) {
        live.set({ ...fixture });
        return;
      }

      const collection = await deployErc721Collection(fixture, '2');
      live.set({
        ...fixture,
        batchOfferCreator,
        collection,
        batchOfferToken: await step('mint batch offer token', () =>
          mintToken(fixture, collection.contract),
        ),
        batchOfferProofToken: await step('mint batch offer proof token', () =>
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

  it('creates, revokes, recreates, and accepts a batch offer', async () => {
    const fixture = live.value;
    if (
      fixture.batchOfferCreator === undefined ||
      fixture.collection === undefined ||
      fixture.batchOfferToken === undefined ||
      fixture.batchOfferProofToken === undefined
    ) {
      return;
    }

    const tokenCsv = join(fixture.tempDir, 'batch-offer-tokens.csv');
    const artifactPath = join(fixture.tempDir, 'batch-offer-artifact.json');
    const proofPath = join(fixture.tempDir, 'batch-offer-proof.json');
    await writeFile(tokenCsv, [
      'contract_address,token_id,chain_id',
      `${fixture.collection.contract},${fixture.batchOfferToken.tokenId},${fixture.chainId}`,
      `${fixture.collection.contract},${fixture.batchOfferProofToken.tokenId},${fixture.chainId}`,
    ].join('\n'), 'utf8');

    const artifact = await step('build batch offer token tree artifact', () =>
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

    const proof = await step('build batch offer token proof', () =>
      jsonCommand<BatchTreeProofResult>(fixture.sellerHome, [
        'batch',
        'tree',
        'proof',
        '--input',
        artifactPath,
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.batchOfferToken.tokenId,
        '--output',
        proofPath,
      ]),
    );
    expect(proof.root).toBe(artifact.root);
    expect(proof.valid).toBe(true);
    expect(proof.output).toBe(proofPath);

    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const createdForRevoke = await step('create batch offer for revocation', () =>
      jsonCommand<BatchOfferWriteResult>(fixture.buyerHome, [
        'batch',
        'offer',
        'create',
        '--input',
        artifactPath,
        '--amount',
        OFFER_AMOUNT,
        '--expiry',
        expiry.toString(),
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(createdForRevoke);
    expect(isAddressEqual(createdForRevoke.batchOfferCreator, fixture.batchOfferCreator)).toBe(true);
    expect(isAddressEqual(createdForRevoke.creator, fixture.buyerAddress)).toBe(true);
    expect(createdForRevoke.root).toBe(artifact.root);
    expect(isAddressEqual(createdForRevoke.currency, ETH_ADDRESS)).toBe(true);
    expect(BigInt(createdForRevoke.requiredPayment ?? '0')).toBeGreaterThanOrEqual(parseEther(OFFER_AMOUNT));
    await expectBatchOfferStatus(fixture, artifactPath, true);

    const revoked = await step('revoke batch offer', () =>
      jsonCommand<BatchOfferWriteResult>(fixture.buyerHome, [
        'batch',
        'offer',
        'revoke',
        '--input',
        artifactPath,
        '--chain',
        fixture.chain,
      ]),
    );
    expectTx(revoked);
    expect(revoked.root).toBe(artifact.root);
    await expectBatchOfferStatus(fixture, artifactPath, false);

    const createdForAccept = await step('create batch offer for acceptance', () =>
      jsonCommand<BatchOfferWriteResult>(fixture.buyerHome, [
        'batch',
        'offer',
        'create',
        '--input',
        artifactPath,
        '--amount',
        OFFER_AMOUNT,
        '--expiry',
        expiry.toString(),
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(createdForAccept);
    expect(createdForAccept.root).toBe(artifact.root);

    const accepted = await step('accept batch offer', () =>
      jsonCommand<BatchOfferWriteResult>(fixture.sellerHome, [
        'batch',
        'offer',
        'accept',
        '--creator',
        fixture.buyerAddress,
        '--proof',
        proofPath,
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.batchOfferToken.tokenId,
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(accepted);
    expect(accepted.approvalTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(accepted.root).toBe(artifact.root);
    await expectBatchOfferStatus(fixture, artifactPath, false);
    await expectTokenOwner(fixture, fixture.collection.contract, fixture.batchOfferToken.tokenId, fixture.buyerAddress);
  });
});

type BatchOfferFixture = BuyerLiveFixture & {
  batchOfferCreator?: Address;
  collection?: DeployErc721Result;
  batchOfferToken?: MintResult;
  batchOfferProofToken?: MintResult;
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

type BatchOfferWriteResult = TxResult & {
  approvalTxHash?: string | null;
  batchOfferCreator: Address;
  creator: Address;
  root: Hex;
  currency: Address;
  requiredPayment?: string;
};

async function expectBatchOfferStatus(
  fixture: BatchOfferFixture,
  artifactPath: string,
  hasOffer: boolean,
): Promise<void> {
  const status = await jsonCommand<{ hasOffer: boolean }>(fixture.sellerHome, [
    'batch',
    'offer',
    'status',
    '--creator',
    fixture.buyerAddress,
    '--input',
    artifactPath,
    '--chain',
    fixture.chain,
  ]);
  expect(status.hasOffer).toBe(hasOffer);
}
