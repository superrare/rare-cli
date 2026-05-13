import { describe, expect, it } from 'vitest';
import { parseAuctionTypeOption } from '../../../src/commands/auction-core.js';

describe('auction command core', () => {
  it('defaults to reserve auctions unless a start time is provided', () => {
    expect(parseAuctionTypeOption(undefined, undefined)).toBe('reserve');
    expect(parseAuctionTypeOption(undefined, '1778500000')).toBe('scheduled');
  });

  it('parses supported auction type aliases', () => {
    expect(parseAuctionTypeOption('reserve', undefined)).toBe('reserve');
    expect(parseAuctionTypeOption('coldie-auction', undefined)).toBe('reserve');
    expect(parseAuctionTypeOption('scheduled', undefined)).toBe('scheduled');
    expect(parseAuctionTypeOption('scheduled-auction', undefined)).toBe('scheduled');
  });

  it('rejects invalid auction type combinations', () => {
    expect(() => parseAuctionTypeOption('reserve', '1778500000')).toThrow(
      '--start-time can only be used with scheduled auctions.',
    );
    expect(() => parseAuctionTypeOption('unknown', undefined)).toThrow('--type must be "reserve" or "scheduled".');
  });
});
