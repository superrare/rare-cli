import { describe, it } from 'vitest';
import { purchasePrintJourney } from './helpers/print-purchase.js';

describe('Cart payment through Prodigi sandbox fulfillment', () => {
  it.each(['print-only', 'mixed', 'claim'] as const)('purchases %s through Cart and verifies fees and Prodigi acceptance', async journey => {
    await purchasePrintJourney(journey);
  }, 600_000);
});
