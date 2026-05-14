import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeLive, expectTx, jsonCommand, step, type TxResult } from './live-helpers.js';
import {
  cleanupLiveCliFixture,
  createLiveCliFixture,
  deployErc721Collection,
  expectAuctionStatus,
  liveAuctionDurationSeconds,
  mintToken,
  waitForAuctionToEnd,
  type DeployResult,
  type MintResult,
  type LiveCliFixture,
  LiveCliFixtureRef,
} from './helpers/live-cli-fixture.js';

type AuctionFixture = LiveCliFixture & {
  collection: DeployResult;
  auctionCancelToken: MintResult;
  auctionSettleToken: MintResult;
  buyerAuctionCancelToken: MintResult;
};

const live = new LiveCliFixtureRef<AuctionFixture>('Live auction CLI fixture has not been initialized.');

describeLive('live auction CLI writes', () => {
  beforeAll(async () => {
    const fixture = await createLiveCliFixture();
    try {
      const collection = await deployErc721Collection(fixture, '6');
      live.set({
        ...fixture,
        collection,
        auctionCancelToken: await step('mint auction cancel token', () =>
          mintToken(fixture, collection.contract),
        ),
        auctionSettleToken: await step('mint auction settle token', () =>
          mintToken(fixture, collection.contract),
        ),
        buyerAuctionCancelToken: await step('mint buyer-owned auction token', () =>
          mintToken(fixture, collection.contract, { to: fixture.buyerAddress }),
        ),
      });
    } catch (error) {
      await cleanupLiveCliFixture(fixture);
      throw error;
    }
  });

  afterAll(async () => {
    await cleanupLiveCliFixture(live.optionalValue);
  });

  it('creates and cancels an auction', async () => {
    const fixture = live.value;
    const auctionCancelCreate = await step('create auction for cancellation', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'auction',
        'create',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.auctionCancelToken.tokenId,
        '--starting-price',
        '0.000001',
        '--duration',
        liveAuctionDurationSeconds().toString(),
        '--chain',
        fixture.chain,
      ]),
    );
    expectTx(auctionCancelCreate);
    expect(auctionCancelCreate.approvalTxHash).toBeNull();

    await expectAuctionStatus(fixture, fixture.sellerHome, fixture.collection.contract, fixture.auctionCancelToken.tokenId, 'PENDING');
    expectTx(await step('cancel auction', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'auction',
        'cancel',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.auctionCancelToken.tokenId,
        '--chain',
        fixture.chain,
      ]),
    ));
  });

  it('auto-approves a buyer-owned token before creating and cancelling an auction', async () => {
    const fixture = live.value;
    const buyerAuctionCreate = await step('create buyer-owned auction for cancellation', () =>
      jsonCommand<TxResult>(fixture.buyerHome, [
        'auction',
        'create',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.buyerAuctionCancelToken.tokenId,
        '--starting-price',
        '0.000001',
        '--duration',
        liveAuctionDurationSeconds().toString(),
        '--chain',
        fixture.chain,
      ]),
    );

    expectTx(buyerAuctionCreate);
    expect(buyerAuctionCreate.approvalTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    await expectAuctionStatus(fixture, fixture.buyerHome, fixture.collection.contract, fixture.buyerAuctionCancelToken.tokenId, 'PENDING');

    expectTx(await step('cancel buyer-owned auction', () =>
      jsonCommand<TxResult>(fixture.buyerHome, [
        'auction',
        'cancel',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.buyerAuctionCancelToken.tokenId,
        '--chain',
        fixture.chain,
      ]),
    ));
  });

  it('creates, bids, and settles an auction', async () => {
    const fixture = live.value;
    const auctionSettleCreate = await step('create auction for settlement', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'auction',
        'create',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.auctionSettleToken.tokenId,
        '--starting-price',
        '0.000001',
        '--duration',
        liveAuctionDurationSeconds().toString(),
        '--chain',
        fixture.chain,
      ]),
    );
    expectTx(auctionSettleCreate);
    expect(auctionSettleCreate.approvalTxHash).toBeNull();

    expectTx(await step('bid on auction', () =>
      jsonCommand<TxResult>(fixture.buyerHome, [
        'auction',
        'bid',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.auctionSettleToken.tokenId,
        '--amount',
        '0.000001',
        '--chain',
        fixture.chain,
      ]),
    ));
    await step('wait for auction to end', waitForAuctionToEnd);
    await expectAuctionStatus(fixture, fixture.sellerHome, fixture.collection.contract, fixture.auctionSettleToken.tokenId, 'ENDED');
    expectTx(await step('settle auction', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'auction',
        'settle',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.auctionSettleToken.tokenId,
        '--chain',
        fixture.chain,
      ]),
    ));
  });
});
