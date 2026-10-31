import type { CartOrder, CartOrdersPage } from '@rareprotocol/rare-sdk';
import { jsonCommand } from './live-harness.js';

/** Shared test accounts can have older orders on earlier pages. */
export async function findCartOrderInHistory(home: string, id: string, pageNumber = 1): Promise<CartOrder | undefined> {
  if (pageNumber > 100) throw new Error('Order history exceeded 100 test-account pages.');
  const page = await jsonCommand<CartOrdersPage>(home,
    ['cart', 'orders', 'list', '--page', String(pageNumber), '--per-page', '100']);
  const order = page.data.find(candidate => candidate.id === id);
  if (order !== undefined || pageNumber >= page.pagination.totalPages) return order;
  return findCartOrderInHistory(home, id, pageNumber + 1);
}
