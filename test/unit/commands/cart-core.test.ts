import { describe, expect, it } from 'vitest';
import {
  parseCartAmount,
  parseCartListingFile,
  parseCartListingSelections,
} from '../../../src/commands/cart-core.js';

const sku = `0x${'11'.repeat(32)}`;
const listingA = `0x${'22'.repeat(32)}`;
const listingB = `0x${'33'.repeat(32)}`;

describe('Cart CLI input planning', () => {
  it('normalizes a minimal listing intent file', () => {
    const result = parseCartListingFile(JSON.stringify({
      deadline: '2030-01-01T00:00:00.000Z',
      listings: [{ sku, settlementCurrency: 'USDC', unitPrice: '12.50' }],
    }));

    expect(result).toEqual({
      isValid: true,
      value: {
        deadline: 1_893_456_000n,
        listings: [{
          sku,
          settlementCurrency: 'usdc',
          unitPrice: '12.50',
          quantity: 1n,
        }],
      },
    });
  });

  it('reports invalid listing fields without performing I/O', () => {
    const result = parseCartListingFile(JSON.stringify({
      deadline: 'not-a-date',
      listings: [{ sku: 'nope', settlementCurrency: 'btc', unitPrice: 0, quantity: 0 }],
    }));

    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.issues.join(' ')).toContain('deadline');
    }
  });

  it('parses repeatable checkout listings and defaults quantity to one', () => {
    expect(parseCartListingSelections([listingA, `${listingB}=2`])).toEqual({
      isValid: true,
      value: [
        { listingDigest: listingA, quantity: 1n },
        { listingDigest: listingB, quantity: 2n },
      ],
    });
  });

  it('rejects duplicate listings and unsafe quantities', () => {
    expect(parseCartListingSelections([listingA, `${listingA}=2`])).toEqual({
      isValid: false,
      issues: [`--listing contains duplicate listing ${listingA}.`],
    });
    expect(parseCartListingSelections([`${listingA}=1.5`])).toEqual({
      isValid: false,
      issues: ['--listing quantity at index 0 must be a positive integer string.'],
    });
  });

  it('converts human currency amounts only after decimals are known', () => {
    expect(parseCartAmount('12.50', 6, 'unitPrice')).toEqual({ isValid: true, value: 12_500_000n });
    expect(parseCartAmount('0.0000001', 6, 'unitPrice')).toEqual({
      isValid: false,
      issues: ['unitPrice has more than 6 decimal places.'],
    });
  });
});
