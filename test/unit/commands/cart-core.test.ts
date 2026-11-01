import { describe, expect, it } from 'vitest';
import { zeroAddress } from 'viem';
import {
  parseCartAmount,
  parseCartListingFile,
  parseCartListingSelections,
  parseCartSellerFulfillmentKind,
  parseCartCheckoutFile,
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

  it('preserves per-listing basis-point splits without applying marketplace percentage conventions', () => {
    const splits = [
      { recipient: '0x0000000000000000000000000000000000000001', basisPoints: 6667 },
      { recipient: '0x0000000000000000000000000000000000000002', basisPoints: 3333 },
    ];
    const result = parseCartListingFile(JSON.stringify({ deadline: '2030-01-01T00:00:00.000Z',
      listings: [{ sku, settlementCurrency: 'eth', unitPrice: '1', splits },
        { sku: listingB, settlementCurrency: 'rare', unitPrice: '2', splits: [] }] }));
    expect(result.isValid).toBe(true);
    if (!result.isValid) throw new Error(result.issues.join(' '));
    expect(result.value.listings[0]?.splits).toEqual(splits);
    expect(result.value.listings[1]?.splits).toEqual([]);
  });

  it.each([
    null,
    [{ recipient: zeroAddress, basisPoints: 10000 }],
    [{ recipient: 'not-an-address', basisPoints: 10000 }],
    [{ recipient: '0x0000000000000000000000000000000000000001', basisPoints: 0 }],
    [{ recipient: '0x0000000000000000000000000000000000000001', basisPoints: 10000.1 }],
    [{ recipient: '0x0000000000000000000000000000000000000001', basisPoints: 65536 }],
    [{ recipient: '0x0000000000000000000000000000000000000001', basisPoints: 9999 }],
    [{ recipient: '0x0000000000000000000000000000000000000001', basisPoints: 5000 },
      { recipient: '0x0000000000000000000000000000000000000001', basisPoints: 5000 }],
    [{ recipient: '0x0000000000000000000000000000000000000001', basisPoints: 10000, unexpected: true }],
    Array.from({ length: 17 }, (_, index) => ({ recipient: `0x${(index + 1).toString(16).padStart(40, '0')}`, basisPoints: 1000 })),
  ].map(splits => ({ splits })))('rejects malformed Cart split allocations before I/O: %j', ({ splits }) => {
    expect(parseCartListingFile(JSON.stringify({ deadline: '2030-01-01T00:00:00.000Z',
      listings: [{ sku, settlementCurrency: 'eth', unitPrice: '1', splits }] })).isValid).toBe(false);
  });

  it('rejects an explicit paymentRecipient that is not first in its split schedule', () => {
    const result = parseCartListingFile(JSON.stringify({ deadline: '2030-01-01T00:00:00.000Z',
      listings: [{ sku, settlementCurrency: 'eth', unitPrice: '1',
        paymentRecipient: '0x0000000000000000000000000000000000000002',
        splits: [{ recipient: '0x0000000000000000000000000000000000000001', basisPoints: 10000 }] }] }));
    expect(result).toEqual({ isValid: false, issues: ['listings[0].splits must start with paymentRecipient.'] });
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

  it('normalizes an explicit seller fulfillment kind in a listing intent file', () => {
    const result = parseCartListingFile(JSON.stringify({
      deadline: '2030-01-01T00:00:00.000Z',
      listings: [{
        sku,
        settlementCurrency: 'ETH',
        unitPrice: '1',
        fulfillmentKind: 'ERC1155_MINT_TO',
      }],
    }));

    expect(result).toEqual({
      isValid: true,
      value: {
        deadline: 1_893_456_000n,
        listings: [{
          sku,
          settlementCurrency: 'eth',
          unitPrice: '1',
          quantity: 1n,
          fulfillmentKind: 5,
        }],
      },
    });
  });

  it.each([
    ['ERC721_TRANSFER', 2],
    ['ERC1155_TRANSFER', 3],
    ['ERC721_MINT_TO', 4],
    ['ERC1155_MINT_TO', 5],
  ])('maps seller fulfillment %s to SDK kind %s', (fulfillmentKind, expected) => {
    expect(parseCartSellerFulfillmentKind(fulfillmentKind, 'fulfillmentKind')).toEqual({
      isValid: true,
      value: expected,
    });
  });

  it('rejects fulfillment kinds that sellers cannot publish', () => {
    expect(parseCartSellerFulfillmentKind('OFF_CHAIN', 'fulfillmentKind')).toEqual({
      isValid: false,
      issues: [
        'fulfillmentKind must be ERC721_TRANSFER, ERC1155_TRANSFER, ERC721_MINT_TO, or ERC1155_MINT_TO.',
      ],
    });
  });

  it('parses repeatable checkout listings and defaults quantity to one', () => {
    expect(parseCartListingSelections([listingA, `${listingB}=2`])).toEqual({
      isValid: true,
      value: [
        { kind: 'listing', listingDigest: listingA, quantity: 1n },
        { kind: 'listing', listingDigest: listingB, quantity: 2n },
      ],
    });
  });

  it('validates typed checkout items and rejects ambiguous swap amounts', () => {
    expect(parseCartCheckoutFile(JSON.stringify({ items: [
      { kind: 'listing', listingDigest: listingA },
      { kind: 'swap', mode: 'exact-output', outputCurrency: 'USDC', outputAmount: '12.5' },
    ] }))).toEqual({ isValid: true, value: { items: [
      { kind: 'listing', listingDigest: listingA, quantity: 1n },
      { kind: 'swap', mode: 'exact-output', outputCurrency: 'usdc', outputAmount: '12.5' },
    ] } });
    expect(parseCartCheckoutFile(JSON.stringify({ items: [{ kind: 'swap', mode: 'exact-input',
      outputCurrency: 'rare', inputAmount: '1', outputAmount: '2' }] })).isValid).toBe(false);
    expect(parseCartCheckoutFile(JSON.stringify({ items: [] })).isValid).toBe(false);
  });

  it('preserves mint-to-print associations and rejects ambiguous unit mappings', () => {
    const selection = { preparationId: '89e5fd73-4c38-4cc6-84d3-e526de485cda', listingDigest: listingA, unitIndexes: [0, 1] };
    const input = { items: [{ kind: 'listing', listingDigest: listingA, quantity: '2' }], mintSelections: [selection] };
    expect(parseCartCheckoutFile(JSON.stringify(input))).toEqual({ isValid: true, value: {
      items: [{ kind: 'listing', listingDigest: listingA, quantity: 2n }], mintSelections: [selection],
    } });
    for (const unitIndexes of [[], [0, 0], [-1], [0.5]]) {
      expect(parseCartCheckoutFile(JSON.stringify({ ...input, mintSelections: [{ ...selection, unitIndexes }] })).isValid).toBe(false);
    }
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

  it('allows free listing prices while keeping purchase quantities positive', () => {
    const listing = parseCartListingFile(JSON.stringify({ deadline: '2030-01-01T00:00:00.000Z',
      listings: [{ sku, settlementCurrency: 'USDC', unitPrice: '0', quantity: '1' }] }));
    expect(listing.isValid).toBe(true);
    expect(parseCartAmount('0', 6, 'unitPrice')).toEqual({ isValid: true, value: 0n });
    expect(parseCartAmount('0.00', 6, 'unitPrice')).toEqual({ isValid: true, value: 0n });
    expect(parseCartAmount('-1', 6, 'unitPrice').isValid).toBe(false);
    expect(parseCartListingSelections([`${listingA}=0`]).isValid).toBe(false);
    expect(parseCartListingFile(JSON.stringify({ deadline: '2030-01-01T00:00:00.000Z',
      listings: [{ sku, settlementCurrency: 'USDC', unitPrice: '0', quantity: '0' }] })).isValid).toBe(false);
  });
});
