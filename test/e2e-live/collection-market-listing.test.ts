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
const live = new LiveFixtureRef<CollectionMarketListingFixture>(`Live environment is not configured: ${missingEnv.join(', ')}`);
const LISTING_AMOUNT = '0.000001';

describeLive('live collection-market listing CLI write commands', () => {
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
        listingToken: await step('mint collection-market listing token', () =>
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

  it('sets, cancels, resets, and buys a collection-wide listing when RareCollectionMarket is configured', async () => {
    const fixture = live.value;
    if (fixture.collectionMarket === undefined || fixture.collection === undefined || fixture.listingToken === undefined) {
      return;
    }

    const setForCancel = await step('create collection-wide listing for cancellation', () =>
      jsonCommand<CollectionMarketListingWriteResult>(fixture.sellerHome, [
        'listing',
        'create',
        '--collection',
        fixture.collection.contract,
        '--amount',
        LISTING_AMOUNT,
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(setForCancel);
    expect(isAddressEqual(setForCancel.collectionMarket, fixture.collectionMarket)).toBe(true);
    expect(isAddressEqual(setForCancel.seller, fixture.sellerAddress)).toBe(true);
    expect(isAddressEqual(setForCancel.originCollection, fixture.collection.contract)).toBe(true);
    await expectCollectionMarketListingStatus({
      fixture,
      home: fixture.buyerHome,
      seller: fixture.sellerAddress,
      collection: fixture.collection.contract,
      tokenId: fixture.listingToken.tokenId,
      hasListing: true,
      canBuy: true,
      account: fixture.buyerAddress,
    });

    const cancelled = await step('cancel collection-wide listing', () =>
      jsonCommand<CollectionMarketListingWriteResult>(fixture.sellerHome, [
        'listing',
        'cancel',
        '--collection',
        fixture.collection.contract,
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(cancelled);
    expect(cancelled.hadListing).toBe(true);
    await expectCollectionMarketListingStatus({
      fixture,
      home: fixture.buyerHome,
      seller: fixture.sellerAddress,
      collection: fixture.collection.contract,
      tokenId: fixture.listingToken.tokenId,
      hasListing: false,
      canBuy: false,
      account: fixture.buyerAddress,
    });

    const setForBuy = await step('create collection-wide listing for purchase', () =>
      jsonCommand<CollectionMarketListingWriteResult>(fixture.sellerHome, [
        'listing',
        'create',
        '--collection',
        fixture.collection.contract,
        '--amount',
        LISTING_AMOUNT,
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(setForBuy);

    const bought = await step('buy collection-wide listing', () =>
      jsonCommand<CollectionMarketListingWriteResult>(fixture.buyerHome, [
        'listing',
        'buy',
        '--collection',
        fixture.collection.contract,
        '--seller',
        fixture.sellerAddress,
        '--token-id',
        fixture.listingToken.tokenId,
        '--amount',
        LISTING_AMOUNT,
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(bought);
    expect(bought.buyer === undefined ? false : isAddressEqual(bought.buyer, fixture.buyerAddress)).toBe(true);
    await expectCollectionMarketListingStatus({
      fixture,
      home: fixture.buyerHome,
      seller: fixture.sellerAddress,
      collection: fixture.collection.contract,
      tokenId: fixture.listingToken.tokenId,
      hasListing: true,
      canBuy: false,
      account: fixture.buyerAddress,
    });
    await expectTokenOwner(fixture, fixture.collection.contract, fixture.listingToken.tokenId, fixture.buyerAddress);
  });
});

type CollectionMarketListingFixture = BuyerLiveFixture & {
  collectionMarket?: Address;
  collection?: DeployErc721Result;
  listingToken?: MintResult;
};

type CollectionMarketListingWriteResult = TxResult & {
  approvalTxHash?: string | null;
  collectionMarket: Address;
  seller: Address;
  buyer?: Address;
  originCollection: Address;
  hadListing?: boolean;
};

type CollectionMarketListingStatusResult = {
  hasListing: boolean;
  canBuy: boolean;
};

async function expectCollectionMarketListingStatus(opts: {
  fixture: CollectionMarketListingFixture;
  home: string;
  seller: Address;
  collection: Address;
  tokenId: string;
  hasListing: boolean;
  canBuy: boolean;
  account: Address;
}): Promise<void> {
  const status = await jsonCommand<CollectionMarketListingStatusResult>(opts.home, [
    'listing',
    'status',
    '--collection',
    opts.collection,
    '--seller',
    opts.seller,
    '--token-id',
    opts.tokenId,
    '--account',
    opts.account,
    '--chain',
    opts.fixture.chain,
  ]);
  expect(status.hasListing).toBe(opts.hasListing);
  expect(status.canBuy).toBe(opts.canBuy);
}
