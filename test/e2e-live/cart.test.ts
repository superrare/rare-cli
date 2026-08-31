import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRareClient } from '@rareprotocol/rare-sdk';
import { cartAbi, getCartAddress, resolveCurrency, viemChains } from '@rareprotocol/rare-sdk/contracts';
import { createWalletClient, erc20Abi, erc721Abi, getAddress, http, parseEther, parseEventLogs, parseUnits, zeroAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  cleanupLiveFixture,
  createLiveFixture,
  expectTx,
  expectTokenBalanceAtLeast,
  jsonCommand,
  liveRpcUrl,
  LiveFixtureRef,
  missingEnv,
  readTokenBalance,
  requireBuyerFixture,
  step,
  type BuyerLiveFixture,
  type LiveFixture,
  type TxResult,
} from './helpers/live-harness.js';
import { deployErc721Collection, mintToken } from './helpers/live-erc721.js';

const cartUnitPriceEth = '0.000001';
const contractIndexingDelayMs = 15_000;

const missingCartEnv = [
  ...missingEnv,
  ...(process.env.RARE_API_BASE_URL ? [] : ['RARE_API_BASE_URL']),
];
const describeLive = missingCartEnv.length === 0 ? describe.sequential : describe.skip;
const live = new LiveFixtureRef<CartLiveFixture>(`Live Cart environment is not configured: ${missingCartEnv.join(', ')}`);

type CartLiveFixture = BuyerLiveFixture & {
  collection: Address;
  purchasedTokenIds: bigint[];
  listingDigests: Hex[];
  rootDigest: Hex;
  nonceBeforeInvalidation: bigint;
};

type CartListingCreateResult = {
  rootDigest: Hex;
  listingDigests: Hex[];
  approvalTxHashes: Hex[];
  publishedRoot: {
    seller: Address;
    listingCount: number;
  };
  signedArtifact: { signature: Hex; entries: unknown[] };
};

type CartCheckoutPreviewResult = {
  preview: true;
  preparation: {
    intent: { items: Array<{ listingDigest: Hex; quantity: string; recipient: Address }> };
    paymentAmount: string;
    expiresAt: string;
    lines: Array<{
      sku: Hex;
      listingDigest: Hex;
      fulfillmentKind: number;
      quantity: string;
      settlementCurrency: Address;
      amount: string;
      paymentRecipient: Address;
    }>;
    route: { inputs: Hex[] };
  };
};

type CartPurchaseResult = TxResult & {
  txHash: Hex;
  approvalTxHash: Hex | null;
  orderId: Hex;
  payer: Address;
  paymentCurrency: Address;
  paymentAmount: string;
  lineCount: number;
  actionCount: number;
};

type MultiSellerCartLiveFixture = {
  buyer: BuyerLiveFixture;
  secondSeller: LiveFixture;
  purchases: Array<{ contract: Address; tokenId: bigint; listingDigest: Hex }>;
};

type RoyaltyCartLiveFixture = {
  creator: BuyerLiveFixture;
  secondarySeller: LiveFixture;
  contract: Address;
  tokenId: bigint;
  listingDigest: Hex;
  royaltyRecipient: Address;
  royaltyAmount: bigint;
  sellerProceeds: bigint;
};

const multiSellerLive = new LiveFixtureRef<MultiSellerCartLiveFixture>(
  `Live multi-seller Cart environment is not configured: ${missingCartEnv.join(', ')}`,
);
const royaltyLive = new LiveFixtureRef<RoyaltyCartLiveFixture>(
  `Live Cart royalty environment is not configured: ${missingCartEnv.join(', ')}`,
);

describeLive('live Rare API and Sepolia Cart CLI workflow', () => {
  beforeAll(async () => {
    const fixture = requireBuyerFixture(await createLiveFixture({ buyer: true }));
    if (fixture.chain !== 'sepolia') {
      await cleanupLiveFixture(fixture);
      throw new Error('Cart live E2E currently requires TEST_RPC_URL to target Sepolia.');
    }
    try {
      const rare = createRareClient({
        publicClient: fixture.publicClient,
        apiBaseUrl: process.env.RARE_API_BASE_URL,
      });
      await step('preflight public Cart Variant catalog', () =>
        rare.cart.catalog.variants.search({
          nft: {
            contract: '0x0000000000000000000000000000000000000001',
            tokenId: 0n,
          },
          perPage: 1,
        }));
      await expectTokenBalanceAtLeast(fixture, fixture.buyerAddress, fixture.rareAddress, '1');
      const collection = await deployErc721Collection(fixture, '3');
      await step('wait for ERC-721 contract indexing', () =>
        new Promise((resolve) => setTimeout(resolve, contractIndexingDelayMs)));
      const firstToken = await mintToken(fixture, collection.contract);
      const secondToken = await mintToken(fixture, collection.contract);
      const thirdToken = await mintToken(fixture, collection.contract);
      const tokens = [firstToken, secondToken, thirdToken];
      const skus = await Promise.all(tokens.map((token) =>
        pollForIndexedSku(rare, collection.contract, token.tokenId)));
      const inputPath = join(fixture.tempDir, 'cart-listings.json');
      await writeFile(inputPath, JSON.stringify({
        deadline: String(Math.floor(Date.now() / 1_000) + 3_600),
        listings: skus.map((sku) => ({
          sku,
          settlementCurrency: 'eth',
          unitPrice: cartUnitPriceEth,
          quantity: '1',
          paymentRecipient: fixture.sellerAddress,
        })),
      }, null, 2), 'utf8');

      const preview = await step('preview Cart Listing Root', () =>
        jsonCommand<{ preview: true; preparation: { artifact: { entries: unknown[] } } }>(fixture.sellerHome, [
          'cart', 'listing', 'create', '--input', inputPath, '--preview', '--chain', fixture.chain,
        ], 240_000));
      expect(preview.preview).toBe(true);
      expect(preview.preparation.artifact.entries).toHaveLength(3);

      const artifactPath = join(fixture.tempDir, 'cart-listing-root.json');
      const created = await step('publish Cart Listing Root', () =>
        jsonCommand<CartListingCreateResult>(fixture.sellerHome, [
          'cart', 'listing', 'create', '--input', inputPath, '--output', artifactPath, '--chain', fixture.chain,
        ], 240_000));
      expect(created.listingDigests).toHaveLength(3);
      expect(created.approvalTxHashes).toHaveLength(1);
      expect(created.approvalTxHashes[0]).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(created.publishedRoot.listingCount).toBe(3);
      expect(created.publishedRoot.seller.toLowerCase()).toBe(fixture.sellerAddress.toLowerCase());
      expect(created.signedArtifact.signature).toMatch(/^0x[0-9a-fA-F]+$/);
      expect(created.signedArtifact.entries).toHaveLength(3);
      await expect(rare.cart.approval.status(collection.contract, fixture.sellerAddress)).resolves.toBe(true);
      await pollForPublishedListings(rare, fixture.sellerAddress, created.listingDigests);
      const nonceBeforeInvalidation = await fixture.publicClient.readContract({
        address: getCartAddress(fixture.chain),
        abi: cartAbi,
        functionName: 'listingNonces',
        args: [fixture.sellerAddress],
      });
      live.set({
        ...fixture,
        collection: collection.contract,
        purchasedTokenIds: [BigInt(firstToken.tokenId), BigInt(secondToken.tokenId)],
        listingDigests: created.listingDigests,
        rootDigest: created.rootDigest,
        nonceBeforeInvalidation,
      });
    } catch (error) {
      await cleanupLiveFixture(fixture);
      throw error;
    }
  }, 480_000);

  afterAll(async () => {
    await cleanupLiveFixture(live.optionalValue);
  });

  it('routes RARE payment across a multi-item fixed-price Cart checkout', async () => {
    const fixture = live.value;
    const listingDigests = fixture.listingDigests.slice(0, 2);
    expect(listingDigests).toHaveLength(2);
    const listingArgs = listingDigests.flatMap((listingDigest) => ['--listing', listingDigest]);
    const preview = await step('preview Cart checkout', () =>
      jsonCommand<CartCheckoutPreviewResult>(fixture.buyerHome, [
        'cart', 'checkout', ...listingArgs, '--payment-currency', 'rare', '--preview', '--chain', fixture.chain,
      ], 240_000));
    expect(preview.preview).toBe(true);
    expect(preview.preparation.intent.items).toEqual(listingDigests.map((listingDigest) => ({
      listingDigest,
      quantity: '1',
      recipient: fixture.buyerAddress,
    })));
    expect(BigInt(preview.preparation.paymentAmount)).toBeGreaterThan(0n);
    expect(Date.parse(preview.preparation.expiresAt)).toBeGreaterThan(Date.now());
    expect(preview.preparation.route.inputs.length).toBeGreaterThan(0);
    const entitlements = aggregateEntitlements(preview.preparation.lines);
    expect(entitlements.length).toBeGreaterThan(0);
    const payoutBalancesBefore = await Promise.all(entitlements.map(async (entitlement) => ({
      ...entitlement,
      balance: await readCurrencyBalance(fixture, entitlement.recipient, entitlement.currency),
    })));
    const buyerRareBalanceBefore = await readTokenBalance(fixture, fixture.buyerAddress, fixture.rareAddress);

    const purchase = await step('purchase Cart checkout', () =>
      jsonCommand<CartPurchaseResult>(fixture.buyerHome, [
        'cart', 'checkout', ...listingArgs, '--payment-currency', 'rare', '--chain', fixture.chain,
      ], 300_000));
    expectTx(purchase);
    if (purchase.approvalTxHash !== null) {
      expect(purchase.approvalTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
      await expect(fixture.publicClient.getTransactionReceipt({ hash: purchase.approvalTxHash })).resolves.toMatchObject({ status: 'success' });
    }
    expect(purchase.orderId).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(purchase.payer.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());
    expect(purchase.paymentCurrency.toLowerCase()).toBe(fixture.rareAddress.toLowerCase());
    expect(purchase.lineCount).toBeGreaterThanOrEqual(2);
    expect(purchase.actionCount).toBe(2);
    const purchaseReceipt = await fixture.publicClient.getTransactionReceipt({ hash: purchase.txHash });
    const settledLines = parseEventLogs({
      abi: cartAbi,
      logs: purchaseReceipt.logs,
      eventName: 'OrderLineSettled',
    });
    expect(settledLines).toHaveLength(preview.preparation.lines.length);
    for (const [lineIndex, line] of preview.preparation.lines.entries()) {
      const settled = settledLines.find((event) => event.args.lineIndex === BigInt(lineIndex));
      expect(settled?.args).toMatchObject({
        orderId: purchase.orderId,
        lineIndex: BigInt(lineIndex),
        sku: line.sku,
        listingDigest: line.listingDigest,
        quantity: BigInt(line.quantity),
        settlementCurrency: getAddress(line.settlementCurrency),
        amount: BigInt(line.amount),
        paymentRecipient: getAddress(line.paymentRecipient),
        fulfillmentKind: line.fulfillmentKind,
      });
    }
    const buyerRareBalanceAfter = await readTokenBalance(fixture, fixture.buyerAddress, fixture.rareAddress);
    const buyerRareSpent = buyerRareBalanceBefore - buyerRareBalanceAfter;
    expect(buyerRareSpent).toBeGreaterThan(0n);
    expect(buyerRareSpent).toBeLessThanOrEqual(BigInt(purchase.paymentAmount));
    for (const entitlement of payoutBalancesBefore) {
      const balanceAfter = await readCurrencyBalance(fixture, entitlement.recipient, entitlement.currency);
      const balanceDelta = balanceAfter - entitlement.balance;
      if (entitlement.recipient === fixture.sellerAddress) {
        expect(balanceDelta).toBe(entitlement.amount);
      } else {
        expect(balanceDelta).toBeGreaterThanOrEqual(entitlement.amount);
      }
    }
    for (const tokenId of fixture.purchasedTokenIds) {
      const owner = await fixture.publicClient.readContract({
        address: fixture.collection,
        abi: erc721Abi,
        functionName: 'ownerOf',
        args: [tokenId],
      });
      expect(owner.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());
    }
  }, 360_000);

  it('cancels one listing and its Listing Root on-chain', async () => {
    const fixture = live.value;
    const listingDigest = fixture.listingDigests[2]!;
    const cancelled = await step('cancel Cart listing', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'cart', 'listing', 'cancel', '--listing-digest', listingDigest, '--chain', fixture.chain,
      ]));
    expectTx(cancelled);
    await expect(fixture.publicClient.readContract({
      address: getCartAddress(fixture.chain),
      abi: cartAbi,
      functionName: 'cancelledListings',
      args: [fixture.sellerAddress, listingDigest],
    })).resolves.toBe(true);

    const cancelledRoot = await step('cancel Cart Listing Root', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'cart', 'listing', 'cancel-root', '--root-digest', fixture.rootDigest, '--chain', fixture.chain,
      ]));
    expectTx(cancelledRoot);
    await expect(fixture.publicClient.readContract({
      address: getCartAddress(fixture.chain),
      abi: cartAbi,
      functionName: 'cancelledListingRoots',
      args: [fixture.sellerAddress, fixture.rootDigest],
    })).resolves.toBe(true);
  }, 240_000);

  it('invalidates the seller Listing nonce', async () => {
    const fixture = live.value;
    const result = await step('invalidate Cart listing nonce', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'cart', 'listing', 'invalidate-nonce', '--chain', fixture.chain,
      ]));
    expectTx(result);
    await expect(fixture.publicClient.readContract({
      address: getCartAddress(fixture.chain),
      abi: cartAbi,
      functionName: 'listingNonces',
      args: [fixture.sellerAddress],
    })).resolves.toBe(fixture.nonceBeforeInvalidation + 1n);
  }, 180_000);
});

describeLive('live multi-seller and mixed-currency Cart routing', () => {
  beforeAll(async () => {
    let buyer: BuyerLiveFixture | undefined;
    let secondSeller: LiveFixture | undefined;
    try {
      buyer = requireBuyerFixture(await createLiveFixture({
        buyer: true,
        buyerWalletFilter: async (wallet, { chain, publicClient }): Promise<boolean> => {
          const usdc = resolveCurrency('usdc', chain);
          const [balance, decimals] = await Promise.all([
            publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [wallet.address] }),
            publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: 'decimals' }),
          ]);
          return balance >= parseUnits('1', decimals);
        },
      }));
      secondSeller = await createLiveFixture();
      if (buyer.chain !== 'sepolia' || secondSeller.chain !== 'sepolia') {
        throw new Error('Multi-seller Cart live E2E currently requires TEST_RPC_URL to target Sepolia.');
      }
      await expectTokenBalanceAtLeast(buyer, buyer.buyerAddress, buyer.usdcAddress, '1');

      const buyerRare = createRareClient({ publicClient: buyer.publicClient, apiBaseUrl: process.env.RARE_API_BASE_URL });
      const secondSellerRare = createRareClient({
        publicClient: secondSeller.publicClient,
        apiBaseUrl: process.env.RARE_API_BASE_URL,
      });
      const firstCollection = await deployErc721Collection(buyer, '1');
      const secondCollection = await deployErc721Collection(secondSeller, '1');
      await step('wait for multi-seller ERC-721 contract indexing', () =>
        new Promise((resolve) => setTimeout(resolve, contractIndexingDelayMs)));
      const firstToken = await mintToken(buyer, firstCollection.contract);
      const secondToken = await mintToken(secondSeller, secondCollection.contract);
      const [firstSku, secondSku] = await Promise.all([
        pollForIndexedSku(buyerRare, firstCollection.contract, firstToken.tokenId),
        pollForIndexedSku(secondSellerRare, secondCollection.contract, secondToken.tokenId),
      ]);
      const firstListingDigest = await publishSingleCartListing({
        fixture: buyer,
        rare: buyerRare,
        tokenContract: firstCollection.contract,
        sku: firstSku,
        settlementCurrency: 'eth',
        unitPrice: cartUnitPriceEth,
      });
      const secondListingDigest = await publishSingleCartListing({
        fixture: secondSeller,
        rare: secondSellerRare,
        tokenContract: secondCollection.contract,
        sku: secondSku,
        settlementCurrency: 'rare',
        unitPrice: '0.01',
      });
      multiSellerLive.set({
        buyer,
        secondSeller,
        purchases: [
          { contract: firstCollection.contract, tokenId: BigInt(firstToken.tokenId), listingDigest: firstListingDigest },
          { contract: secondCollection.contract, tokenId: BigInt(secondToken.tokenId), listingDigest: secondListingDigest },
        ],
      });
    } catch (error) {
      await Promise.all([cleanupLiveFixture(buyer), cleanupLiveFixture(secondSeller)]);
      throw error;
    }
  }, 600_000);

  afterAll(async () => {
    const fixture = multiSellerLive.optionalValue;
    await Promise.all([
      cleanupLiveFixture(fixture?.buyer),
      cleanupLiveFixture(fixture?.secondSeller),
    ]);
  });

  it('routes USDC to different sellers in ETH and RARE', async () => {
    const fixture = multiSellerLive.value;
    const listingArgs = fixture.purchases.flatMap(({ listingDigest }) => ['--listing', listingDigest]);
    const preview = await step('preview multi-seller USDC Cart checkout', () =>
      jsonCommand<CartCheckoutPreviewResult>(fixture.buyer.buyerHome, [
        'cart', 'checkout', ...listingArgs, '--payment-currency', 'usdc', '--preview', '--chain', fixture.buyer.chain,
      ], 240_000));
    expect(preview.preparation.intent.items).toHaveLength(2);
    const settlementCurrencies = new Set(
      preview.preparation.lines.map((line) => line.settlementCurrency.toLowerCase()),
    );
    expect(settlementCurrencies.has(zeroAddress)).toBe(true);
    expect(settlementCurrencies.has(fixture.buyer.rareAddress.toLowerCase())).toBe(true);
    expect(preview.preparation.route.inputs.length).toBeGreaterThan(0);
    const entitlements = aggregateEntitlements(preview.preparation.lines);
    const payoutBalancesBefore = await snapshotEntitlementBalances(fixture.buyer, entitlements);
    const buyerUsdcBefore = await readTokenBalance(
      fixture.buyer,
      fixture.buyer.buyerAddress,
      fixture.buyer.usdcAddress,
    );
    const quotedUsdcPayment = BigInt(preview.preparation.paymentAmount);
    if (buyerUsdcBefore < quotedUsdcPayment) {
      throw new Error(
        `USDC-funded Cart buyer has ${buyerUsdcBefore} base units but the API quoted ${quotedUsdcPayment}.`,
      );
    }

    const purchase = await step('purchase multi-seller USDC Cart checkout', () =>
      jsonCommand<CartPurchaseResult>(fixture.buyer.buyerHome, [
        'cart', 'checkout', ...listingArgs, '--payment-currency', 'usdc', '--chain', fixture.buyer.chain,
      ], 300_000));
    expectTx(purchase);
    expect(purchase.paymentCurrency.toLowerCase()).toBe(fixture.buyer.usdcAddress.toLowerCase());
    expect(purchase.actionCount).toBe(2);
    await expectSettledLinesMatchPreparation(fixture.buyer, purchase, preview.preparation.lines);
    await expectEntitlementsPaid(fixture.buyer, payoutBalancesBefore, [
      fixture.buyer.sellerAddress,
      fixture.secondSeller.sellerAddress,
    ]);
    const buyerUsdcAfter = await readTokenBalance(
      fixture.buyer,
      fixture.buyer.buyerAddress,
      fixture.buyer.usdcAddress,
    );
    expect(buyerUsdcBefore - buyerUsdcAfter).toBeGreaterThan(0n);
    expect(buyerUsdcBefore - buyerUsdcAfter).toBeLessThanOrEqual(BigInt(purchase.paymentAmount));
    for (const item of fixture.purchases) {
      await expect(fixture.buyer.publicClient.readContract({
        address: item.contract,
        abi: erc721Abi,
        functionName: 'ownerOf',
        args: [item.tokenId],
      })).resolves.toBe(fixture.buyer.buyerAddress);
    }
  }, 420_000);

});

describeLive('live secondary-sale Cart royalties', () => {
  beforeAll(async () => {
    let creator: BuyerLiveFixture | undefined;
    let secondarySeller: LiveFixture | undefined;
    try {
      creator = requireBuyerFixture(await createLiveFixture({ buyer: true }));
      secondarySeller = await createLiveFixture();
      if (creator.chain !== 'sepolia' || secondarySeller.chain !== 'sepolia') {
        throw new Error('Cart royalty live E2E currently requires TEST_RPC_URL to target Sepolia.');
      }
      const creatorRare = createRareClient({
        publicClient: creator.publicClient,
        apiBaseUrl: process.env.RARE_API_BASE_URL,
      });
      const secondarySellerRare = createRareClient({
        publicClient: secondarySeller.publicClient,
        walletClient: createWalletClient({
          account: privateKeyToAccount(secondarySeller.sellerWallet.privateKey),
          chain: viemChains[secondarySeller.chain],
          transport: http(liveRpcUrl()),
        }),
        apiBaseUrl: process.env.RARE_API_BASE_URL,
      });
      const collection = await deployErc721Collection(creator, '1');
      await step('wait for royalty ERC-721 contract indexing', () =>
        new Promise((resolve) => setTimeout(resolve, contractIndexingDelayMs)));
      const token = await mintToken(creator, collection.contract, { to: secondarySeller.sellerAddress });
      const sku = await pollForIndexedSku(creatorRare, collection.contract, token.tokenId);
      const grossSalePrice = parseEther(cartUnitPriceEth);
      const royalty = await creatorRare.collection.royalty.status({
        contract: collection.contract,
        tokenId: token.tokenId,
        price: grossSalePrice,
      });
      expect(royalty.receiver.toLowerCase()).toBe(creator.sellerAddress.toLowerCase());
      expect(royalty.royaltyAmount).toBeGreaterThan(0n);
      const sellerProceeds = grossSalePrice - royalty.royaltyAmount;
      expect(sellerProceeds).toBeGreaterThan(0n);
      await expect(creator.publicClient.readContract({
        address: collection.contract,
        abi: erc721Abi,
        functionName: 'ownerOf',
        args: [BigInt(token.tokenId)],
      })).resolves.toBe(secondarySeller.sellerAddress);

      const approval = await step('approve Cart for secondary royalty listing', () =>
        secondarySellerRare.cart.approval.approve(collection.contract));
      if (approval.txHash !== undefined) expectTx({
        txHash: approval.txHash,
        blockNumber: approval.receipt!.blockNumber.toString(),
      });
      await expect(secondarySellerRare.cart.approval.status(
        collection.contract,
        secondarySeller.sellerAddress,
      )).resolves.toBe(true);
      const listingDigest = await publishSingleCartListing({
        fixture: secondarySeller,
        rare: secondarySellerRare,
        tokenContract: collection.contract,
        sku,
        settlementCurrency: 'eth',
        unitPrice: cartUnitPriceEth,
      });
      royaltyLive.set({
        creator,
        secondarySeller,
        contract: collection.contract,
        tokenId: BigInt(token.tokenId),
        listingDigest,
        royaltyRecipient: royalty.receiver,
        royaltyAmount: royalty.royaltyAmount,
        sellerProceeds,
      });
    } catch (error) {
      await Promise.all([cleanupLiveFixture(creator), cleanupLiveFixture(secondarySeller)]);
      throw error;
    }
  }, 480_000);

  afterAll(async () => {
    const fixture = royaltyLive.optionalValue;
    await Promise.all([
      cleanupLiveFixture(fixture?.creator),
      cleanupLiveFixture(fixture?.secondarySeller),
    ]);
  });

  it('pays ERC-2981 royalties on a secondary Cart sale', async () => {
    const fixture = royaltyLive.value;
    const preview = await step('preview secondary royalty Cart checkout', () =>
      jsonCommand<CartCheckoutPreviewResult>(fixture.creator.buyerHome, [
        'cart', 'checkout', '--listing', fixture.listingDigest, '--payment-currency', 'eth',
        '--preview', '--chain', fixture.creator.chain,
      ], 240_000));
    const sellerLines = preview.preparation.lines.filter((line) =>
      getAddress(line.paymentRecipient) === fixture.secondarySeller.sellerAddress
      && getAddress(line.settlementCurrency) === zeroAddress);
    const royaltyLines = preview.preparation.lines.filter((line) =>
      getAddress(line.paymentRecipient) === fixture.royaltyRecipient
      && getAddress(line.settlementCurrency) === zeroAddress);
    expect(sellerLines).toHaveLength(1);
    expect(sellerLines[0]).toMatchObject({
      listingDigest: fixture.listingDigest,
      quantity: '1',
      amount: fixture.sellerProceeds.toString(),
    });
    expect(royaltyLines.length).toBeGreaterThan(0);
    expect(royaltyLines.reduce((total, line) => total + BigInt(line.amount), 0n))
      .toBe(fixture.royaltyAmount);

    const [sellerBalanceBefore, royaltyBalanceBefore] = await Promise.all([
      fixture.creator.publicClient.getBalance({ address: fixture.secondarySeller.sellerAddress }),
      fixture.creator.publicClient.getBalance({ address: fixture.royaltyRecipient }),
    ]);
    const purchase = await step('purchase secondary royalty Cart checkout', () =>
      jsonCommand<CartPurchaseResult>(fixture.creator.buyerHome, [
        'cart', 'checkout', '--listing', fixture.listingDigest, '--payment-currency', 'eth',
        '--chain', fixture.creator.chain,
      ], 300_000));
    expectTx(purchase);
    await expectSettledLinesMatchPreparation(fixture.creator, purchase, preview.preparation.lines);
    const [sellerBalanceAfter, royaltyBalanceAfter] = await Promise.all([
      fixture.creator.publicClient.getBalance({ address: fixture.secondarySeller.sellerAddress }),
      fixture.creator.publicClient.getBalance({ address: fixture.royaltyRecipient }),
    ]);
    expect(sellerBalanceAfter - sellerBalanceBefore).toBe(fixture.sellerProceeds);
    expect(royaltyBalanceAfter - royaltyBalanceBefore).toBe(fixture.royaltyAmount);
    await expect(fixture.creator.publicClient.readContract({
      address: fixture.contract,
      abi: erc721Abi,
      functionName: 'ownerOf',
      args: [fixture.tokenId],
    })).resolves.toBe(fixture.creator.buyerAddress);
  }, 360_000);
});

async function pollForIndexedSku(
  rare: ReturnType<typeof createRareClient>,
  tokenContract: Address,
  tokenId: string,
): Promise<Hex> {
  const deadline = Date.now() + 180_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const result = await rare.cart.catalog.variants.search({
        nft: { contract: tokenContract, tokenId },
        perPage: 2,
      });
      if (result.data.length > 1) {
        throw new Error(`Cart catalog returned multiple Variants for ${tokenContract}:${tokenId}.`);
      }
      const variant = result.data[0];
      if (variant) {
        const bySku = await rare.cart.catalog.variants.search({ sku: variant.sku, perPage: 2 });
        if (bySku.data.length !== 1 || bySku.data[0]?.sku !== variant.sku) {
          throw new Error(`Cart catalog could not resolve indexed SKU ${variant.sku} uniquely.`);
        }
        return variant.sku;
      }
      lastError = undefined;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Cart catalog ')) throw error;
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Timed out waiting for Cart catalog indexing of ${tokenContract}:${tokenId}.`, {
    cause: lastError,
  });
}

async function pollForPublishedListings(
  rare: ReturnType<typeof createRareClient>,
  seller: Address,
  listingDigests: readonly Hex[],
): Promise<void> {
  const expected = new Set(listingDigests.map((digest) => digest.toLowerCase()));
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const result = await rare.cart.api.listing.search({ seller, perPage: 100 });
    const published = new Set(result.data.map((listing) => listing.listingDigest.toLowerCase()));
    if ([...expected].every((digest) => published.has(digest))) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Timed out waiting for Rare API to return ${listingDigests.length} published Cart listings.`);
}

async function publishSingleCartListing(params: {
  fixture: LiveFixture;
  rare: ReturnType<typeof createRareClient>;
  tokenContract: Address;
  sku: Hex;
  settlementCurrency: 'eth' | 'rare';
  unitPrice: string;
}): Promise<Hex> {
  const inputPath = join(params.fixture.tempDir, `cart-listing-${params.sku}.json`);
  await writeFile(inputPath, JSON.stringify({
    deadline: String(Math.floor(Date.now() / 1_000) + 3_600),
    listings: [{
      sku: params.sku,
      settlementCurrency: params.settlementCurrency,
      unitPrice: params.unitPrice,
      quantity: '1',
      paymentRecipient: params.fixture.sellerAddress,
    }],
  }), 'utf8');
  const created = await step(`publish ${params.settlementCurrency.toUpperCase()} Cart listing`, () =>
    jsonCommand<CartListingCreateResult>(params.fixture.sellerHome, [
      'cart', 'listing', 'create', '--input', inputPath, '--chain', params.fixture.chain,
    ], 240_000));
  expect(created.listingDigests).toHaveLength(1);
  await expect(params.rare.cart.approval.status(
    params.tokenContract,
    params.fixture.sellerAddress,
  )).resolves.toBe(true);
  await pollForPublishedListings(params.rare, params.fixture.sellerAddress, created.listingDigests);
  return created.listingDigests[0]!;
}

type CartEntitlement = {
  recipient: Address;
  currency: Address;
  amount: bigint;
};

type CartEntitlementBalance = CartEntitlement & { balance: bigint };

function aggregateEntitlements(
  lines: CartCheckoutPreviewResult['preparation']['lines'],
): CartEntitlement[] {
  return lines.reduce<CartEntitlement[]>((totals, line) => {
    const recipient = getAddress(line.paymentRecipient);
    const currency = getAddress(line.settlementCurrency);
    const existing = totals.find((entitlement) =>
      entitlement.recipient === recipient && entitlement.currency === currency);
    return existing === undefined
      ? [...totals, { recipient, currency, amount: BigInt(line.amount) }]
      : totals.map((entitlement) => entitlement === existing
        ? { ...entitlement, amount: entitlement.amount + BigInt(line.amount) }
        : entitlement);
  }, []);
}

async function readCurrencyBalance(
  fixture: BuyerLiveFixture,
  owner: Address,
  currency: Address,
): Promise<bigint> {
  return currency === zeroAddress
    ? fixture.publicClient.getBalance({ address: owner })
    : readTokenBalance(fixture, owner, currency);
}

async function snapshotEntitlementBalances(
  fixture: BuyerLiveFixture,
  entitlements: readonly CartEntitlement[],
): Promise<CartEntitlementBalance[]> {
  return Promise.all(entitlements.map(async (entitlement) => ({
    ...entitlement,
    balance: await readCurrencyBalance(fixture, entitlement.recipient, entitlement.currency),
  })));
}

async function expectEntitlementsPaid(
  fixture: BuyerLiveFixture,
  balancesBefore: readonly CartEntitlementBalance[],
  exactRecipients: readonly Address[],
): Promise<void> {
  const exact = new Set(exactRecipients.map((address) => address.toLowerCase()));
  for (const entitlement of balancesBefore) {
    const balanceAfter = await readCurrencyBalance(fixture, entitlement.recipient, entitlement.currency);
    const delta = balanceAfter - entitlement.balance;
    if (exact.has(entitlement.recipient.toLowerCase())) {
      expect(delta).toBe(entitlement.amount);
    } else {
      expect(delta).toBeGreaterThanOrEqual(entitlement.amount);
    }
  }
}

async function expectSettledLinesMatchPreparation(
  fixture: BuyerLiveFixture,
  purchase: CartPurchaseResult,
  lines: CartCheckoutPreviewResult['preparation']['lines'],
): Promise<void> {
  const receipt = await fixture.publicClient.getTransactionReceipt({ hash: purchase.txHash });
  const settledLines = parseEventLogs({ abi: cartAbi, logs: receipt.logs, eventName: 'OrderLineSettled' });
  expect(settledLines).toHaveLength(lines.length);
  for (const [lineIndex, line] of lines.entries()) {
    const settled = settledLines.find((event) => event.args.lineIndex === BigInt(lineIndex));
    expect(settled?.args).toMatchObject({
      orderId: purchase.orderId,
      lineIndex: BigInt(lineIndex),
      sku: line.sku,
      listingDigest: line.listingDigest,
      quantity: BigInt(line.quantity),
      settlementCurrency: getAddress(line.settlementCurrency),
      amount: BigInt(line.amount),
      paymentRecipient: getAddress(line.paymentRecipient),
      fulfillmentKind: line.fulfillmentKind,
    });
  }
}
