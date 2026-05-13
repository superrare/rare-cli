import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isAddressEqual, type Address } from 'viem';
import { getContractAddresses } from '../../src/contracts/addresses.js';
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
const live = new LiveFixtureRef<CollectionMarketOfferFixture>(`Live environment is not configured: ${missingEnv.join(', ')}`);
const OFFER_AMOUNT = '0.000001';

describeLive('live collection-market offer CLI write commands', () => {
  beforeAll(async () => {
    const fixture = requireBuyerFixture(await createLiveFixture({ buyer: true }));
    try {
      const collectionMarket = getContractAddresses(fixture.chain).collectionMarket;
      if (collectionMarket === undefined) {
        live.set({ ...fixture });
        return;
      }

      const collection = await deployErc721Collection(fixture, '1');
      live.set({
        ...fixture,
        collectionMarket,
        collection,
        offerToken: await step('mint collection-market offer token', () =>
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

  it('creates, cancels, recreates, and accepts a collection-wide offer when RareCollectionMarket is configured', async () => {
    const fixture = live.value;
    if (fixture.collectionMarket === undefined || fixture.collection === undefined || fixture.offerToken === undefined) {
      return;
    }

    const createdForCancel = await step('create collection-wide offer for cancellation', () =>
      jsonCommand<CollectionMarketOfferWriteResult>(fixture.buyerHome, [
        'offer',
        'create',
        '--collection',
        fixture.collection.contract,
        '--amount',
        OFFER_AMOUNT,
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(createdForCancel);
    expect(isAddressEqual(createdForCancel.collectionMarket, fixture.collectionMarket)).toBe(true);
    expect(isAddressEqual(createdForCancel.buyer, fixture.buyerAddress)).toBe(true);
    expect(isAddressEqual(createdForCancel.originCollection, fixture.collection.contract)).toBe(true);
    await expectCollectionMarketOfferStatus({
      fixture,
      home: fixture.sellerHome,
      buyer: fixture.buyerAddress,
      collection: fixture.collection.contract,
      tokenId: fixture.offerToken.tokenId,
      hasOffer: true,
      canAccept: true,
      account: fixture.sellerAddress,
    });

    const cancelled = await step('cancel collection-wide offer', () =>
      jsonCommand<CollectionMarketOfferWriteResult>(fixture.buyerHome, [
        'offer',
        'cancel',
        '--collection',
        fixture.collection.contract,
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(cancelled);
    expect(cancelled.hadOffer).toBe(true);
    await expectCollectionMarketOfferStatus({
      fixture,
      home: fixture.sellerHome,
      buyer: fixture.buyerAddress,
      collection: fixture.collection.contract,
      tokenId: fixture.offerToken.tokenId,
      hasOffer: false,
      canAccept: false,
      account: fixture.sellerAddress,
    });

    const createdForAccept = await step('create collection-wide offer for acceptance', () =>
      jsonCommand<CollectionMarketOfferWriteResult>(fixture.buyerHome, [
        'offer',
        'create',
        '--collection',
        fixture.collection.contract,
        '--amount',
        OFFER_AMOUNT,
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(createdForAccept);

    const accepted = await step('accept collection-wide offer', () =>
      jsonCommand<CollectionMarketOfferWriteResult>(fixture.sellerHome, [
        'offer',
        'accept',
        '--collection',
        fixture.collection.contract,
        '--buyer',
        fixture.buyerAddress,
        '--token-id',
        fixture.offerToken.tokenId,
        '--amount',
        OFFER_AMOUNT,
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(accepted);
    expect(accepted.approvalTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    await expectCollectionMarketOfferStatus({
      fixture,
      home: fixture.sellerHome,
      buyer: fixture.buyerAddress,
      collection: fixture.collection.contract,
      tokenId: fixture.offerToken.tokenId,
      hasOffer: false,
      canAccept: false,
      account: fixture.sellerAddress,
    });
    await expectTokenOwner(fixture, fixture.collection.contract, fixture.offerToken.tokenId, fixture.buyerAddress);
  });
});

type CollectionMarketOfferFixture = BuyerLiveFixture & {
  collectionMarket?: Address;
  collection?: DeployErc721Result;
  offerToken?: MintResult;
};

type CollectionMarketOfferWriteResult = TxResult & {
  approvalTxHash?: string | null;
  collectionMarket: Address;
  buyer: Address;
  originCollection: Address;
  hadOffer?: boolean;
};

type CollectionMarketOfferStatusResult = {
  hasOffer: boolean;
  canAccept: boolean;
};

async function expectCollectionMarketOfferStatus(opts: {
  fixture: CollectionMarketOfferFixture;
  home: string;
  buyer: Address;
  collection: Address;
  tokenId: string;
  hasOffer: boolean;
  canAccept: boolean;
  account: Address;
}): Promise<void> {
  const status = await jsonCommand<CollectionMarketOfferStatusResult>(opts.home, [
    'offer',
    'status',
    '--collection',
    opts.collection,
    '--buyer',
    opts.buyer,
    '--token-id',
    opts.tokenId,
    '--account',
    opts.account,
    '--chain',
    opts.fixture.chain,
  ]);
  expect(status.hasOffer).toBe(opts.hasOffer);
  expect(status.canAccept).toBe(opts.canAccept);
}
