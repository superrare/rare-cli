import type { AuctionCreateParams } from '../sdk/types.js';

export type AuctionTypeOption = NonNullable<AuctionCreateParams['auctionType']>;

export function parseAuctionTypeOption(
  value: string | undefined,
  startTime: string | undefined,
): AuctionTypeOption {
  if (value === undefined) {
    return startTime === undefined ? 'reserve' : 'scheduled';
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'reserve' || normalized === 'coldie' || normalized === 'coldie-auction') {
    if (startTime !== undefined) {
      throw new Error('--start-time can only be used with scheduled auctions.');
    }
    return 'reserve';
  }
  if (normalized === 'scheduled' || normalized === 'scheduled-auction') {
    return 'scheduled';
  }
  throw new Error('--type must be "reserve" or "scheduled".');
}
