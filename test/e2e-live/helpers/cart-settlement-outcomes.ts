import { expect } from 'vitest';
import type { CartCheckoutPreparation, CartCheckoutReceipt, RareClient } from '@rareprotocol/rare-sdk';
import { cartAbi, getCartAddress } from '@rareprotocol/rare-sdk/contracts';
import { erc20Abi, getAddress, isAddressEqual, parseEventLogs, type Hex } from 'viem';
import type { LiveFixture } from './live-harness.js';

// Same-currency settlement helper. Routed mixed-currency carts have separate verification.

export async function verifyUsdcCartSettlement(
  fixture: LiveFixture,
  rare: RareClient,
  purchase: { txHash: Hex; orderId: Hex },
  preview: Pick<CartCheckoutPreparation, 'paymentAmount'>,
  physical: boolean,
): Promise<CartCheckoutReceipt> {
  await expect.poll(async () => (await rare.cart.checkout.receipt(purchase.orderId)).status,
    { timeout: 180_000, interval: 2_000 }).toBe('indexed');
  const receipt = await rare.cart.checkout.receipt(purchase.orderId);
  expect(receipt.paymentCurrency?.toLowerCase()).toBe(fixture.usdcAddress.toLowerCase());
  expect(receipt.lines.every(line => isAddressEqual(getAddress(line.settlementCurrency), fixture.usdcAddress))).toBe(true);
  expect(BigInt(receipt.paymentAmount ?? '-1')).toBe(BigInt(preview.paymentAmount));
  expect(receipt.lines.reduce((sum, line) => sum + BigInt(line.amount), 0n)).toBe(BigInt(preview.paymentAmount));
  const transaction = await fixture.publicClient.getTransactionReceipt({ hash: purchase.txHash });
  const events = parseEventLogs({ abi: cartAbi, logs: transaction.logs.filter(log => isAddressEqual(log.address, getCartAddress(fixture.chain))), eventName: 'OrderLineSettled' });
  expect(events).toHaveLength(receipt.lines.length);
  for (const line of receipt.lines) expect(events.find(event => event.args.lineIndex === BigInt(line.lineIndex))?.args).toMatchObject({
    orderId: purchase.orderId, sku: line.sku, listingDigest: line.listingDigest, amount: BigInt(line.amount),
    paymentRecipient: getAddress(line.paymentRecipient), settlementCurrency: getAddress(line.settlementCurrency), quantity: BigInt(line.quantity),
  });
  expect(receipt.issues).toEqual([]);
  const transfers = parseEventLogs({ abi: erc20Abi,
    logs: transaction.logs.filter(log => log.address.toLowerCase() === fixture.usdcAddress.toLowerCase()), eventName: 'Transfer' });
  const unsplitLines = receipt.lines.filter(line => !receipt.splitAllocations.some(allocation => allocation.lineIndex === line.lineIndex));
  const recipients = new Set([...unsplitLines.map(line => line.paymentRecipient.toLowerCase()), ...receipt.splitAllocations.map(allocation => allocation.recipient.toLowerCase())]);
  for (const recipient of recipients) {
    const entitlement = unsplitLines.filter(line => line.paymentRecipient.toLowerCase() === recipient).reduce((sum, line) => sum + BigInt(line.amount), 0n)
      + receipt.splitAllocations.filter(allocation => allocation.recipient.toLowerCase() === recipient).reduce((sum, allocation) => sum + BigInt(allocation.amount), 0n);
    const received = transfers.filter(event => event.args.to.toLowerCase() === recipient).reduce((sum, event) => sum + event.args.value, 0n);
    expect(received).toBe(entitlement);
  }
  const fees = receipt.feeAllocations?.allocations;
  if (!fees) throw new Error('Indexed receipt lost item-level fee allocations.');
  expect(fees).toEqual(expect.arrayContaining([
    expect.objectContaining({ purpose: 'GALLERY_COMMISSION', bearer: 'SELLER' }),
    expect.objectContaining({ purpose: 'NETWORK_FEE', bearer: 'BUYER' }),
    ...(physical ? [expect.objectContaining({ purpose: 'PRODUCTION', bearer: 'BUYER' }), expect.objectContaining({ purpose: 'SHIPPING', bearer: 'BUYER' })] : []),
  ]));
  for (const fee of fees) {
    if (fee.calculation?.type === 'PERCENTAGE') {
      const unitFee = BigInt(fee.grossAmount) * BigInt(fee.calculation.basisPoints) / 10_000n;
      expect(BigInt(fee.unitAmount)).toBe(unitFee);
      expect(BigInt(fee.amount)).toBe(unitFee * (fee.amountKind === 'PER_UNIT' ? BigInt(fee.quantity) : 1n));
    }
    if (fee.finalLineIndex !== null) expect(receipt.lines[fee.finalLineIndex]).toMatchObject({ sku: fee.feeSku, paymentRecipient: fee.recipient, settlementCurrency: fee.currency });
  }
  return receipt;
}
