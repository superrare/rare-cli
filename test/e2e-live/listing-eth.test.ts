import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isAddressEqual, type Address } from 'viem';
import { ETH_ADDRESS, PUBLIC_LISTING_TARGET } from '../../src/contracts/addresses.js';
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
  mintToken,
  type DeployErc721Result,
  type MintResult,
} from './helpers/live-erc721.js';

const describeLive = missingEnv.length === 0 ? describe.sequential : describe.skip;
const live = new LiveFixtureRef<ListingFixture>(`Live environment is not configured: ${missingEnv.join(', ')}`);
const LISTING_PRICE = '0.000001';

describeLive('live ETH listing CLI write commands', () => {
  beforeAll(async () => {
    const fixture = requireBuyerFixture(await createLiveFixture({ buyer: true }));
    try {
      const collection = await deployErc721Collection(fixture, '4');
      live.set({
        ...fixture,
        collection,
        listingCancelToken: await step('mint listing cancel token', () =>
          mintToken(fixture, collection.contract),
        ),
        zeroPriceListingToken: await step('mint zero-price listing token', () =>
          mintToken(fixture, collection.contract),
        ),
        listingBuyToken: await step('mint listing buy token', () =>
          mintToken(fixture, collection.contract),
        ),
        listingSplitToken: await step('mint listing split token', () =>
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

  it('creates and cancels a listing', async () => {
    const fixture = live.value;
    const listingCancelCreate = await step('create listing for cancellation', () =>
      jsonCommand<ListingTxResult>(fixture.sellerHome, [
        'listing',
        'create',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.listingCancelToken.tokenId,
        '--price',
        LISTING_PRICE,
        '--chain',
        fixture.chain,
      ]),
    );
    expectTx(listingCancelCreate);
    expect(listingCancelCreate.approvalTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

    const sellerStatus = await readListingStatus(
      fixture,
      fixture.sellerHome,
      fixture.collection.contract,
      fixture.listingCancelToken.tokenId,
    );
    expect(sellerStatus.hasListing).toBe(true);
    expect(sellerStatus.canBuy).toBe(false);
    expectDefaultEthListingStatus(sellerStatus, fixture.sellerAddress);

    expectTx(await step('cancel listing', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'listing',
        'cancel',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.listingCancelToken.tokenId,
        '--chain',
        fixture.chain,
      ]),
    ));
    await expectListingStatus(fixture, fixture.sellerHome, fixture.collection.contract, fixture.listingCancelToken.tokenId, false);
  });

  it('creates a zero-price listing as an inactive listing without repeating approval', async () => {
    const fixture = live.value;
    const zeroPriceListingCreate = await step('create zero-price listing', () =>
      jsonCommand<ListingTxResult>(fixture.sellerHome, [
        'listing',
        'create',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.zeroPriceListingToken.tokenId,
        '--price',
        '0',
        '--chain',
        fixture.chain,
      ]),
    );

    expectTx(zeroPriceListingCreate);
    expect(zeroPriceListingCreate.approvalTxHash).toBeNull();
    await expectListingStatus(fixture, fixture.sellerHome, fixture.collection.contract, fixture.zeroPriceListingToken.tokenId, false);
  });

  it('creates and buys a listing', async () => {
    const fixture = live.value;
    const listingBuyCreate = await step('create listing for purchase', () =>
      jsonCommand<ListingTxResult>(fixture.sellerHome, [
        'listing',
        'create',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.listingBuyToken.tokenId,
        '--price',
        LISTING_PRICE,
        '--chain',
        fixture.chain,
      ]),
    );
    expectTx(listingBuyCreate);
    expect(listingBuyCreate.approvalTxHash).toBeNull();

    const buyerStatus = await readListingStatus(
      fixture,
      fixture.buyerHome,
      fixture.collection.contract,
      fixture.listingBuyToken.tokenId,
    );
    expect(buyerStatus.hasListing).toBe(true);
    expect(buyerStatus.canBuy).toBe(true);
    expectDefaultEthListingStatus(buyerStatus, fixture.sellerAddress);

    expectTx(await step('buy listing', () =>
      jsonCommand<TxResult>(fixture.buyerHome, [
        'listing',
        'buy',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.listingBuyToken.tokenId,
        '--amount',
        LISTING_PRICE,
        '--chain',
        fixture.chain,
      ]),
    ));
    await expectListingStatus(fixture, fixture.sellerHome, fixture.collection.contract, fixture.listingBuyToken.tokenId, false);
  });

  it('creates and reports a listing with payout splits', async () => {
    const fixture = live.value;
    const listingSplitCreate = await step('create listing with payout splits', () =>
      jsonCommand<ListingTxResult>(fixture.sellerHome, [
        'listing',
        'create',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.listingSplitToken.tokenId,
        '--price',
        LISTING_PRICE,
        '--split',
        `${fixture.sellerAddress}=70`,
        '--split',
        `${fixture.buyerAddress}=30`,
        '--chain',
        fixture.chain,
      ]),
    );
    expectTx(listingSplitCreate);
    expect(listingSplitCreate.approvalTxHash).toBeNull();

    const status = await readListingStatus(
      fixture,
      fixture.buyerHome,
      fixture.collection.contract,
      fixture.listingSplitToken.tokenId,
    );
    expect(status.hasListing).toBe(true);
    expect(status.canBuy).toBe(true);
    expectAddressList(status.splitAddresses, [fixture.sellerAddress, fixture.buyerAddress]);
    expect(status.splitRatios).toEqual([70, 30]);

    expectTx(await step('cancel split listing', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'listing',
        'cancel',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.listingSplitToken.tokenId,
        '--chain',
        fixture.chain,
      ]),
    ));
    await expectListingStatus(fixture, fixture.sellerHome, fixture.collection.contract, fixture.listingSplitToken.tokenId, false);
  });
});

type ListingTxResult = TxResult & {
  approvalTxHash?: string | null;
};

type ListingStatusResult = {
  seller: Address;
  currencyAddress: Address;
  hasListing: boolean;
  isEth: boolean;
  target: Address;
  splitAddresses: Address[];
  splitRatios: number[];
  canBuy: boolean | null;
};

type ListingFixture = BuyerLiveFixture & {
  collection: DeployErc721Result;
  listingCancelToken: MintResult;
  zeroPriceListingToken: MintResult;
  listingBuyToken: MintResult;
  listingSplitToken: MintResult;
};

async function readListingStatus(
  liveFixture: ListingFixture,
  home: string,
  contract: Address,
  tokenId: string,
): Promise<ListingStatusResult> {
  return jsonCommand<ListingStatusResult>(home, [
    'listing',
    'status',
    '--contract',
    contract,
    '--token-id',
    tokenId,
    '--chain',
    liveFixture.chain,
  ]);
}

async function expectListingStatus(
  liveFixture: ListingFixture,
  home: string,
  contract: Address,
  tokenId: string,
  hasListing: boolean,
): Promise<void> {
  const status = await readListingStatus(liveFixture, home, contract, tokenId);
  expect(status.hasListing).toBe(hasListing);
}

function expectDefaultEthListingStatus(status: ListingStatusResult, seller: Address): void {
  expect(isAddressEqual(status.seller, seller)).toBe(true);
  expect(isAddressEqual(status.currencyAddress, ETH_ADDRESS)).toBe(true);
  expect(status.isEth).toBe(true);
  expect(isAddressEqual(status.target, PUBLIC_LISTING_TARGET)).toBe(true);
  expectAddressList(status.splitAddresses, [seller]);
  expect(status.splitRatios).toEqual([100]);
}

function expectAddressList(actualAddresses: Address[], expectedAddresses: Address[]): void {
  expect(actualAddresses).toHaveLength(expectedAddresses.length);
  expectedAddresses.forEach((expectedAddress, index) => {
    const actualAddress = actualAddresses[index];
    if (actualAddress === undefined) {
      throw new Error(`Missing address at index ${index}.`);
    }
    expect(isAddressEqual(actualAddress, expectedAddress)).toBe(true);
  });
}
