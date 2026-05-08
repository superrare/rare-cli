import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  createWalletClient,
  erc20Abi,
  http,
  parseEther,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { getContractAddresses, resolveCurrency } from '../../src/contracts/addresses.js';
import {
  cleanupTempHome,
  configureLiveHome,
  createLivePublicClient,
  createTempHome,
  describeLive,
  expectTx,
  jsonCommand,
  livePrivateKey,
  retryNonceConflict,
  step,
  withLiveTransactionLock,
  type TxResult,
} from './live-helpers.js';

const E2E_TOKEN_URI = 'ipfs://bafybeidznwopf6bnfakqbertnhohgh65usqlo7bhnehycurg4xmc5ebnm4/metadata.json';

type DeployResult = {
  txHash: string;
  blockNumber: string;
  contract: string;
};

type MintResult = {
  txHash: string;
  blockNumber: string;
  tokenId: string;
  contract: string;
  tokenUri: string;
};

type LiveState = {
  sellerHome: string;
  buyerHome: string;
  sellerAddress: Address;
  buyerAddress: Address;
  collection: DeployResult;
  listingCancelToken: MintResult;
  listingBuyToken: MintResult;
  zeroPriceListingToken: MintResult;
  auctionCancelToken: MintResult;
  auctionSettleToken: MintResult;
  buyerAuctionCancelToken: MintResult;
  offerCancelToken: MintResult;
  offerCancelCreate: TxResult;
  offerCancelReady: Promise<void>;
  offerAcceptToken: MintResult;
  buyerMintToken: MintResult;
  rareOfferAcceptToken: MintResult;
};

let live: LiveState;
const E2E_RARE_CURRENCY = 'rare';
const E2E_RARE_AMOUNT = '0.000001';

describeLive('live Sepolia CLI write commands', () => {
  beforeAll(async () => {
    const sellerHome = await createTempHome();
    const buyerHome = await createTempHome();
    const suffix = Date.now().toString(36);
    const sellerAddress = privateKeyToAccount(livePrivateKey('E2E_SELLER_PRIVATE_KEY')).address;
    const buyerAddress = privateKeyToAccount(livePrivateKey('E2E_BUYER_PRIVATE_KEY')).address;

    try {
      await step('configure seller wallet', () => configureLiveHome(sellerHome, process.env.E2E_SELLER_PRIVATE_KEY!));
      await step('configure buyer wallet', () => configureLiveHome(buyerHome, process.env.E2E_BUYER_PRIVATE_KEY!));

      const collection = await step('deploy ERC-721 collection', () =>
        jsonCommand<DeployResult>(sellerHome, [
          'deploy',
          'erc721',
          `Rare CLI E2E ${suffix}`,
          `RCE${suffix.slice(-4).toUpperCase()}`,
          '--max-tokens',
          '12',
          '--chain',
          'sepolia',
        ]),
      );
      expectTx(collection);
      expect(collection.contract).toMatch(/^0x[0-9a-fA-F]{40}$/);

      const offerCancelToken = await step('mint offer cancel token', () =>
        mintToken(sellerHome, collection.contract),
      );
      const offerCancelCreate = await step('create offer for cancellation', () =>
        jsonCommand<TxResult>(buyerHome, [
          'offer',
          'create',
          '--contract',
          collection.contract,
          '--token-id',
          offerCancelToken.tokenId,
          '--amount',
          '0.000001',
          '--chain',
          'sepolia',
        ]),
      );
      expectTx(offerCancelCreate);

      live = {
        sellerHome,
        buyerHome,
        sellerAddress,
        buyerAddress,
        collection,
        listingCancelToken: await step('mint listing cancel token', () =>
          mintToken(sellerHome, collection.contract),
        ),
        listingBuyToken: await step('mint listing buy token', () =>
          mintToken(sellerHome, collection.contract),
        ),
        zeroPriceListingToken: await step('mint zero-price listing token', () =>
          mintToken(sellerHome, collection.contract),
        ),
        auctionCancelToken: await step('mint auction cancel token', () =>
          mintToken(sellerHome, collection.contract),
        ),
        auctionSettleToken: await step('mint auction settle token', () =>
          mintToken(sellerHome, collection.contract),
        ),
        buyerAuctionCancelToken: await step('mint buyer-owned auction token', () =>
          mintToken(sellerHome, collection.contract, { to: buyerAddress }),
        ),
        offerCancelToken,
        offerCancelCreate,
        offerCancelReady: startOfferCancelDelay(),
        offerAcceptToken: await step('mint offer accept token', () =>
          mintToken(sellerHome, collection.contract),
        ),
        buyerMintToken: await step('mint token directly to buyer', () =>
          mintToken(sellerHome, collection.contract, { to: buyerAddress }),
        ),
        rareOfferAcceptToken: await step('mint RARE offer accept token', () =>
          mintToken(sellerHome, collection.contract),
        ),
      };
    } catch (error) {
      await cleanupTempHome(sellerHome);
      await cleanupTempHome(buyerHome);
      throw error;
    }
  });

  afterAll(async () => {
    await cleanupTempHome(live?.sellerHome);
    await cleanupTempHome(live?.buyerHome);
  });

  it('deploys collection and mints token fixtures', () => {
    expectTx(live.collection);
    expect(live.collection.contract).toMatch(/^0x[0-9a-fA-F]{40}$/);
    for (const token of [
      live.listingCancelToken,
      live.listingBuyToken,
      live.zeroPriceListingToken,
      live.auctionCancelToken,
      live.auctionSettleToken,
      live.buyerAuctionCancelToken,
      live.offerCancelToken,
      live.offerAcceptToken,
      live.buyerMintToken,
      live.rareOfferAcceptToken,
    ]) {
      expectTx(token);
      expect(token.contract).toBe(live.collection.contract);
      expect(token.tokenUri).toBe(E2E_TOKEN_URI);
      expect(token.tokenId).toMatch(/^\d+$/);
    }
  });

  it('mints directly to another recipient', async () => {
    await expectTokenOwner(live.sellerHome, live.collection.contract, live.buyerMintToken.tokenId, live.buyerAddress);
  });

  it('creates and cancels a listing', async () => {
    const listingCancelCreate = await step('create listing for cancellation', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'listing',
        'create',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.listingCancelToken.tokenId,
        '--price',
        '0.000001',
        '--chain',
        'sepolia',
      ]),
    );
    expectTx(listingCancelCreate);
    expect(listingCancelCreate.approvalTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    await expectListingStatus(live.sellerHome, live.collection.contract, live.listingCancelToken.tokenId, true);

    expectTx(await step('cancel listing', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'listing',
        'cancel',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.listingCancelToken.tokenId,
        '--chain',
        'sepolia',
      ]),
    ));
    await expectListingStatus(live.sellerHome, live.collection.contract, live.listingCancelToken.tokenId, false);
  });

  it('creates a zero-price listing as an inactive listing without repeating approval', async () => {
    const zeroPriceListingCreate = await step('create zero-price listing', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'listing',
        'create',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.zeroPriceListingToken.tokenId,
        '--price',
        '0',
        '--chain',
        'sepolia',
      ]),
    );

    expectTx(zeroPriceListingCreate);
    expect(zeroPriceListingCreate.approvalTxHash).toBeNull();
    await expectListingStatus(live.sellerHome, live.collection.contract, live.zeroPriceListingToken.tokenId, false);
  });

  it('creates and buys a listing', async () => {
    const listingBuyCreate = await step('create listing for purchase', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'listing',
        'create',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.listingBuyToken.tokenId,
        '--price',
        '0.000001',
        '--chain',
        'sepolia',
      ]),
    );
    expectTx(listingBuyCreate);
    expect(listingBuyCreate.approvalTxHash).toBeNull();

    expectTx(await step('buy listing', () =>
      jsonCommand<TxResult>(live.buyerHome, [
        'listing',
        'buy',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.listingBuyToken.tokenId,
        '--amount',
        '0.000001',
        '--chain',
        'sepolia',
      ]),
    ));
    await expectListingStatus(live.sellerHome, live.collection.contract, live.listingBuyToken.tokenId, false);
  });

  it('creates and cancels an auction', async () => {
    const auctionCancelCreate = await step('create auction for cancellation', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'auction',
        'create',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.auctionCancelToken.tokenId,
        '--starting-price',
        '0.000001',
        '--duration',
        liveAuctionDurationSeconds().toString(),
        '--chain',
        'sepolia',
      ]),
    );
    expectTx(auctionCancelCreate);
    expect(auctionCancelCreate.approvalTxHash).toBeNull();

    await expectAuctionStatus(live.sellerHome, live.collection.contract, live.auctionCancelToken.tokenId, 'PENDING');
    expectTx(await step('cancel auction', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'auction',
        'cancel',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.auctionCancelToken.tokenId,
        '--chain',
        'sepolia',
      ]),
    ));
  });

  it('auto-approves a buyer-owned token before creating and cancelling an auction', async () => {
    const buyerAuctionCreate = await step('create buyer-owned auction for cancellation', () =>
      jsonCommand<TxResult>(live.buyerHome, [
        'auction',
        'create',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.buyerAuctionCancelToken.tokenId,
        '--starting-price',
        '0.000001',
        '--duration',
        liveAuctionDurationSeconds().toString(),
        '--chain',
        'sepolia',
      ]),
    );

    expectTx(buyerAuctionCreate);
    expect(buyerAuctionCreate.approvalTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    await expectAuctionStatus(live.buyerHome, live.collection.contract, live.buyerAuctionCancelToken.tokenId, 'PENDING');

    expectTx(await step('cancel buyer-owned auction', () =>
      jsonCommand<TxResult>(live.buyerHome, [
        'auction',
        'cancel',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.buyerAuctionCancelToken.tokenId,
        '--chain',
        'sepolia',
      ]),
    ));
  });

  it('creates, bids, and settles an auction', async () => {
    const auctionSettleCreate = await step('create auction for settlement', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'auction',
        'create',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.auctionSettleToken.tokenId,
        '--starting-price',
        '0.000001',
        '--duration',
        liveAuctionDurationSeconds().toString(),
        '--chain',
        'sepolia',
      ]),
    );
    expectTx(auctionSettleCreate);
    expect(auctionSettleCreate.approvalTxHash).toBeNull();

    expectTx(await step('bid on auction', () =>
      jsonCommand<TxResult>(live.buyerHome, [
        'auction',
        'bid',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.auctionSettleToken.tokenId,
        '--amount',
        '0.000001',
        '--chain',
        'sepolia',
      ]),
    ));
    await step('wait for auction to end', waitForAuctionToEnd);
    await expectAuctionStatus(live.sellerHome, live.collection.contract, live.auctionSettleToken.tokenId, 'ENDED');
    expectTx(await step('settle auction', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'auction',
        'settle',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.auctionSettleToken.tokenId,
        '--chain',
        'sepolia',
      ]),
    ));
  });

  it('creates and cancels an offer', async () => {
    expectTx(live.offerCancelCreate);
    await expectOfferStatus(live.sellerHome, live.collection.contract, live.offerCancelToken.tokenId, true);
    await live.offerCancelReady;
    expectTx(await step('cancel offer', () =>
      jsonCommand<TxResult>(live.buyerHome, [
        'offer',
        'cancel',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.offerCancelToken.tokenId,
        '--chain',
        'sepolia',
      ]),
    ));
    await expectOfferStatus(live.sellerHome, live.collection.contract, live.offerCancelToken.tokenId, false);
  });

  it('creates and accepts an offer', async () => {
    expectTx(await step('create offer for acceptance', () =>
      jsonCommand<TxResult>(live.buyerHome, [
        'offer',
        'create',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.offerAcceptToken.tokenId,
        '--amount',
        '0.000001',
        '--chain',
        'sepolia',
      ]),
    ));
    expectTx(await step('accept offer', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'offer',
        'accept',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.offerAcceptToken.tokenId,
        '--amount',
        '0.000001',
        '--chain',
        'sepolia',
      ]),
    ));
    await expectOfferStatus(live.sellerHome, live.collection.contract, live.offerAcceptToken.tokenId, false);
  });

  it('creates and accepts a RARE offer through the live allowance path', async () => {
    const currency = resolveCurrency(E2E_RARE_CURRENCY, 'sepolia');
    const amountWei = parseEther(E2E_RARE_AMOUNT);
    const auctionAddress = getContractAddresses('sepolia').auction;
    const balance = await readErc20Balance(currency, live.buyerAddress);

    if (balance < amountWei) {
      throw new Error(
        `E2E buyer has insufficient Sepolia RARE balance for live ERC20 offer test. ` +
          `Required at least ${amountWei}, found ${balance}.`,
      );
    }

    await step('reset buyer ERC20 allowance', () =>
      approveErc20(currency, livePrivateKey('E2E_BUYER_PRIVATE_KEY'), auctionAddress, 0n),
    );
    expect(await readErc20Allowance(currency, live.buyerAddress, auctionAddress)).toBe(0n);

    expectTx(await step('create ERC20 offer for acceptance', () =>
      jsonCommand<TxResult>(live.buyerHome, [
        'offer',
        'create',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.rareOfferAcceptToken.tokenId,
        '--amount',
        E2E_RARE_AMOUNT,
        '--currency',
        E2E_RARE_CURRENCY,
        '--chain',
        'sepolia',
      ], 240_000),
    ));

    expect(await readErc20Allowance(currency, live.buyerAddress, auctionAddress)).toBeGreaterThanOrEqual(amountWei);
    await expectOfferStatus(live.sellerHome, live.collection.contract, live.rareOfferAcceptToken.tokenId, true, E2E_RARE_CURRENCY);

    expectTx(await step('accept ERC20 offer', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'offer',
        'accept',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.rareOfferAcceptToken.tokenId,
        '--amount',
        E2E_RARE_AMOUNT,
        '--currency',
        E2E_RARE_CURRENCY,
        '--chain',
        'sepolia',
      ]),
    ));
    await expectOfferStatus(live.sellerHome, live.collection.contract, live.rareOfferAcceptToken.tokenId, false, E2E_RARE_CURRENCY);
  });

});

async function mintToken(home: string, contract: string, opts: { to?: string } = {}): Promise<MintResult> {
  const args = [
    'mint',
    '--contract',
    contract,
    '--token-uri',
    E2E_TOKEN_URI,
    '--chain',
    'sepolia',
  ];
  if (opts.to) {
    args.push('--to', opts.to);
  }

  const result = await jsonCommand<MintResult>(home, args);

  expectTx(result);
  expect(result.contract).toBe(contract);
  expect(result.tokenUri).toBe(E2E_TOKEN_URI);
  expect(result.tokenId).toMatch(/^\d+$/);
  return result;
}

async function expectListingStatus(
  home: string,
  contract: string,
  tokenId: string,
  hasListing: boolean,
): Promise<void> {
  const status = await jsonCommand<{ hasListing: boolean }>(home, [
    'listing',
    'status',
    '--contract',
    contract,
    '--token-id',
    tokenId,
    '--chain',
    'sepolia',
  ]);
  expect(status.hasListing).toBe(hasListing);
}

async function expectOfferStatus(
  home: string,
  contract: string,
  tokenId: string,
  hasOffer: boolean,
  currency?: string,
): Promise<void> {
  const args = [
    'offer',
    'status',
    '--contract',
    contract,
    '--token-id',
    tokenId,
    '--chain',
    'sepolia',
  ];
  if (currency) {
    args.push('--currency', currency);
  }

  const status = await jsonCommand<{ hasOffer: boolean }>(home, args);
  expect(status.hasOffer).toBe(hasOffer);
}

async function expectAuctionStatus(
  home: string,
  contract: string,
  tokenId: string,
  expectedStatus: 'PENDING' | 'RUNNING' | 'ENDED',
): Promise<void> {
  const status = await jsonCommand<{ status: string }>(home, [
    'auction',
    'status',
    '--contract',
    contract,
    '--token-id',
    tokenId,
    '--chain',
    'sepolia',
  ]);
  expect(status.status).toBe(expectedStatus);
}

async function expectTokenOwner(home: string, contract: string, tokenId: string, owner: Address): Promise<void> {
  const status = await jsonCommand<{
    token: { owner: Address; tokenUri: string; tokenId: string } | null;
  }>(home, [
    'status',
    '--contract',
    contract,
    '--token-id',
    tokenId,
    '--chain',
    'sepolia',
  ]);

  expect(status.token).not.toBeNull();
  expect(status.token!.owner.toLowerCase()).toBe(owner.toLowerCase());
  expect(status.token!.tokenUri).toBe(E2E_TOKEN_URI);
}

async function readErc20Balance(currency: Address, owner: Address): Promise<bigint> {
  return createLivePublicClient().readContract({
    address: currency,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner],
  });
}

async function readErc20Allowance(currency: Address, owner: Address, spender: Address): Promise<bigint> {
  return createLivePublicClient().readContract({
    address: currency,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, spender],
  });
}

async function approveErc20(
  currency: Address,
  privateKey: `0x${string}`,
  spender: Address,
  amount: bigint,
): Promise<void> {
  const account = privateKeyToAccount(privateKey);
  const publicClient = createLivePublicClient();
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(process.env.TEST_RPC_URL!),
  });
  const txHash = await retryNonceConflict('reset buyer ERC20 allowance', () =>
    withLiveTransactionLock(account.address, 'reset buyer ERC20 allowance', () =>
      walletClient.writeContract({
        address: currency,
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender, amount],
      }),
    ),
  );
  await publicClient.waitForTransactionReceipt({ hash: txHash });
}

function liveAuctionDurationSeconds(): number {
  return Number.parseInt(process.env.E2E_AUCTION_DURATION_SECONDS ?? '60', 10);
}

function liveOfferCancelDelaySeconds(): number {
  return Number.parseInt(process.env.E2E_OFFER_CANCEL_DELAY_SECONDS ?? '310', 10);
}

async function waitForAuctionToEnd(): Promise<void> {
  const duration = liveAuctionDurationSeconds();
  await new Promise((resolve) => setTimeout(resolve, (duration + 10) * 1000));
}

async function waitForOfferCancelDelay(): Promise<void> {
  const duration = liveOfferCancelDelaySeconds();
  await new Promise((resolve) => setTimeout(resolve, duration * 1000));
}

function startOfferCancelDelay(): Promise<void> {
  console.error(`[live e2e] wait for offer cancellation delay (${liveOfferCancelDelaySeconds()}s)`);
  return waitForOfferCancelDelay();
}
