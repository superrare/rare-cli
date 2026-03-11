const API_BASE_URL = 'http://api.superrare.org';

export type SearchPageResponse = {
  items: Record<string, unknown>[];
  total: number;
  hasNextPage: boolean;
  nextCursor: number;
};

export type NftSearchParams = {
  query?: string;
  take?: number;
  cursor?: number;
  sortBy?: string;
  ownerAddresses?: string[];
  creatorAddresses?: string[];
  collectionIds?: string[];
  contractAddresses?: string[];
  auctionStates?: string[];
  chainIds?: number[];
};

export type CollectionSearchParams = {
  query?: string;
  take?: number;
  cursor?: number;
  sortBy?: string;
  ownerAddresses?: string[];
};

async function searchPost(path: string, payload: Record<string, unknown>): Promise<SearchPageResponse> {
  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message = (json as Record<string, unknown>).error ?? text;
    throw new Error(`Search API error ${response.status} on ${path}: ${message}`);
  }

  return json as SearchPageResponse;
}

export async function searchNfts(params: NftSearchParams): Promise<SearchPageResponse> {
  return searchPost('/api/search/nfts', {
    query: params.query ?? '',
    take: params.take ?? 24,
    cursor: params.cursor ?? 0,
    sortBy: params.sortBy ?? 'RECENT_ACTIVITY_DESC',
    ownerAddresses: params.ownerAddresses ?? [],
    creatorAddresses: params.creatorAddresses ?? [],
    collectionIds: params.collectionIds ?? [],
    contractAddresses: params.contractAddresses ?? [],
    ...(params.auctionStates ? { auctionStates: params.auctionStates } : {}),
    ...(params.chainIds ? { chainIds: params.chainIds } : {}),
  });
}

export async function searchCollections(params: CollectionSearchParams): Promise<SearchPageResponse> {
  return searchPost('/api/search/collections', {
    query: params.query ?? '',
    take: params.take ?? 24,
    cursor: params.cursor ?? 0,
    sortBy: params.sortBy ?? 'NEWEST',
    ownerAddresses: params.ownerAddresses ?? [],
  });
}
