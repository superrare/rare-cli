import { isAddress, type Address } from 'viem';
import type { paths } from '../data-access/schema.js';

type NftListQuery = NonNullable<paths['/v1/nfts']['get']['parameters']['query']>;
type CollectionListQuery = NonNullable<paths['/v1/collections']['get']['parameters']['query']>;

export type NftMediaEntry = {
  url: string;
  mimeType: string;
  size: number;
  dimensions?: { width: number; height: number };
};

export type NftAttribute = {
  trait_type: string;
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

export type ImportErc721RequestParams = {
  chainId: number;
  contract: Address;
  owner: Address;
};

export type NftSearchParams = {
  query?: string;
  page?: number;
  perPage?: number;
  sortBy?: NftListQuery['sortBy'];
  ownerAddress?: string;
  creatorAddress?: string;
  contractAddress?: string;
  collectionId?: string;
  chainId?: number;
  listingType?: NftListQuery['listingType'];
  hasAuction?: boolean;
  auctionState?: NftListQuery['auctionState'];
  auctionCreatorAddress?: string;
  auctionBidderAddress?: string;
  hasListing?: boolean;
  hasOffer?: boolean;
  offerBuyerAddress?: string;
  tags?: string[];
  mediaType?: NftListQuery['mediaType'];
};

export type CollectionSearchParams = {
  query?: string;
  page?: number;
  perPage?: number;
  sortBy?: CollectionListQuery['sortBy'];
  ownerAddress?: string;
  chainId?: number;
};

export type MultipartUploadPart = {
  ETag: string;
  PartNumber: number;
};

export type IpfsUploadPlan = {
  fileSize: number;
  filename: string;
};

export type IpfsJsonUploadPayload = {
  buffer: Uint8Array;
  filename: string;
};

export type MediaUploadPlan = {
  fileSize: number;
  filename: string;
  mimeType: string;
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

export function inferMimeType(filename: string): string {
  const extIndex = filename.lastIndexOf('.');
  const ext = extIndex === -1 ? '' : filename.slice(extIndex).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

export function normalizeFilename(filename: string): string {
  const normalized = filename.replaceAll('\\', '/');
  const lastSeparator = normalized.lastIndexOf('/');
  return lastSeparator === -1 ? normalized : normalized.slice(lastSeparator + 1);
}

export function parseDimensions(dimensions: string | undefined): { width: number; height: number } | undefined {
  if (!dimensions) return undefined;
  const [w, h] = dimensions.split('x');
  if (w === undefined || h === undefined || w.length === 0 || h.length === 0) return undefined;
  const width = Number.parseInt(w, 10);
  const height = Number.parseInt(h, 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }
  return { width, height };
}

export function buildMediaUploadPlan(fileBuffer: Uint8Array, filename: string): MediaUploadPlan {
  const upload = buildIpfsUploadPlan(fileBuffer, filename);
  return {
    ...upload,
    mimeType: inferMimeType(upload.filename),
  };
}

export function buildIpfsUploadPlan(fileBuffer: Uint8Array, filename: string): IpfsUploadPlan {
  const safeFilename = normalizeFilename(filename);
  assertValidIpfsUpload(fileBuffer.byteLength, safeFilename);
  return {
    fileSize: fileBuffer.byteLength,
    filename: safeFilename,
  };
}

export function buildIpfsJsonUploadPayload(value: unknown, filename = 'metadata.json'): IpfsJsonUploadPayload {
  const body = stringifyJson(value);
  if (body === undefined) {
    throw new Error('IPFS JSON upload value must be JSON-serializable.');
  }

  return {
    buffer: new TextEncoder().encode(body),
    filename,
  };
}

function stringifyJson(value: unknown): string | undefined {
  return JSON.stringify(value);
}

export function buildGeneratedMediaEntry(
  media: { uri: string; mimeType: string; size?: number; dimensions?: string },
  fallbackSize: number,
): NftMediaEntry {
  const dimensions = parseDimensions(media.dimensions);
  return {
    url: media.uri,
    mimeType: media.mimeType,
    size: media.size ?? fallbackSize,
    ...(dimensions ? { dimensions } : {}),
  };
}

export function buildPinMetadataBody(opts: PinMetadataParams): {
  name: string;
  description: string;
  nftMedia: { image: NftMediaEntry; video?: NftMediaEntry };
  tags: string[];
  attributes?: NftAttribute[];
} {
  return {
    name: opts.name,
    description: opts.description,
    nftMedia: {
      image: opts.image,
      ...(opts.video ? { video: opts.video } : {}),
    },
    tags: opts.tags ?? [],
    ...(opts.attributes?.length ? { attributes: opts.attributes } : {}),
  };
}

export function buildImportErc721Body(opts: ImportErc721RequestParams): {
  chainId: number;
  contractAddress: string;
  ownerAddress: string;
} {
  assertPositiveInteger(opts.chainId, 'chainId');
  assertEvmAddress(opts.contract, 'contract');
  assertEvmAddress(opts.owner, 'owner');

  return {
    chainId: opts.chainId,
    contractAddress: String(opts.contract).toLowerCase(),
    ownerAddress: String(opts.owner).toLowerCase(),
  };
}

export function buildNftSearchQuery(params: NftSearchParams = {}): {
  q?: string;
  page: number;
  perPage: number;
  sortBy: NonNullable<NftSearchParams['sortBy']>;
  ownerAddress?: string;
  creatorAddress?: string;
  contractAddress?: string;
  collectionId?: string;
  chainId?: number;
  listingType?: NftSearchParams['listingType'];
  hasAuction?: boolean;
  auctionState?: NftSearchParams['auctionState'];
  auctionCreatorAddress?: string;
  auctionBidderAddress?: string;
  hasListing?: boolean;
  hasOffer?: boolean;
  offerBuyerAddress?: string;
  tags?: string[];
  mediaType?: NftSearchParams['mediaType'];
} {
  const hasAuction = params.hasAuction ??
    (params.auctionState !== undefined ||
      params.auctionCreatorAddress !== undefined ||
      params.auctionBidderAddress !== undefined ||
      undefined);
  const hasListing = params.hasListing ?? (params.listingType !== undefined || undefined);
  const hasOffer = params.hasOffer ?? (params.offerBuyerAddress !== undefined || undefined);

  return {
    q: params.query,
    page: params.page ?? 1,
    perPage: params.perPage ?? 24,
    sortBy: params.sortBy ?? 'recentActivity',
    ownerAddress: params.ownerAddress,
    creatorAddress: params.creatorAddress,
    contractAddress: params.contractAddress,
    collectionId: params.collectionId,
    chainId: params.chainId,
    listingType: params.listingType,
    hasAuction,
    auctionState: params.auctionState,
    auctionCreatorAddress: params.auctionCreatorAddress,
    auctionBidderAddress: params.auctionBidderAddress,
    hasListing,
    hasOffer,
    offerBuyerAddress: params.offerBuyerAddress,
    tags: params.tags,
    mediaType: params.mediaType,
  };
}

export function buildCollectionSearchQuery(params: CollectionSearchParams = {}): {
  q?: string;
  page: number;
  perPage: number;
  sortBy: NonNullable<CollectionSearchParams['sortBy']>;
  ownerAddress?: string;
  chainId?: number;
} {
  return {
    q: params.query,
    page: params.page ?? 1,
    perPage: params.perPage ?? 24,
    sortBy: params.sortBy ?? 'newest',
    ownerAddress: params.ownerAddress,
    chainId: params.chainId,
  };
}

function assertPositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
}

function assertValidIpfsUpload(fileSize: number, filename: string): void {
  if (filename.length === 0) {
    throw new Error('IPFS upload filename must not be empty.');
  }
  if (fileSize <= 0) {
    throw new Error('IPFS upload file must not be empty.');
  }
}

function assertEvmAddress(value: string, fieldName: string): void {
  if (!isAddress(value)) {
    throw new Error(`${fieldName} must be a valid EVM address`);
  }
}
