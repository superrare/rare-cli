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
