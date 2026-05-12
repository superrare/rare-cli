import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import {
  getContractAddresses,
} from '../../src/contracts/addresses.js';
import {
  approveToken,
  cleanupLiveFixture,
  createLiveFixture,
  expectTx,
  jsonCommand,
  LiveFixtureRef,
  missingEnv,
  parseTokenAmount,
  readTokenBalance,
  readTokenAllowance,
  requireBuyerFixture,
  step,
  type BuyerLiveFixture,
  type LiveFixture,
  type TxResult,
} from './helpers/live-harness.js';
import {
  deployErc721Collection,
  mintToken,
  type DeployErc721Result,
  type MintResult,
} from './helpers/live-erc721.js';

const describeLive = missingEnv.length === 0 ? describe.sequential : describe.skip;
const live = new LiveFixtureRef<Erc20OfferFixture>(`Live environment is not configured: ${missingEnv.join(', ')}`);
const E2E_RARE_CURRENCY = 'rare';

describeLive('live ERC20 offer CLI write command', () => {
  beforeAll(async () => {
    const fixture = requireBuyerFixture(await createLiveFixture({ buyer: true }));
    try {
      const collection = await deployErc721Collection(fixture, '2');

      live.set({
        ...fixture,
        collection,
        rareOfferAcceptToken: await step('mint RARE offer accept token', () =>
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

  it('creates and accepts a RARE offer through the live allowance path', async () => {
    const fixture = live.value;
    const currency = fixture.rareAddress;
    const amount = liveRareOfferAmount();
    const amountWei = await parseTokenAmount(fixture, currency, amount);
    const auctionAddress = getContractAddresses(fixture.chain).auction;
    const balance = await readTokenBalance(fixture, fixture.buyerAddress, currency);

    if (balance < amountWei) {
      throw new Error(
        `E2E buyer has insufficient ${fixture.chain} RARE balance for live ERC20 offer test. ` +
          `Required at least ${amountWei}, found ${balance}.`,
      );
    }

    await step('set buyer ERC20 allowance below required offer escrow', () =>
      approveToken(fixture, currency, auctionAddress, amountWei, 'E2E_BUYER_PRIVATE_KEY'),
    );
    expect(await readTokenAllowance(fixture, currency, fixture.buyerAddress, auctionAddress)).toBe(amountWei);

    expectTx(await step('create ERC20 offer for acceptance', () =>
      jsonCommand<TxResult>(fixture.buyerHome, [
        'offer',
        'create',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.rareOfferAcceptToken.tokenId,
        '--amount',
        amount,
        '--currency',
        E2E_RARE_CURRENCY,
        '--chain',
        fixture.chain,
      ], 240_000),
    ));

    expect(await readTokenAllowance(fixture, currency, fixture.buyerAddress, auctionAddress)).toBeGreaterThan(amountWei);
    await expectOfferStatus(fixture, fixture.sellerHome, fixture.collection.contract, fixture.rareOfferAcceptToken.tokenId, true);

    expectTx(await step('accept ERC20 offer', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'offer',
        'accept',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.rareOfferAcceptToken.tokenId,
        '--amount',
        amount,
        '--currency',
        E2E_RARE_CURRENCY,
        '--chain',
        fixture.chain,
      ]),
    ));
    await expectOfferStatus(fixture, fixture.sellerHome, fixture.collection.contract, fixture.rareOfferAcceptToken.tokenId, false);
  });
});

type Erc20OfferFixture = BuyerLiveFixture & {
  collection: DeployErc721Result;
  rareOfferAcceptToken: MintResult;
};

async function expectOfferStatus(
  liveFixture: LiveFixture,
  home: string,
  contract: Address,
  tokenId: string,
  hasOffer: boolean,
): Promise<void> {
  const status = await jsonCommand<{ hasOffer: boolean }>(home, [
    'offer',
    'status',
    '--contract',
    contract,
    '--token-id',
    tokenId,
    '--currency',
    E2E_RARE_CURRENCY,
    '--chain',
    liveFixture.chain,
  ]);
  expect(status.hasOffer).toBe(hasOffer);
}

function liveRareOfferAmount(): string {
  return process.env.E2E_RARE_AMOUNT ?? '0.000001';
}
