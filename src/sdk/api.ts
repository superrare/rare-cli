import { createApiClient } from '../data-access/index.js';
import type { components, paths } from '../data-access/schema.js';
import {
  buildCollectionSearchQuery,
  buildGeneratedMediaEntry,
  buildImportErc721Body,
  buildMediaUploadPlan,
  buildNftSearchQuery,
  buildPinMetadataBody,
  type CollectionSearchParams,
  type ImportErc721Params,
  type ImportErc721RequestParams,
  type MultipartUploadPart,
  type NftAttribute,
  type NftMediaEntry,
  type NftSearchParams,
  type PinMetadataParams,
} from './api-core.js';

const client = createApiClient();

// --- Re-exported types from OpenAPI schema ---

export type Nft = components['schemas']['Nft'];
export type Collection = components['schemas']['Collection'];
export type NftEvent = components['schemas']['NftEvent'];
export type UserProfile = components['schemas']['UserProfile'];
export type Pagination = components['schemas']['Pagination'];
export type {
  CollectionSearchParams,
  ImportErc721Params,
  NftAttribute,
  NftMediaEntry,
  NftSearchParams,
  PinMetadataParams,
};

export type SearchPageResponse<T> = {
  data: T[];
  pagination: Pagination;
};

type NftEventQuery = NonNullable<paths['/v1/nfts/{universalTokenId}/events']['get']['parameters']['query']>;
type CollectionEventQuery = NonNullable<paths['/v1/collections/{id}/events']['get']['parameters']['query']>;
type EventType = NonNullable<NftEventQuery['eventType']>;
export type NftEventOptions = { page?: number; perPage?: number; eventType?: EventType; sortBy?: NftEventQuery['sortBy'] };
export type CollectionEventOptions = { page?: number; perPage?: number; eventType?: CollectionEventQuery['eventType']; sortBy?: CollectionEventQuery['sortBy'] };

// --- Multipart upload (uses presigned URLs directly, not via openapi-fetch) ---

async function uploadParts(
  fileBuffer: Uint8Array,
  partSize: number,
  presignedUrls: string[],
): Promise<MultipartUploadPart[]> {
  return Promise.all(presignedUrls.map(async (presignedUrl, index): Promise<MultipartUploadPart> => {
    const start = index * partSize;
    const end = start + partSize;
    const partBuffer = fileBuffer.subarray(start, end);

    const response = await fetch(presignedUrl, {
      method: 'PUT',
      body: new Uint8Array(partBuffer),
    });

    if (response.status !== 200 && response.status !== 204) {
      throw new Error(`Part ${index + 1} upload failed with status ${response.status}`);
    }

    const etag = response.headers.get('etag');
    if (!etag) {
      throw new Error(`Missing etag header for part ${index + 1}`);
    }

    return { ETag: etag, PartNumber: index + 1 };
  }));
}

// --- Public API functions ---

export async function uploadMedia(buffer: Uint8Array, filename: string): Promise<NftMediaEntry> {
  const upload = buildMediaUploadPlan(buffer, filename);

  const { data: init } = await client.POST('/v1/nfts/metadata/media/uploads', {
    body: { fileSize: upload.fileSize, filename: upload.filename },
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
    body: { uri: complete.ipfsUrl, mimeType: upload.mimeType },
  });
  if (!generated) throw new Error('Failed to generate media metadata');

  return buildGeneratedMediaEntry(generated.media, upload.fileSize);
}

export async function pinMetadata(opts: PinMetadataParams): Promise<string> {
  const { data: result } = await client.POST('/v1/nfts/metadata', {
    body: buildPinMetadataBody(opts),
  });
  if (!result) throw new Error('Failed to pin metadata');

  return result.ipfsUrl;
}

export async function importErc721(opts: ImportErc721RequestParams): Promise<void> {
  await client.POST('/v1/collections/import', {
    body: buildImportErc721Body(opts),
  });
}

export async function searchNfts(params: NftSearchParams = {}): Promise<SearchPageResponse<Nft>> {
  const { data } = await client.GET('/v1/nfts', {
    params: {
      query: buildNftSearchQuery(params),
    },
  });
  if (!data) throw new Error('Failed to search NFTs');

  return data;
}

export async function searchCollections(params: CollectionSearchParams = {}): Promise<SearchPageResponse<Collection>> {
  const { data } = await client.GET('/v1/collections', {
    params: {
      query: buildCollectionSearchQuery(params),
    },
  });
  if (!data) throw new Error('Failed to search collections');

  return data;
}

export async function getNft(universalTokenId: string): Promise<Nft> {
  const { data } = await client.GET('/v1/nfts/{universalTokenId}', {
    params: { path: { universalTokenId } },
  });
  if (!data) throw new Error(`NFT not found: ${universalTokenId}`);

  return data.data;
}

export async function getNftEvents(
  universalTokenId: string,
  opts?: NftEventOptions,
): Promise<SearchPageResponse<NftEvent>> {
  const { data } = await client.GET('/v1/nfts/{universalTokenId}/events', {
    params: {
      path: { universalTokenId },
      query: {
        page: opts?.page,
        perPage: opts?.perPage,
        eventType: opts?.eventType,
        sortBy: opts?.sortBy,
      },
    },
  });
  if (!data) throw new Error(`Failed to get events for NFT: ${universalTokenId}`);

  return data;
}

export async function getCollection(id: string): Promise<Collection> {
  const { data } = await client.GET('/v1/collections/{id}', {
    params: { path: { id } },
  });
  if (!data) throw new Error(`Collection not found: ${id}`);

  return data.data;
}

export async function getCollectionEvents(
  id: string,
  opts?: CollectionEventOptions,
): Promise<SearchPageResponse<NftEvent>> {
  const { data } = await client.GET('/v1/collections/{id}/events', {
    params: {
      path: { id },
      query: {
        page: opts?.page,
        perPage: opts?.perPage,
        eventType: opts?.eventType,
        sortBy: opts?.sortBy,
      },
    },
  });
  if (!data) throw new Error(`Failed to get events for collection: ${id}`);

  return data;
}

export async function getUser(address: string): Promise<UserProfile> {
  const { data } = await client.GET('/v1/users/{address}', {
    params: { path: { address } },
  });
  if (!data) throw new Error(`User not found: ${address}`);

  return data.data;
}

export async function getTokenPrice(symbol: string): Promise<{ symbol: string; priceUsd: number; decimals: number; chainId: number; address: string }> {
  const { data } = await client.GET('/v1/tokens/price/{symbol}', {
    params: { path: { symbol } },
  });
  if (!data) throw new Error(`Token price not found: ${symbol}`);

  return data.data;
}
