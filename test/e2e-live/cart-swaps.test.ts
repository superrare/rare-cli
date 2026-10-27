import type { CartOrder } from '@rareprotocol/rare-sdk';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { erc20Abi, erc721Abi, parseUnits, parseEventLogs, zeroHash, type Hex } from 'viem';
import { cartAbi, getCartAddress, resolveCurrency } from '@rareprotocol/rare-sdk/contracts';
import { cleanupLiveFixture, createCartLiveFixture, jsonCommand, readTokenBalance, requireBuyerFixture,
  type BuyerLiveFixture } from './helpers/live-harness.js';
import { deployErc721Collection, mintToken } from './helpers/live-erc721.js';
import { createCreatorVariantSkus } from './helpers/cart-creator-variants.js';
import { runCli } from '../helpers/cli.js';

type Preview = { preparation: { paymentAmount: string; lines: Array<{ fulfillmentKind: number; amount: string }> } };
type Purchase = { orderId: Hex; txHash: Hex; paymentAmount: string; actionCount: number };

describe.sequential('live Cart routed swaps through the generic CLI checkout', () => {
  let fixture: BuyerLiveFixture | undefined;
  beforeAll(async () => {
    if (process.env.RARE_API_BASE_URL === undefined) throw new Error('Cart swap live tests require RARE_API_BASE_URL.');
    const created = requireBuyerFixture(await createCartLiveFixture({ buyer: true,
      buyerWalletFilter: async (wallet, { chain, publicClient }) => {
        const currency = resolveCurrency('usdc', chain);
        const [balance, decimals] = await Promise.all([
          publicClient.readContract({ address: currency, abi: erc20Abi, functionName: 'balanceOf', args: [wallet.address] }),
          publicClient.readContract({ address: currency, abi: erc20Abi, functionName: 'decimals' }),
        ]);
        return balance >= parseUnits('1', decimals);
      },
    }));
    fixture = created;
    if (created.chain !== 'sepolia') throw new Error('Cart swap live writes require Sepolia.');
  }, 240_000);
  afterAll(async () => { await cleanupLiveFixture(fixture); });

  it.each([
    ['eth', '--input-amount', '0.00001', 10_000_000_000_000n],
    ['eth', '--output-amount', '0.01', undefined],
    ['usdc', '--input-amount', '0.01', 10_000n],
  ])('receives ERC20 tokens paying %s using %s', async (paymentCurrency, amountFlag, amount, inputAmount) => {
    if (fixture === undefined) throw new Error('Live Cart fixture was not initialized.');
    const live = fixture;
    const args = ['cart', 'swap', '--payment-currency', paymentCurrency, '--output-currency', 'rare',
      amountFlag, amount, '--recipient', live.buyerAddress, '--chain', live.chain];
    const preview = await jsonCommand<Preview>(live.buyerHome, [...args, '--preview']);
    const swapLine = preview.preparation.lines.find(line => line.fulfillmentKind === 6);
    expect(swapLine).toBeDefined();
    if (swapLine === undefined) throw new Error('Swap quote did not contain a currency-swap line.');
    const before = await readTokenBalance(live, live.buyerAddress, live.rareAddress);
    const paymentBalanceBefore = paymentCurrency === 'usdc' ? await readTokenBalance(live, live.buyerAddress, live.usdcAddress) : undefined;
    const purchase = await jsonCommand<Purchase>(live.buyerHome, [...args, '--yes'], 240_000);
    expect(purchase.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(purchase.actionCount).toBe(0);
    await expect.poll(async () => (await jsonCommand<CartOrder>(live.buyerHome,
      ['cart', 'orders', 'get', '--id', purchase.orderId])).status, { timeout: 180_000, interval: 2_000 }).toBe('FULFILLED');
    const history = await jsonCommand<CartOrder>(live.buyerHome,
      ['cart', 'orders', 'get', '--id', purchase.orderId]);
    expect(history.id).toBe(purchase.orderId);
    expect(history.items).toEqual([expect.objectContaining({ lineIndex: 0, fulfillmentStatus: 'FULFILLED' })]);
    expect(history.fulfillments).toEqual([]);

    const receipt = await live.publicClient.getTransactionReceipt({ hash: purchase.txHash });
    const lines = parseEventLogs({ abi: cartAbi, logs: receipt.logs.filter(log => log.address.toLowerCase() === getCartAddress(live.chain).toLowerCase()), eventName: 'OrderLineSettled' });
    expect(lines).toHaveLength(1);
    const settled = lines[0];
    if (settled === undefined) throw new Error('Swap transaction did not settle its output.');
    expect(settled.args).toMatchObject({ fulfillmentKind: 6, listingDigest: zeroHash,
      settlementCurrency: live.rareAddress, paymentRecipient: live.buyerAddress });
    expect(await readTokenBalance(live, live.buyerAddress, live.rareAddress) - before).toBe(settled.args.amount);
    expect(settled.args.amount).toBeGreaterThan(0n);
    if (amountFlag === '--output-amount') expect(settled.args.amount).toBe(10_000_000_000_000_000n);
    if (inputAmount !== undefined) expect(BigInt(purchase.paymentAmount)).toBe(inputAmount);
    if (paymentBalanceBefore !== undefined) expect(paymentBalanceBefore - await readTokenBalance(live, live.buyerAddress, live.usdcAddress)).toBe(BigInt(purchase.paymentAmount));
  }, 300_000);

  it('rejects an unfunded swap without spending buyer tokens', async () => {
    if (fixture === undefined) throw new Error('Live Cart fixture was not initialized.');
    const live = fixture;
    const before = await readTokenBalance(live, live.buyerAddress, live.usdcAddress);
    expect(before).toBeLessThan(1_000_000_000_000n);
    const result = await runCli(['--json', 'cart', 'swap', '--payment-currency', 'usdc',
      '--output-currency', 'rare', '--input-amount', '1000000', '--recipient', live.buyerAddress,
      '--chain', live.chain, '--yes'], { home: live.buyerHome, timeoutMs: 240_000 });
    expect(result.code).not.toBe(0);
    expect(result.stdout).not.toContain('txHash');
    expect(await readTokenBalance(live, live.buyerAddress, live.usdcAddress)).toBe(before);
  }, 300_000);

  it('combines an NFT listing and token output in one checkout', async () => {
    if (fixture === undefined) throw new Error('Live Cart fixture was not initialized.');
    const live = fixture;
    const collection = await deployErc721Collection(live, '1');
    const token = await mintToken(live, collection.contract);
    const [sku] = await createCreatorVariantSkus(live, [token]);
    const listingInput = join(live.tempDir, 'swap-mixed-listing.json');
    await writeFile(listingInput, JSON.stringify({ deadline: String(Math.floor(Date.now() / 1000) + 3600),
      listings: [{ sku, settlementCurrency: 'eth', unitPrice: '0.000001', quantity: '1' }] }));
    const listing = await jsonCommand<{ listingDigests: Hex[] }>(live.sellerHome,
      ['cart', 'listing', 'create', '--input', listingInput, '--chain', live.chain, '--yes'], 240_000);
    const listingDigest = listing.listingDigests[0];
    if (listingDigest === undefined) throw new Error('Mixed checkout fixture did not publish a listing.');
    const input = join(live.tempDir, 'swap-mixed-checkout.json');
    await writeFile(input, JSON.stringify({ items: [
      { kind: 'listing', listingDigest, quantity: '1' },
      { kind: 'swap', mode: 'exact-output', outputCurrency: 'rare', outputAmount: '0.01' },
    ] }));
    const before = await readTokenBalance(live, live.buyerAddress, live.rareAddress);
    const purchase = await jsonCommand<Purchase>(live.buyerHome, ['cart', 'checkout', '--input', input,
      '--payment-currency', 'eth', '--recipient', live.buyerAddress, '--chain', live.chain, '--yes'], 240_000);
    expect(purchase.actionCount).toBe(1);
    expect(await readTokenBalance(live, live.buyerAddress, live.rareAddress) - before).toBe(10_000_000_000_000_000n);
    expect((await live.publicClient.readContract({ address: collection.contract, abi: erc721Abi,
      functionName: 'ownerOf', args: [BigInt(token.tokenId)] })).toLowerCase()).toBe(live.buyerAddress.toLowerCase());
  }, 600_000);
});
