import { isAddress, type Address } from 'viem';
import type { CollectionSearchParams, NftSearchParams, SearchPageResponse } from '../search.js';

const API_BASE_URL = 'https://api.superrare.org';

type MediaUploadUrlResponse = {
  uploadId: string;
  key: string;
  bucket: string;
  partSize: number;
  presignedUrls: string[];
  gatewayBaseUrl: string;
};

type MultipartUploadPart = {
  ETag: string;
  PartNumber: number;
};

type MediaUploadCompleteResponse = {
  cid: string;
  ipfsUrl: string;
  gatewayUrl: string;
};

type MediaGenerateResponse = {
  media: {
    uri: string;
    mimeType: string;
    size?: number;
    dimensions?: string;
  };
};

type MetadataResponse = {
  ipfsUrl: string;
  gatewayUrl: string;
  metadata: Record<string, unknown>;
};

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

async function apiPost<T>(path: string, payload: Record<string, unknown>): Promise<T> {
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
    throw new Error(`API error ${response.status} on ${path}: ${String(message)}`);
  }

  return json as T;
}

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

export async function uploadMedia(buffer: Uint8Array, filename: string): Promise<NftMediaEntry> {
  const fileSize = buffer.byteLength;
  const safeFilename = normalizeFilename(filename);
  const mimeType = inferMimeType(safeFilename);

  const init = await apiPost<MediaUploadUrlResponse>('/api/nft/media-upload-url', {
    fileSize,
    filename: safeFilename,
  });

  const parts = await uploadParts(buffer, init.partSize, init.presignedUrls);
  const complete = await apiPost<MediaUploadCompleteResponse>('/api/nft/media-upload-complete', {
    key: init.key,
    uploadId: init.uploadId,
    bucket: init.bucket,
    parts,
  });

  const generated = await apiPost<MediaGenerateResponse>('/api/nft/media-generate', {
    uri: complete.ipfsUrl,
    mimeType,
  });

  const dimensions = parseDimensions(generated.media.dimensions);
  return {
    url: generated.media.uri,
    mimeType: generated.media.mimeType,
    size: generated.media.size ?? fileSize,
    ...(dimensions ? { dimensions } : {}),
  };
}

export async function pinMetadata(opts: PinMetadataParams): Promise<string> {
  const nftMedia: Record<string, NftMediaEntry> = {
    image: opts.image,
  };
  if (opts.video) {
    nftMedia.video = opts.video;
  }

  const payload: Record<string, unknown> = {
    name: opts.name,
    description: opts.description,
    nftMedia,
    tags: opts.tags ?? [],
  };
  if (opts.attributes && opts.attributes.length > 0) {
    payload.attributes = opts.attributes;
  }

  const result = await apiPost<MetadataResponse>('/api/nft/metadata', payload);
  return result.ipfsUrl;
}

export async function importErc721(opts: ImportErc721RequestParams): Promise<void> {
  assertPositiveInteger(opts.chainId, 'chainId');
  assertEvmAddress(opts.contract, 'contract');
  assertEvmAddress(opts.owner, 'owner');

  const result = await apiPost<{ ok: boolean }>('/api/nft/import-erc721', {
    chainId: opts.chainId,
    contractAddress: opts.contract.toLowerCase(),
    ownerAddress: opts.owner.toLowerCase(),
  });

  if (result.ok !== true) {
    throw new Error('Unexpected response from /api/nft/import-erc721');
  }
}

async function searchPost(path: string, payload: Record<string, unknown>): Promise<SearchPageResponse> {
  return apiPost<SearchPageResponse>(path, payload);
}

export async function searchNfts(params: NftSearchParams = {}): Promise<SearchPageResponse> {
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

export async function searchCollections(params: CollectionSearchParams = {}): Promise<SearchPageResponse> {
  return searchPost('/api/search/collections', {
    query: params.query ?? '',
    take: params.take ?? 24,
    cursor: params.cursor ?? 0,
    sortBy: params.sortBy ?? 'NEWEST',
    ownerAddresses: params.ownerAddresses ?? [],
  });
}

export type { CollectionSearchParams, NftSearchParams, SearchPageResponse } from '../search.js';
