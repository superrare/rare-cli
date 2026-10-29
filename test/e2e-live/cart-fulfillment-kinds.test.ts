import { nftFixtureManifest } from './helpers/nft-fixture-manifest.js';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cartFulfillmentKinds, createRareClient } from '@rareprotocol/rare-sdk';
import { cartAbi, getCartAddress, rareErc1155Abi, tokenAbi } from '@rareprotocol/rare-sdk/contracts';
import { erc721Abi, parseEventLogs, type Address, type Hex } from 'viem';
import { createCreatorMintVariantSku, createCreatorVariantSkus } from './helpers/cart-creator-variants.js';
import {
  cleanupLiveFixture,
  createCartLiveFixture as createLiveFixture,
  E2E_TOKEN_URI,
  expectTx,
  jsonCommand,
  LiveFixtureRef,
  missingEnv,
  requireBuyerFixture,
  step,
  type BuyerLiveFixture,
  type TxResult,
} from './helpers/live-harness.js';

const missingCartEnv = [...missingEnv, ...(process.env.RARE_API_BASE_URL ? [] : ['RARE_API_BASE_URL'])];
const describeLive = missingCartEnv.length === 0 ? describe.sequential : describe.skip;
const contractSettlementDelayMs = 15_000;
const protocolMaxCartOrderLines = 20;
const maxCartListingItems = 18;
const expectedMaxCheckoutOrderLines = 20;

type FulfillmentFixture = {
  live: BuyerLiveFixture;
  erc1155: {
    contract: Address;
    tokenId: bigint;
    transferListing: Hex;
    mintListing: Hex;
    maxLineListings: Hex[];
  };
  erc721: { contract: Address };
};

type CheckoutPreview = {
  preparation: { lines: Array<{ fulfillmentKind: number }> };
};

type CheckoutResult = TxResult & {
  txHash: Hex;
  approvalTxHash: Hex | null;
  orderId: Hex;
  lineCount: number;
  actionCount: number;
};

const liveRef = new LiveFixtureRef<FulfillmentFixture>(missingCartEnv.join(', '));

describeLive('live Cart on-chain fulfillment kinds', () => {
  beforeAll(async () => {
    const live = requireBuyerFixture(await createLiveFixture({ buyer: true }));
    if (live.chain !== 'sepolia') {
      await cleanupLiveFixture(live);
      throw new Error('Cart fulfillment-kind E2E requires Sepolia.');
    }

    try {
      const cart = getCartAddress(live.chain);
      const erc1155 = await deploy(live, [
        'collection', 'deploy', 'erc1155', unique('Cart Kinds'), unique('CK'),
        '--base-uri', E2E_TOKEN_URI, '--chain', live.chain,
      ]);
      const erc721 = await deploy(live, [
        'collection', 'deploy', 'lazy-erc721', unique('Cart Lazy'), unique('CL'),
        '--max-tokens', '1', '--chain', live.chain,
      ]);
      await delayAfterDeployments();
      const token = await step('create ERC-1155 Cart token', () =>
        jsonCommand<{ tokenId: string } & TxResult>(live.sellerHome, [
          'collection', 'erc1155', 'create-token', '--contract', erc1155,
          '--max-supply', '100', '--token-uri', E2E_TOKEN_URI, '--chain', live.chain,
        ], 240_000));
      expectTx(token);
      await mintErc1155(live, erc1155, token.tokenId, '23', live.sellerAddress);
      await mintErc1155(live, erc1155, token.tokenId, '1', live.buyerAddress);
      await setMinter(live, erc1155, cart);
      const [erc1155Sku] = await createCreatorVariantSkus(live, [{ contract: erc1155, tokenId: token.tokenId, fulfillmentKind: 3 }]);
      if (erc1155Sku === undefined) throw new Error('Creator fixture did not return an ERC-1155 SKU.');
      const transferListing = await publishListing(live, erc1155Sku, '2', 'ERC1155_TRANSFER', true);
      const mintListing = await publishListing(live, erc1155Sku, '2', 'ERC1155_MINT_TO', false);
      const maxLineListings = await publishMaxLineListings(live, erc1155Sku);

      liveRef.set({
        live,
        erc1155: {
          contract: erc1155,
          tokenId: BigInt(token.tokenId),
          transferListing,
          mintListing,
          maxLineListings,
        },
        erc721: { contract: erc721 },
      });
    } catch (error) {
      await cleanupLiveFixture(live);
      throw error;
    }
  }, 900_000);

  afterAll(async () => cleanupLiveFixture(liveRef.optionalValue?.live));

  it('executes ERC1155_TRANSFER (kind 3)', async () => {
    const { live, erc1155 } = liveRef.value;
    const sellerBefore = await balance1155(live, erc1155.contract, erc1155.tokenId, live.sellerAddress);
    const buyerBefore = await balance1155(live, erc1155.contract, erc1155.tokenId, live.buyerAddress);
    await expectKind(live, erc1155.transferListing, '2', cartFulfillmentKinds.erc1155Transfer);
    const purchase = await checkout(live, erc1155.transferListing, '2');
    expectTx(purchase);
    expect(purchase.actionCount).toBe(1);
    await expect(balance1155(live, erc1155.contract, erc1155.tokenId, live.sellerAddress))
      .resolves.toBe(sellerBefore - 2n);
    await expect(balance1155(live, erc1155.contract, erc1155.tokenId, live.buyerAddress))
      .resolves.toBe(buyerBefore + 2n);
    await expectFulfillmentKind(live, purchase, cartFulfillmentKinds.erc1155Transfer);
  }, 360_000);

  it('executes ERC1155_MINT_TO (kind 5)', async () => {
    const { live, erc1155 } = liveRef.value;
    const sellerBefore = await balance1155(live, erc1155.contract, erc1155.tokenId, live.sellerAddress);
    const buyerBefore = await balance1155(live, erc1155.contract, erc1155.tokenId, live.buyerAddress);
    await expectKind(live, erc1155.mintListing, '2', cartFulfillmentKinds.erc1155MintTo);
    const purchase = await checkout(live, erc1155.mintListing, '2');
    expectTx(purchase);
    expect(purchase.approvalTxHash).toBeNull();
    await expect(balance1155(live, erc1155.contract, erc1155.tokenId, live.sellerAddress))
      .resolves.toBe(sellerBefore);
    await expect(balance1155(live, erc1155.contract, erc1155.tokenId, live.buyerAddress))
      .resolves.toBe(buyerBefore + 2n);
    await expectFulfillmentKind(live, purchase, cartFulfillmentKinds.erc1155MintTo);
  }, 360_000);

  it('executes the maximum listing items permitted by the 20-order-line cap', async () => {
    const { live, erc1155 } = liveRef.value;
    expect(erc1155.maxLineListings).toHaveLength(maxCartListingItems + 1);
    const sellerBefore = await balance1155(live, erc1155.contract, erc1155.tokenId, live.sellerAddress);
    const buyerBefore = await balance1155(live, erc1155.contract, erc1155.tokenId, live.buyerAddress);
    const listingArgs = erc1155.maxLineListings.slice(0, maxCartListingItems).flatMap((listing) => ['--listing', listing]);
    await expect(jsonCommand(live.buyerHome, [
      'cart', 'checkout', ...erc1155.maxLineListings.flatMap(listing => ['--listing', listing]),
      '--payment-currency', 'eth', '--preview', '--chain', live.chain,
    ], 360_000)).rejects.toThrow(/more than 20 order lines/u);
    const preview = await jsonCommand<CheckoutPreview>(live.buyerHome, [
      'cart', 'checkout', ...listingArgs, '--payment-currency', 'eth', '--preview', '--chain', live.chain,
    ], 360_000);
    expect(preview.preparation.lines).toHaveLength(expectedMaxCheckoutOrderLines);
    expect(preview.preparation.lines.length).toBeLessThanOrEqual(protocolMaxCartOrderLines);
    expect(preview.preparation.lines.filter((line) =>
      line.fulfillmentKind === cartFulfillmentKinds.erc1155Transfer)).toHaveLength(maxCartListingItems);

    const purchase = await jsonCommand<CheckoutResult>(live.buyerHome, [
      'cart', 'checkout', ...listingArgs, '--payment-currency', 'eth', '--chain', live.chain,
    ], 480_000);
    expectTx(purchase);
    expect(purchase.lineCount).toBe(expectedMaxCheckoutOrderLines);
    expect(purchase.actionCount).toBe(maxCartListingItems);
    await expect(balance1155(live, erc1155.contract, erc1155.tokenId, live.sellerAddress))
      .resolves.toBe(sellerBefore - BigInt(maxCartListingItems));
    await expect(balance1155(live, erc1155.contract, erc1155.tokenId, live.buyerAddress))
      .resolves.toBe(buyerBefore + BigInt(maxCartListingItems));

    const receipt = await live.publicClient.getTransactionReceipt({ hash: purchase.txHash });
    const settled = parseEventLogs({ abi: cartAbi, logs: receipt.logs, eventName: 'OrderLineSettled' });
    const fulfilled = parseEventLogs({ abi: cartAbi, logs: receipt.logs, eventName: 'FulfillmentActionExecuted' });
    expect(settled).toHaveLength(expectedMaxCheckoutOrderLines);
    expect(fulfilled).toHaveLength(maxCartListingItems);
    expect(new Set(settled.map((event) => event.args.lineIndex)).size).toBe(expectedMaxCheckoutOrderLines);
    expect(new Set(fulfilled.map((event) => event.args.lineIndex)).size).toBe(maxCartListingItems);
    expect(settled.every((event) => event.args.orderId === purchase.orderId)).toBe(true);
    expect(fulfilled.every((event) =>
      event.args.fulfillmentKind === cartFulfillmentKinds.erc1155Transfer)).toBe(true);
    expect(settled.filter(event => event.args.fulfillmentKind === cartFulfillmentKinds.none)).toHaveLength(2);
    const rare = createRareClient({ publicClient: live.publicClient, apiBaseUrl: live.accountApiBaseUrl });
    await expect.poll(() => rare.cart.checkout.receipt(purchase.orderId), {
      timeout: 180_000, interval: 2_000,
    }).toMatchObject({ status: 'indexed', issues: [] });
    const saved = await rare.cart.checkout.receipt(purchase.orderId);
    const allocations = saved.feeAllocations?.allocations;
    if (allocations === undefined) throw new Error('Cart receipt lost its immutable refund allocations.');
    const sellerAllocations = allocations.filter(allocation => allocation.bearer === 'SELLER');
    expect(sellerAllocations).toHaveLength(maxCartListingItems);
    expect(new Set(sellerAllocations.map(allocation => allocation.sourceLineIndex)).size).toBe(maxCartListingItems);
    expect(new Set(sellerAllocations.map(allocation => allocation.finalLineIndex)).size).toBe(1);
    for (const line of saved.lines.filter(line => line.fulfillmentKind === cartFulfillmentKinds.none)) {
      expect(allocations.filter(allocation => allocation.finalLineIndex === Number(line.lineIndex))
        .reduce((sum, allocation) => sum + BigInt(allocation.amount), 0n)).toBe(BigInt(line.amount));
    }
  }, 600_000);

  it('executes ERC721_MINT_TO (kind 4)', async () => {
    const { live, erc721 } = liveRef.value;
    const cart = getCartAddress(live.chain);
    const prepared = await step('prepare lazy ERC-721 Cart inventory', () =>
      jsonCommand<{ minter: Address; tokenCount: string } & TxResult>(live.sellerHome, [
        'collection', 'prepare-lazy-mint', '--contract', erc721.contract, '--base-uri', `ipfs://${nftFixtureManifest.metadataCid}/lazy`,
        '--amount', '1', '--minter', cart, '--chain', live.chain,
      ], 300_000));
    expectTx(prepared);
    expect(prepared.minter.toLowerCase()).toBe(cart.toLowerCase());
    expect(prepared.tokenCount).toBe('1');
    const erc721Sku = await step('create creator mint variant without an NFT attachment', () =>
      createCreatorMintVariantSku(live, erc721.contract));
    const mintListing = await publishListing(live, erc721Sku, '1', 'ERC721_MINT_TO', false);
    const supplyBefore = await live.publicClient.readContract({
      address: erc721.contract, abi: tokenAbi, functionName: 'totalSupply',
    });
    expect(supplyBefore).toBe(0n);
    await expectKind(live, mintListing, '1', cartFulfillmentKinds.erc721MintTo);
    const purchase = await checkout(live, mintListing, '1');
    expectTx(purchase);
    expect(purchase.approvalTxHash).toBeNull();
    const event = await expectFulfillmentKind(live, purchase, cartFulfillmentKinds.erc721MintTo);
    expect(event.tokenId).toBe(1n);
    await expect(live.publicClient.readContract({
      address: erc721.contract, abi: erc721Abi, functionName: 'tokenURI', args: [event.tokenId],
    })).resolves.toBe(`ipfs://${nftFixtureManifest.metadataCid}/lazy/${event.tokenId}.json`);
    await expect(live.publicClient.readContract({
      address: erc721.contract, abi: tokenAbi, functionName: 'ownerOf', args: [event.tokenId],
    })).resolves.toBe(live.buyerAddress);
    await expect(live.publicClient.readContract({
      address: erc721.contract, abi: tokenAbi, functionName: 'totalSupply',
    })).resolves.toBe(supplyBefore + 1n);
  }, 600_000);
});

async function deploy(live: BuyerLiveFixture, args: string[]): Promise<Address> {
  const result = await step(`deploy ${args[2] ?? 'Cart'} collection`, () =>
    jsonCommand<{ contract: Address } & TxResult>(live.sellerHome, args, 300_000));
  expectTx(result);
  return result.contract;
}

async function delayAfterDeployments(): Promise<void> {
  await step('wait 15 seconds after collection deployments', () =>
    new Promise((resolve) => setTimeout(resolve, contractSettlementDelayMs)));
}

async function mintErc1155(
  live: BuyerLiveFixture,
  contract: Address,
  tokenId: string,
  quantity: string,
  to: Address,
): Promise<void> {
  const result = await jsonCommand<TxResult>(live.sellerHome, [
    'collection', 'erc1155', 'mint', '--contract', contract, '--token-id', tokenId,
    '--quantity', quantity, '--to', to, '--chain', live.chain,
  ], 240_000);
  expectTx(result);
}

async function setMinter(live: BuyerLiveFixture, contract: Address, minter: Address): Promise<void> {
  const result = await jsonCommand<TxResult>(live.sellerHome, [
    'collection', 'erc1155', 'minter', 'set', '--contract', contract, '--minter', minter,
    '--approved', 'true', '--chain', live.chain,
  ], 240_000);
  expectTx(result);
  await expect(live.publicClient.readContract({
    address: contract, abi: rareErc1155Abi, functionName: 'isApprovedMinter', args: [minter],
  })).resolves.toBe(true);
}

async function publishListing(
  live: BuyerLiveFixture,
  sku: Hex,
  quantity: string,
  fulfillmentKind: 'ERC1155_TRANSFER' | 'ERC1155_MINT_TO' | 'ERC721_MINT_TO',
  expectsApproval: boolean,
): Promise<Hex> {
  const input = join(live.tempDir, `${fulfillmentKind}.json`);
  await writeFile(input, JSON.stringify({
    deadline: String(Math.floor(Date.now() / 1_000) + 3_600),
    listings: [{
      sku, settlementCurrency: 'eth', unitPrice: '0.000001', quantity,
      fulfillmentKind, paymentRecipient: live.sellerAddress,
    }],
  }), 'utf8');
  const result = await jsonCommand<{ listingDigests: Hex[]; approvalTxHashes: Hex[] }>(live.sellerHome, [
    'cart', 'listing', 'create', '--input', input, '--chain', live.chain,
  ], 300_000);
  expect(result.listingDigests).toHaveLength(1);
  expect(result.approvalTxHashes).toHaveLength(expectsApproval ? 1 : 0);
  return result.listingDigests[0]!;
}

async function publishMaxLineListings(live: BuyerLiveFixture, sku: Hex): Promise<Hex[]> {
  const input = join(live.tempDir, 'max-line-listings.json');
  await writeFile(input, JSON.stringify({
    deadline: String(Math.floor(Date.now() / 1_000) + 3_600),
    listings: Array.from({ length: maxCartListingItems + 1 }, () => ({
      sku,
      settlementCurrency: 'eth',
      unitPrice: '0.000001',
      quantity: '1',
      fulfillmentKind: 'ERC1155_TRANSFER',
      paymentRecipient: live.sellerAddress,
    })),
  }), 'utf8');
  const result = await jsonCommand<{ listingDigests: Hex[]; approvalTxHashes: Hex[] }>(live.sellerHome, [
    'cart', 'listing', 'create', '--input', input, '--chain', live.chain,
  ], 360_000);
  expect(result.listingDigests).toHaveLength(maxCartListingItems + 1);
  expect(new Set(result.listingDigests).size).toBe(maxCartListingItems + 1);
  expect(result.approvalTxHashes).toHaveLength(0);
  return result.listingDigests;
}

async function expectKind(
  live: BuyerLiveFixture,
  listing: Hex,
  quantity: string,
  kind: number,
): Promise<void> {
  const preview = await jsonCommand<CheckoutPreview>(live.buyerHome, [
    'cart', 'checkout', '--listing', `${listing}=${quantity}`, '--payment-currency', 'eth',
    '--preview', '--chain', live.chain,
  ], 300_000);
  expect(preview.preparation.lines.map((line) => line.fulfillmentKind)).toContain(kind);
}

async function checkout(live: BuyerLiveFixture, listing: Hex, quantity: string): Promise<CheckoutResult> {
  return jsonCommand<CheckoutResult>(live.buyerHome, [
    'cart', 'checkout', '--listing', `${listing}=${quantity}`, '--payment-currency', 'eth',
    '--chain', live.chain,
  ], 360_000);
}

async function balance1155(
  live: BuyerLiveFixture,
  contract: Address,
  tokenId: bigint,
  account: Address,
): Promise<bigint> {
  return live.publicClient.readContract({
    address: contract, abi: rareErc1155Abi, functionName: 'balanceOf', args: [account, tokenId],
  });
}

async function expectFulfillmentKind(
  live: BuyerLiveFixture,
  purchase: CheckoutResult,
  kind: number,
): Promise<{ tokenId: bigint }> {
  const receipt = await live.publicClient.getTransactionReceipt({ hash: purchase.txHash });
  const events = parseEventLogs({ abi: cartAbi, logs: receipt.logs, eventName: 'FulfillmentActionExecuted' });
  const event = events.find((candidate) => candidate.args.fulfillmentKind === kind);
  expect(event).toBeDefined();
  return { tokenId: event!.args.tokenId };
}

function unique(prefix: string): string {
  return `${prefix}${Date.now().toString().slice(-7)}`;
}
