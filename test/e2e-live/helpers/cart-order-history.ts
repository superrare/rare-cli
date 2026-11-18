import type { CartOrder, CartOrdersPage } from '@rareprotocol/rare-sdk';
import { expect } from 'vitest';
import { jsonCommand, type BuyerLiveFixture } from './live-harness.js';

/** Shared test accounts can have older orders on earlier pages. */
export async function findCartOrderInHistory(home: string, id: string, pageNumber = 1): Promise<CartOrder | undefined> {
  if (pageNumber > 100) throw new Error('Order history exceeded 100 test-account pages.');
  const page = await jsonCommand<CartOrdersPage>(home,
    ['cart', 'orders', 'list', '--page', String(pageNumber), '--per-page', '100']);
  const order = page.data.find(candidate => candidate.id === id);
  if (order !== undefined || pageNumber >= page.pagination.totalPages) return order;
  return findCartOrderInHistory(home, id, pageNumber + 1);
}

/** A seller may see public settlement, but not another account's private order. */
export async function verifyPrivateCartOrder(fixture: BuyerLiveFixture, id: string): Promise<void> {
  const buyer = await jsonCommand<{ accountId: string }>(fixture.buyerHome, ['profile', 'get']);
  const seller = await jsonCommand<{ accountId: string }>(fixture.sellerHome, ['profile', 'get']);
  expect(buyer.accountId).not.toBe(seller.accountId);
  expect(await findCartOrderInHistory(fixture.buyerHome, id)).toMatchObject({ id });
  await expect(jsonCommand(fixture.sellerHome, ['cart', 'orders', 'get', '--id', id])).rejects.toThrow(/Status: 404/u);
}

/** Poll the buyer's authenticated order for provider submission and reconciled progress. */
export async function waitForSubmittedPrintOrder(home: string, orderId: string, count: number): Promise<CartOrder> {
  const readOrder = (): Promise<CartOrder> => jsonCommand<CartOrder>(home, ['cart', 'orders', 'get', '--id', orderId]);
  await expect.poll(async () => (await readOrder()).fulfillments.map(item => ({
    providerOrderId: item.providerOrderId,
    stage: item.progress?.stage,
  })), { timeout: 240_000, interval: 5_000 }).toEqual(Array.from({ length: count }, () => ({
    providerOrderId: expect.stringMatching(/^[A-Za-z0-9~_-]+$/u),
    stage: expect.stringMatching(/^(SUBMITTED|IN_PRODUCTION|PARTIALLY_SHIPPED|SHIPPED)$/u),
  })));

  const order = await readOrder();
  expect(order.id).toBe(orderId);
  expect(['CONFIRMED', 'FULFILLED']).toContain(order.status);
  expect(order.fulfillments).toHaveLength(count);
  expect(new Set(order.fulfillments.map(item => item.providerOrderId)).size).toBe(count);
  for (const fulfillment of order.fulfillments) {
    expect(fulfillment.kind).toBe('PRODIGI_PRINT');
    expect(fulfillment.providerOrderId).toMatch(/^[A-Za-z0-9~_-]+$/u);
    const progress = fulfillment.progress;
    if (!progress) throw new Error('Order is missing reconciled print progress.');
    expect(['SUBMITTED', 'IN_PRODUCTION', 'PARTIALLY_SHIPPED', 'SHIPPED']).toContain(progress.stage);
    expect(progress.productionStatus).not.toBe('ERROR');
    expect(Number.isFinite(Date.parse(progress.providerUpdatedAt))).toBe(true);
    expect(Number.isFinite(Date.parse(progress.checkedAt))).toBe(true);
    expect(progress).not.toHaveProperty('recipient');
    expect(progress).not.toHaveProperty('items');
    for (const shipment of progress.shipments) {
      expect(shipment.id).toBeTruthy();
      if (shipment.trackingUrl !== null) expect(new URL(shipment.trackingUrl).protocol).toBe('https:');
      expect(shipment).not.toHaveProperty('deliveredAt');
    }
  }
  return order;
}
