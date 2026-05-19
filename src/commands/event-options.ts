import type { NftEventOptions } from '../sdk/api.js';

const eventTypes = [
  'CANCEL_AUCTION',
  'CANCEL_OFFER',
  'CLOSE_AUCTION',
  'CREATE_NFT',
  'CREATE_NFT_SUPPLY',
  'CREATE_RESERVE_AUCTION',
  'CREATE_SCHEDULED_AUCTION',
  'END_AUCTION',
  'MAKE_AUCTION_BID',
  'MAKE_LISTING',
  'MAKE_OFFER',
  'SETTLE_AUCTION',
  'START_AUCTION',
  'TAKE_LISTING',
  'TAKE_OFFER',
  'TRANSFER_NFT',
  'TRANSFER_NFT_SUPPLY',
] as const;

const sortOptions = ['newest', 'oldest'] as const;

export function collectOption(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}

export function parseNftEventTypes(values: string[] | undefined): NftEventOptions['eventType'] | undefined {
  return parseEventTypes(values);
}

export function parseNftEventSort(value: string | undefined): NftEventOptions['sortBy'] | undefined {
  return parseEventSort(value);
}

function parseEventTypes(values: string[] | undefined): typeof eventTypes[number][] | undefined {
  if (values === undefined || values.length === 0) {
    return undefined;
  }
  return values.map((value) => {
    const eventType = eventTypes.find((candidate) => candidate === value);
    if (eventType === undefined) {
      throw new Error(`--event-type must be one of: ${eventTypes.join(', ')}`);
    }
    return eventType;
  });
}

function parseEventSort(value: string | undefined): typeof sortOptions[number] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const sortBy = sortOptions.find((candidate) => candidate === value);
  if (sortBy === undefined) {
    throw new Error(`--sort-by must be one of: ${sortOptions.join(', ')}`);
  }
  return sortBy;
}
