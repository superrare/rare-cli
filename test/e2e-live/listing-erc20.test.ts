import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isAddressEqual, type Address } from 'viem';
import { getContractAddresses } from '../../src/contracts/addresses.js';
import {
  approveToken,
  cleanupLiveFixture,
  createLiveFixture,
  expectTx,
  jsonCommand,
  LiveFixtureRef,
  missingEnv,
  parseTokenAmount,
  readTokenAllowance,
  readTokenBalance,
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
const live = new LiveFixtureRef<Erc20ListingFixture>(`Live environment is not configured: ${missingEnv.join(', ')}`);
const E2E_RARE_CURRENCY = 'rare';
const RARE_LISTING_AMOUNT = '0.000001';

describeLive('live ERC20 listing CLI write command', () => {
  beforeAll(async () => {
    const fixture = requireBuyerFixture(await createLiveFixture({ buyer: true }));
    try {
      const collection = await deployErc721Collection(fixture, '1');
      live.set({
        ...fixture,
        collection,
        rareListingBuyToken: await step('mint RARE listing buy token', () =>
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

  it('creates and buys a RARE listing through the live allowance path', async () => {
    const fixture = live.value;
    const currency = fixture.rareAddress;
    const amount = RARE_LISTING_AMOUNT;
    const amountWei = await parseTokenAmount(fixture, currency, amount);
    const auctionAddress = getContractAddresses(fixture.chain).auction;
    const balance = await readTokenBalance(fixture, fixture.buyerAddress, currency);

    if (balance < amountWei) {
      throw new Error(
        `E2E buyer has insufficient ${fixture.chain} RARE balance for live ERC20 listing test. ` +
        `Required at least ${amountWei}, found ${balance}.`,
      );
    }

    await step('set buyer ERC20 allowance below required listing payment', () =>
      approveToken(fixture, currency, auctionAddress, amountWei, 'buyer'),
    );
    expect(await readTokenAllowance(fixture, currency, fixture.buyerAddress, auctionAddress)).toBe(amountWei);

    const createResult = await step('create ERC20 listing for purchase', () =>
      jsonCommand<ListingTxResult>(fixture.sellerHome, [
        'listing',
        'create',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.rareListingBuyToken.tokenId,
        '--price',
        amount,
        '--currency',
        E2E_RARE_CURRENCY,
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(createResult);
    expect(createResult.approvalTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

    const status = await readListingStatus(
      fixture,
      fixture.buyerHome,
      fixture.collection.contract,
      fixture.rareListingBuyToken.tokenId,
    );
    expect(status.hasListing).toBe(true);
    expect(status.isEth).toBe(false);
    expect(isAddressEqual(status.currencyAddress, currency)).toBe(true);
    expect(status.canBuy).toBe(true);

    expectTx(await step('buy ERC20 listing', () =>
      jsonCommand<TxResult>(fixture.buyerHome, [
        'listing',
        'buy',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.rareListingBuyToken.tokenId,
        '--price',
        amount,
        '--currency',
        E2E_RARE_CURRENCY,
        '--chain',
        fixture.chain,
      ], 240_000),
    ));
    expect(await readTokenAllowance(fixture, currency, fixture.buyerAddress, auctionAddress)).toBeGreaterThan(amountWei);
    await expectListingStatus(fixture, fixture.sellerHome, fixture.collection.contract, fixture.rareListingBuyToken.tokenId, false);
  });
});

type ListingTxResult = TxResult & {
  approvalTxHash?: string | null;
};

type ListingStatusResult = {
  currencyAddress: Address;
  hasListing: boolean;
  isEth: boolean;
  canBuy: boolean | null;
};

type Erc20ListingFixture = BuyerLiveFixture & {
  collection: DeployErc721Result;
  rareListingBuyToken: MintResult;
};

async function readListingStatus(
  liveFixture: Erc20ListingFixture,
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
  liveFixture: Erc20ListingFixture,
  home: string,
  contract: Address,
  tokenId: string,
  hasListing: boolean,
): Promise<void> {
  const status = await readListingStatus(liveFixture, home, contract, tokenId);
  expect(status.hasListing).toBe(hasListing);
}
