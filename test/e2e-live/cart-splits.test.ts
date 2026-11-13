import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRareClient, type CartCheckoutReceipt } from '@rareprotocol/rare-sdk';
import { cartAbi, getCartAddress, resolveCurrency } from '@rareprotocol/rare-sdk/contracts';
import { erc20Abi, erc721Abi, isAddressEqual, parseEventLogs, parseUnits, zeroAddress, zeroHash, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createCreatorVariantSkus } from './helpers/cart-creator-variants.js';
import { deployErc721Collection, mintToken } from './helpers/live-erc721.js';
import { cleanupLiveFixture, createCartLiveFixture, expectTx, jsonCommand, readTokenBalance,
  requireBuyerFixture, type BuyerLiveFixture } from './helpers/live-harness.js';

type Split = { recipient: Address; basisPoints: number };
type PublishedListings = {
  listingDigests: Hex[];
  signedArtifact: { entries: Array<{ listingDigest: Hex; listing: { splits: Split[] } }> };
};
type Preview = { preparation: { lines: Array<{
  listingDigest: Hex; fulfillmentKind: number; amount: string; settlementCurrency: Address;
}> } };
type Purchase = { txHash: Hex; orderId: Hex; actionCount: number; blockNumber: string };

// This suite is selected by the existing protected live E2E command. Missing
// deployment or wallet prerequisites must fail rather than report a skipped run.
describe.sequential('live six-item Cart checkout with per-listing splits', () => {
  let fixture: BuyerLiveFixture | undefined;
  beforeAll(async () => {
    if (process.env.RARE_API_BASE_URL === undefined) throw new Error('Cart split E2E requires RARE_API_BASE_URL with the current Cart ABI.');
    fixture = requireBuyerFixture(await createCartLiveFixture({ buyer: true,
      buyerWalletFilter: async (wallet, { chain, publicClient }) => {
        const currency = resolveCurrency('usdc', chain);
        const [balance, decimals] = await Promise.all([
          publicClient.readContract({ address: currency, abi: erc20Abi, functionName: 'balanceOf', args: [wallet.address] }),
          publicClient.readContract({ address: currency, abi: erc20Abi, functionName: 'decimals' }),
        ]);
        return balance >= parseUnits('1', decimals);
      },
    }));
    if (fixture.chain !== 'sepolia') throw new Error('Cart split live writes require Sepolia.');
  }, 240_000);
  afterAll(async () => { await cleanupLiveFixture(fixture); });

  it('keeps six merchandise lines, fees, two currencies and two signed split schedules separate', async () => {
    if (fixture === undefined) throw new Error('Cart split fixture was not initialized.');
    const live = fixture;
    const cart = getCartAddress(live.chain);
    const collaborator = privateKeyToAccount(generatePrivateKey()).address;
    const collection = await deployErc721Collection(live, '6');
    const mintTokens = async (remaining: number): Promise<Awaited<ReturnType<typeof mintToken>>[]> => {
      if (remaining === 0) return [];
      const token = await mintToken(live, collection.contract);
      return [token, ...await mintTokens(remaining - 1)];
    };
    const tokens = await mintTokens(6);
    const skus = await createCreatorVariantSkus(live, tokens);
    expect(skus).toHaveLength(6);
    const input = join(live.tempDir, 'split-cart-listings.json');
    await writeFile(input, JSON.stringify({ deadline: String(Math.floor(Date.now() / 1000) + 3600),
      listings: skus.map((sku, index) => ({ sku, settlementCurrency: index < 3 ? 'eth' : 'rare',
        unitPrice: index < 3 ? '0.000001' : '0.01', quantity: '1', paymentRecipient: live.sellerAddress,
        splits: index === 0 || index === 3 ? [
          { recipient: live.sellerAddress, basisPoints: index === 0 ? 6667 : 5555 },
          { recipient: collaborator, basisPoints: index === 0 ? 3333 : 4445 },
        ] : [],
      })),
    }));
    const publication = await jsonCommand<PublishedListings>(live.sellerHome,
      ['cart', 'listing', 'create', '--input', input, '--chain', live.chain, '--yes'], 300_000);
    expect(publication.listingDigests).toHaveLength(6);
    expect(publication.signedArtifact.entries.filter(entry => entry.listing.splits.length > 0)).toHaveLength(2);
    const arguments_ = publication.listingDigests.flatMap(digest => ['--listing', digest]);
    const preview = await jsonCommand<Preview>(live.buyerHome,
      ['cart', 'checkout', ...arguments_, '--payment-currency', 'usdc', '--preview', '--chain', live.chain], 240_000);
    const merchandise = preview.preparation.lines.filter(line => line.listingDigest !== zeroHash);
    expect(merchandise).toHaveLength(6);
    expect(new Set(merchandise.map(line => line.settlementCurrency.toLowerCase()))).toEqual(
      new Set([zeroAddress, live.rareAddress.toLowerCase()]));
    expect(preview.preparation.lines.some(line => line.fulfillmentKind === 0)).toBe(true);
    const [nativeBefore, rareBefore, usdcBefore] = await Promise.all([
      live.publicClient.getBalance({ address: collaborator }),
      readTokenBalance(live, collaborator, live.rareAddress),
      readTokenBalance(live, live.buyerAddress, live.usdcAddress),
    ]);
    const purchase = await jsonCommand<Purchase>(live.buyerHome,
      ['cart', 'checkout', ...arguments_, '--payment-currency', 'usdc', '--chain', live.chain, '--yes'], 300_000);
    expectTx(purchase);
    expect(purchase.actionCount).toBe(6);
    const receipt = await live.publicClient.getTransactionReceipt({ hash: purchase.txHash });
    const logs = receipt.logs.filter(log => isAddressEqual(log.address, cart));
    const lines = parseEventLogs({ abi: cartAbi, logs, eventName: 'OrderLineSettled' });
    const allocations = parseEventLogs({ abi: cartAbi, logs, eventName: 'ListingSplitPaid' });
    expect(allocations).toHaveLength(4);
    for (const allocation of allocations) {
      const settled = lines.find(line => line.args.lineIndex === allocation.args.lineIndex);
      const listing = publication.signedArtifact.entries.find(entry => entry.listingDigest === allocation.args.listingDigest);
      expect(settled?.args.listingDigest).toBe(allocation.args.listingDigest);
      expect(allocation.args.orderId).toBe(purchase.orderId);
      expect(settled?.args.fulfillmentKind).toBe(2);
      if (settled === undefined || listing === undefined) throw new Error('Split allocation lost its merchandise identity.');
      const secondary = listing.listing.splits[1];
      if (secondary === undefined) throw new Error('Split event referenced an unsplit listing.');
      const secondaryAmount = settled.args.amount * BigInt(secondary.basisPoints) / 10000n;
      expect(allocation.args.amount).toBe(isAddressEqual(allocation.args.recipient, collaborator)
        ? secondaryAmount : settled.args.amount - secondaryAmount);
      expect(allocation.args.currency).toBe(settled.args.settlementCurrency);
    }
    const collaboratorAllocations = allocations.filter(allocation => isAddressEqual(allocation.args.recipient, collaborator));
    expect(collaboratorAllocations).toHaveLength(2);
    const allocated = (currency: Address): bigint => collaboratorAllocations
      .filter(allocation => isAddressEqual(allocation.args.currency, currency))
      .reduce((sum, allocation) => sum + allocation.args.amount, 0n);
    expect(await live.publicClient.getBalance({ address: collaborator }) - nativeBefore).toBe(allocated(zeroAddress));
    expect(await readTokenBalance(live, collaborator, live.rareAddress) - rareBefore).toBe(allocated(live.rareAddress));
    expect(usdcBefore - await readTokenBalance(live, live.buyerAddress, live.usdcAddress)).toBeGreaterThan(0n);
    for (const token of tokens) {
      expect(await live.publicClient.readContract({ address: collection.contract, abi: erc721Abi,
        functionName: 'ownerOf', args: [BigInt(token.tokenId)] })).toBe(live.buyerAddress);
    }
    const rare = createRareClient({ publicClient: live.publicClient, apiBaseUrl: live.accountApiBaseUrl });
    const receiptDeadline = Date.now() + 120_000;
    const waitForIndexedReceipt = async (): Promise<CartCheckoutReceipt> => {
      const observed = await rare.cart.checkout.receipt(purchase.orderId);
      if (observed.status === 'inconsistent') throw new Error(`Cart split receipt is inconsistent: ${JSON.stringify(observed.issues)}`);
      if (observed.status === 'indexed') return observed;
      if (Date.now() >= receiptDeadline) throw new Error('Cart split receipt did not finish indexing within 120 seconds.');
      await new Promise(resolve => setTimeout(resolve, 1000));
      return waitForIndexedReceipt();
    };
    const indexed = await waitForIndexedReceipt();
    expect(indexed.splitAllocations).toHaveLength(4);
    expect(indexed.splitAllocations.map(allocation => ({ ...allocation, logId: undefined,
      currency: allocation.currency.toLowerCase(), recipient: allocation.recipient.toLowerCase(),
    }))).toEqual(expect.arrayContaining(allocations.map(allocation => ({
      logId: undefined, lineIndex: allocation.args.lineIndex.toString(),
      listingDigest: allocation.args.listingDigest, currency: allocation.args.currency.toLowerCase(),
      recipient: allocation.args.recipient.toLowerCase(), amount: allocation.args.amount.toString(),
    }))));
  }, 1_200_000);
});
