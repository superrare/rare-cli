import { isAddress, type Address } from 'viem';
import { createApiClient, type ApiClient } from '../data-access/index.js';
import type { components } from '../data-access/schema.js';

let _client: ApiClient | undefined;

function getClient(): ApiClient {
  _client ??= createApiClient();
  return _client;
}

// --- Re-exported types from OpenAPI schema ---

export type Nft = components['schemas']['Nft'];
export type Collection = components['schemas']['Collection'];
export type NftEvent = components['schemas']['NftEvent'];
export type UserProfile = components['schemas']['UserProfile'];
export type Pagination = components['schemas']['Pagination'];

// --- Types for media/metadata (kept for SDK compatibility) ---

export type NftMediaEntry = {
  url: string;
  mimeType: string;
  size: number;
  dimensions?: { width: number; height: number };
};

export type NftAttribute = {
  trait_type?: string;
  value: string | number;
  display_type?: 'number' | 'boost_number' | 'boost_percentage' | 'date';
  max_value?: number;
};

export type PinMetadataParams = {
  name: string;
  description: string;
  image: NftMediaEntry;
  video?: NftMediaEntry;
  tags?: string[];
  attributes?: NftAttribute[];
};

export type ImportErc721Params = {
  contract: Address;
  owner?: Address;
};

type ImportErc721RequestParams = {
  chainId: number;
  contract: Address;
  owner: Address;
};

// --- Search types (new API uses GET with query params + pagination) ---

export type NftSearchParams = {
  query?: string;
  page?: number;
  perPage?: number;
  sortBy?: 'newest' | 'oldest' | 'priceAsc' | 'priceDesc' | 'recentlySold' | 'auctionEndingSoon' | 'recentActivity' | 'bidAsc' | 'bidDesc';
  ownerAddress?: string;
  creatorAddress?: string;
  contractAddress?: string;
  collectionId?: string;
  chainId?: number;
  hasAuction?: boolean;
  auctionState?: 'PENDING' | 'RUNNING' | 'UNSETTLED';
  hasListing?: boolean;
  hasOffer?: boolean;
  tags?: string[];
  mediaType?: 'IMAGE' | 'VIDEO' | 'GIF' | '3D' | 'HTML' | 'AUDIO';
};

export type CollectionSearchParams = {
  query?: string;
  page?: number;
  perPage?: number;
  sortBy?: 'newest' | 'oldest';
};

export type SearchPageResponse<T> = {
  data: T[];
  pagination: Pagination;
};

// --- MIME types ---

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.html': 'text/html',
};

function inferMimeType(filename: string): string {
  const extIndex = filename.lastIndexOf('.');
  const ext = extIndex === -1 ? '' : filename.slice(extIndex).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

function normalizeFilename(filename: string): string {
  const normalized = filename.replaceAll('\\', '/');
  const lastSeparator = normalized.lastIndexOf('/');
  return lastSeparator === -1 ? normalized : normalized.slice(lastSeparator + 1);
}

function assertPositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
}

function assertEvmAddress(value: string, fieldName: string): void {
  if (!isAddress(value)) {
    throw new Error(`${fieldName} must be a valid EVM address`);
  }
}

function parseDimensions(dimensions: string | undefined): { width: number; height: number } | undefined {
  if (!dimensions) return undefined;
  const [w, h] = dimensions.split('x');
  if (!w || !h) return undefined;
  const width = Number.parseInt(w, 10);
  const height = Number.parseInt(h, 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }
  return { width, height };
}

// --- Multipart upload (uses presigned URLs directly, not via openapi-fetch) ---

type MultipartUploadPart = {
  ETag: string;
  PartNumber: number;
};

async function uploadParts(
  fileBuffer: Uint8Array,
  partSize: number,
  presignedUrls: string[],
): Promise<MultipartUploadPart[]> {
  const parts: MultipartUploadPart[] = [];

  for (let i = 0; i < presignedUrls.length; i++) {
    const start = i * partSize;
    const end = start + partSize;
    const partBuffer = fileBuffer.subarray(start, end);

    const response = await fetch(presignedUrls[i], {
      method: 'PUT',
      body: new Uint8Array(partBuffer),
    });

    if (response.status !== 200 && response.status !== 204) {
      throw new Error(`Part ${i + 1} upload failed with status ${response.status}`);
    }

    const etag = response.headers.get('etag');
    if (!etag) {
      throw new Error(`Missing etag header for part ${i + 1}`);
    }

    parts.push({ ETag: etag, PartNumber: i + 1 });
  }

  return parts;
}

// --- Public API functions ---

export async function uploadMedia(buffer: Uint8Array, filename: string): Promise<NftMediaEntry> {
  const client = getClient();
  const fileSize = buffer.byteLength;
  const safeFilename = normalizeFilename(filename);
  const mimeType = inferMimeType(safeFilename);

  const { data: init } = await client.POST('/v1/nfts/metadata/media/uploads', {
    body: { fileSize, filename: safeFilename },
  });
  if (!init) throw new Error('Failed to initiate media upload');

  const parts = await uploadParts(buffer, init.partSize, init.presignedUrls);

  const { data: complete } = await client.POST('/v1/nfts/metadata/media/uploads/complete', {
    body: {
      key: init.key,
      uploadId: init.uploadId,
      bucket: init.bucket,
      parts,
    },
  });
  if (!complete) throw new Error('Failed to complete media upload');

  const { data: generated } = await client.POST('/v1/nfts/metadata/media/generate', {
    body: { uri: complete.ipfsUrl, mimeType },
  });
  if (!generated) throw new Error('Failed to generate media metadata');

  const dimensions = parseDimensions(generated.media.dimensions);
  return {
    url: generated.media.uri,
    mimeType: generated.media.mimeType,
    size: generated.media.size ?? fileSize,
    ...(dimensions ? { dimensions } : {}),
  };
}

export async function pinMetadata(opts: PinMetadataParams): Promise<string> {
  const client = getClient();

  const nftMedia: Record<string, NftMediaEntry> = { image: opts.image };
  if (opts.video) {
    nftMedia.video = opts.video;
  }

  const { data: result } = await client.POST('/v1/nfts/metadata', {
    body: {
      name: opts.name,
      description: opts.description,
      nftMedia: nftMedia as any,
      tags: opts.tags ?? [],
      ...(opts.attributes?.length ? { attributes: opts.attributes as any } : {}),
    },
  });
  if (!result) throw new Error('Failed to pin metadata');

  return result.ipfsUrl;
}

export async function importErc721(opts: ImportErc721RequestParams): Promise<void> {
  assertPositiveInteger(opts.chainId, 'chainId');
  assertEvmAddress(opts.contract, 'contract');
  assertEvmAddress(opts.owner, 'owner');

  const client = getClient();
  await client.POST('/v1/collections/import', {
    body: {
      chainId: opts.chainId,
      contractAddress: opts.contract.toLowerCase(),
      ownerAddress: opts.owner.toLowerCase(),
    },
  });
}

export async function searchNfts(params: NftSearchParams = {}): Promise<SearchPageResponse<Nft>> {
  const client = getClient();

  const { data } = await client.GET('/v1/nfts', {
    params: {
      query: {
        q: params.query,
        page: params.page ?? 1,
        perPage: params.perPage ?? 24,
        sortBy: params.sortBy ?? 'recentActivity',
        ownerAddress: params.ownerAddress,
        creatorAddress: params.creatorAddress,
        contractAddress: params.contractAddress as any,
        collectionId: params.collectionId,
        chainId: params.chainId,
        hasAuction: params.hasAuction,
        auctionState: params.auctionState,
        hasListing: params.hasListing,
        hasOffer: params.hasOffer,
        tags: params.tags,
        mediaType: params.mediaType,
      },
    },
  });
  if (!data) throw new Error('Failed to search NFTs');

  return data;
}

export async function searchCollections(params: CollectionSearchParams = {}): Promise<SearchPageResponse<Collection>> {
  const client = getClient();

  const { data } = await client.GET('/v1/collections', {
    params: {
      query: {
        q: params.query,
        page: params.page ?? 1,
        perPage: params.perPage ?? 24,
        sortBy: params.sortBy ?? 'newest',
      },
    },
  });
  if (!data) throw new Error('Failed to search collections');

  return data;
}

export async function getNft(universalTokenId: string): Promise<Nft> {
  const client = getClient();

  const { data } = await client.GET('/v1/nfts/{universalTokenId}', {
    params: { path: { universalTokenId } },
  });
  if (!data) throw new Error(`NFT not found: ${universalTokenId}`);

  return data.data;
}

export async function getNftEvents(
  universalTokenId: string,
  opts?: { page?: number; perPage?: number; eventType?: string | string[]; sortBy?: 'newest' | 'oldest' },
): Promise<SearchPageResponse<NftEvent>> {
  const client = getClient();

  const { data } = await client.GET('/v1/nfts/{universalTokenId}/events', {
    params: {
      path: { universalTokenId },
      query: {
        page: opts?.page,
        perPage: opts?.perPage,
        eventType: opts?.eventType as any,
        sortBy: opts?.sortBy,
      },
    },
  });
  if (!data) throw new Error(`Failed to get events for NFT: ${universalTokenId}`);

  return data;
}

export async function getCollection(id: string): Promise<Collection> {
  const client = getClient();

  const { data } = await client.GET('/v1/collections/{id}', {
    params: { path: { id } },
  });
  if (!data) throw new Error(`Collection not found: ${id}`);

  return data.data;
}

export async function getCollectionEvents(
  id: string,
  opts?: { page?: number; perPage?: number; eventType?: string | string[]; sortBy?: 'newest' | 'oldest' },
): Promise<SearchPageResponse<NftEvent>> {
  const client = getClient();

  const { data } = await client.GET('/v1/collections/{id}/events', {
    params: {
      path: { id },
      query: {
        page: opts?.page,
        perPage: opts?.perPage,
        eventType: opts?.eventType as any,
        sortBy: opts?.sortBy,
      },
    },
  });
  if (!data) throw new Error(`Failed to get events for collection: ${id}`);

  return data;
}

export async function getUser(address: string): Promise<UserProfile> {
  const client = getClient();

  const { data } = await client.GET('/v1/users/{address}', {
    params: { path: { address } },
  });
  if (!data) throw new Error(`User not found: ${address}`);

  return data.data;
}

export async function getTokenPrice(symbol: string): Promise<{ symbol: string; priceUsd: number; decimals: number; chainId: number; address: string }> {
  const client = getClient();

  const { data } = await client.GET('/v1/tokens/price/{symbol}', {
    params: { path: { symbol } },
  });
  if (!data) throw new Error(`Token price not found: ${symbol}`);

  return data.data;
}
