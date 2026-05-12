import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Address } from 'viem';
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
const live = new LiveFixtureRef<OfferFixture>(`Live environment is not configured: ${missingEnv.join(', ')}`);

describeLive('live offer CLI write commands', () => {
  beforeAll(async () => {
    const fixture = requireBuyerFixture(await createLiveFixture({ buyer: true }));
    try {
      const collection = await deployErc721Collection(fixture, '4');
      const offerCancelToken = await step('mint offer cancel token', () =>
        mintToken(fixture, collection.contract),
      );
      const offerCancelCreate = await step('create offer for cancellation', () =>
        jsonCommand<TxResult>(fixture.buyerHome, [
          'offer',
          'create',
          '--contract',
          collection.contract,
          '--token-id',
          offerCancelToken.tokenId,
          '--amount',
          '0.000001',
          '--chain',
          fixture.chain,
        ]),
      );

      expectTx(offerCancelCreate);
      live.set({
        ...fixture,
        collection,
        offerCancelToken,
        offerCancelCreate,
        offerCancelReady: startOfferCancelDelay(),
        offerAcceptToken: await step('mint offer accept token', () =>
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

  it('creates and cancels an offer', async () => {
    const fixture = live.value;

    expectTx(fixture.offerCancelCreate);
    await expectOfferStatus(fixture, fixture.sellerHome, fixture.collection.contract, fixture.offerCancelToken.tokenId, true);
    await fixture.offerCancelReady;
    expectTx(await step('cancel offer', () =>
      jsonCommand<TxResult>(fixture.buyerHome, [
        'offer',
        'cancel',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.offerCancelToken.tokenId,
        '--chain',
        fixture.chain,
      ]),
    ));
    await expectOfferStatus(fixture, fixture.sellerHome, fixture.collection.contract, fixture.offerCancelToken.tokenId, false);
  });

  it('creates and accepts an offer with payout splits', async () => {
    const fixture = live.value;

    expectTx(await step('create offer for acceptance', () =>
      jsonCommand<TxResult>(fixture.buyerHome, [
        'offer',
        'create',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.offerAcceptToken.tokenId,
        '--amount',
        '0.000001',
        '--chain',
        fixture.chain,
      ]),
    ));
    expectTx(await step('accept offer with splits', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'offer',
        'accept',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.offerAcceptToken.tokenId,
        '--amount',
        '0.000001',
        '--split',
        `${fixture.sellerAddress}=70`,
        '--split',
        `${fixture.buyerAddress}=30`,
        '--chain',
        fixture.chain,
      ]),
    ));
    await expectOfferStatus(fixture, fixture.sellerHome, fixture.collection.contract, fixture.offerAcceptToken.tokenId, false);
  });
});

type OfferFixture = BuyerLiveFixture & {
  collection: DeployErc721Result;
  offerCancelToken: MintResult;
  offerCancelCreate: TxResult;
  offerCancelReady: Promise<void>;
  offerAcceptToken: MintResult;
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
    '--chain',
    liveFixture.chain,
  ]);
  expect(status.hasOffer).toBe(hasOffer);
}

function liveOfferCancelDelaySeconds(): number {
  return Number.parseInt(process.env.E2E_OFFER_CANCEL_DELAY_SECONDS ?? '310', 10);
}

async function waitForOfferCancelDelay(): Promise<void> {
  const duration = liveOfferCancelDelaySeconds();
  await new Promise((resolve) => setTimeout(resolve, duration * 1000));
}

function startOfferCancelDelay(): Promise<void> {
  console.error(`[live e2e] wait for offer cancellation delay (${liveOfferCancelDelaySeconds()}s)`);
  return waitForOfferCancelDelay();
}
