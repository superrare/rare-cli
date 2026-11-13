import { describe, it } from 'vitest';
import { purchasePrintJourney } from './helpers/print-purchase.js';

describe('multi-copy print purchase through Prodigi sandbox', () => {
  it('purchases two copies within the creator limit and submits both copies to Prodigi', async () => {
    await purchasePrintJourney('two-copy');
  }, 600_000);
});
