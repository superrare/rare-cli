import { isAddress, type Address } from 'viem';

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

export type ImportErc721RequestParams = {
  chainId: number;
  contract: Address;
  owner: Address;
};

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

export type MultipartUploadPart = {
  ETag: string;
  PartNumber: number;
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
  if (!w || !h) return undefined;
  const width = Number.parseInt(w, 10);
  const height = Number.parseInt(h, 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }
  return { width, height };
}

export function buildMediaUploadPlan(fileBuffer: Uint8Array, filename: string): MediaUploadPlan {
  const safeFilename = normalizeFilename(filename);
  return {
    fileSize: fileBuffer.byteLength,
    filename: safeFilename,
    mimeType: inferMimeType(safeFilename),
  };
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
  nftMedia: Record<string, NftMediaEntry>;
  tags: string[];
  attributes?: NftAttribute[];
} {
  const nftMedia: Record<string, NftMediaEntry> = { image: opts.image };
  if (opts.video) {
    nftMedia.video = opts.video;
  }

  return {
    name: opts.name,
    description: opts.description,
    nftMedia,
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
    contractAddress: opts.contract.toLowerCase(),
    ownerAddress: opts.owner.toLowerCase(),
  };
}

export function buildNftSearchQuery(params: NftSearchParams = {}) {
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
    hasAuction: params.hasAuction,
    auctionState: params.auctionState,
    hasListing: params.hasListing,
    hasOffer: params.hasOffer,
    tags: params.tags,
    mediaType: params.mediaType,
  };
}

export function buildCollectionSearchQuery(params: CollectionSearchParams = {}) {
  return {
    q: params.query,
    page: params.page ?? 1,
    perPage: params.perPage ?? 24,
    sortBy: params.sortBy ?? 'newest',
  };
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
