import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { erc721Abi, isAddressEqual, type Address } from 'viem';
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
const live = new LiveFixtureRef<AuctionParityFixture>(`Live environment is not configured: ${missingEnv.join(', ')}`);

describeLive('live auction parity CLI write command', () => {
  beforeAll(async () => {
    const fixture = requireBuyerFixture(await createLiveFixture({ buyer: true }));
    try {
      const collection = await deployErc721Collection(fixture, '1');
      live.set({
        ...fixture,
        collection,
        scheduledAuctionToken: await step('mint scheduled auction token', () =>
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

  it('creates and cancels a scheduled auction with explicit seller splits', async () => {
    const fixture = live.value;
    const startTime = Math.floor(Date.now() / 1000) + 3600;
    const created = await step('create scheduled auction', () =>
      jsonCommand<AuctionCreateResult>(fixture.sellerHome, [
        'auction',
        'create',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.scheduledAuctionToken.tokenId,
        '--starting-price',
        '0',
        '--duration',
        liveAuctionDurationSeconds().toString(),
        '--type',
        'scheduled',
        '--start-time',
        startTime.toString(),
        '--split',
        `${fixture.sellerAddress}=70`,
        '--split',
        `${fixture.buyerAddress}=30`,
        '--chain',
        fixture.chain,
      ], 240_000),
    );
    expectTx(created);
    expect(created.auctionType).toBe('scheduled');
    expect(created.startTime).toBe(startTime.toString());

    const status = await readAuctionStatus(fixture, fixture.sellerHome, fixture.scheduledAuctionToken.tokenId);
    expect(status.status).toBe('PENDING');
    expect(status.state).toBe('SCHEDULED');
    expect(status.auctionTypeName).toBe('scheduled');
    expect(status.currentBid).toBe('0');
    expect(status.currentBidder).toBeNull();
    expect(status.minimumNextBid).toBe('0');
    expect(status.settlementEligible).toBe(false);
    expect(status.startingTime).toBe(startTime.toString());
    expectAddressList(status.splitAddresses, [fixture.sellerAddress, fixture.buyerAddress]);
    expect(status.splitRatios).toEqual([70, 30]);

    expectTx(await step('cancel scheduled auction', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'auction',
        'cancel',
        '--contract',
        fixture.collection.contract,
        '--token-id',
        fixture.scheduledAuctionToken.tokenId,
        '--chain',
        fixture.chain,
      ], 240_000),
    ));
    await expectTokenOwner(fixture, fixture.scheduledAuctionToken.tokenId, fixture.sellerAddress);
  });
});

type AuctionCreateResult = TxResult & {
  auctionType: string;
  startTime: string;
};

type AuctionStatusResult = {
  status: string;
  state: string;
  auctionTypeName: string;
  currentBid: string;
  currentBidder: string | null;
  minimumNextBid: string;
  settlementEligible: boolean;
  startingTime: string;
  splitAddresses: Address[];
  splitRatios: number[];
};

type AuctionParityFixture = BuyerLiveFixture & {
  collection: DeployErc721Result;
  scheduledAuctionToken: MintResult;
};

async function readAuctionStatus(
  fixture: AuctionParityFixture,
  home: string,
  tokenId: string,
): Promise<AuctionStatusResult> {
  return jsonCommand<AuctionStatusResult>(home, [
    'auction',
    'status',
    '--contract',
    fixture.collection.contract,
    '--token-id',
    tokenId,
    '--chain',
    fixture.chain,
  ]);
}

async function expectTokenOwner(
  fixture: AuctionParityFixture,
  tokenId: string,
  expectedOwner: Address,
): Promise<void> {
  const owner = await fixture.publicClient.readContract({
    address: fixture.collection.contract,
    abi: erc721Abi,
    functionName: 'ownerOf',
    args: [BigInt(tokenId)],
  });
  expect(isAddressEqual(owner, expectedOwner)).toBe(true);
}

function expectAddressList(actual: Address[], expected: Address[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((address, index) => {
    const actualAddress = actual[index];
    if (actualAddress === undefined) {
      throw new Error(`Missing address at index ${index}.`);
    }
    expect(isAddressEqual(actualAddress, address)).toBe(true);
  });
}

function liveAuctionDurationSeconds(): number {
  return Number.parseInt(process.env.E2E_AUCTION_DURATION_SECONDS ?? '60', 10);
}
