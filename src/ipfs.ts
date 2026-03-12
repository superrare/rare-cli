import { basename, extname } from 'node:path';
import { readFile, stat } from 'node:fs/promises';

const API_BASE_URL = 'https://api.superrare.org';

// --- Types ---

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

type NftMediaEntry = {
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

// --- Helpers ---

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
  const ext = extname(filename).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

function parseDimensions(dimensions: string | undefined): { width: number; height: number } | undefined {
  if (!dimensions) return undefined;
  const [w, h] = dimensions.split('x');
  if (!w || !h) return undefined;
  const width = parseInt(w, 10);
  const height = parseInt(h, 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
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
    throw new Error(`API error ${response.status} on ${path}: ${message}`);
  }

  return json as T;
}

// --- Upload flow ---

async function uploadParts(
  fileBuffer: Buffer,
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

/**
 * Uploads a local file to IPFS via the SuperRare media API and generates media metadata.
 */
export async function uploadMedia(filePath: string, label: string): Promise<NftMediaEntry> {
  const fileStats = await stat(filePath);
  const fileSize = fileStats.size;
  const fileName = basename(filePath);
  const fileBuffer = await readFile(filePath);
  const mimeType = inferMimeType(fileName);

  console.log(`Uploading ${label}: ${fileName} (${fileSize} bytes, ${mimeType})`);

  // 1. Init multipart upload
  const init = await apiPost<MediaUploadUrlResponse>('/api/nft/media-upload-url', {
    fileSize,
    filename: fileName,
  });

  console.log(`  Multipart upload initialized (${init.presignedUrls.length} parts)`);

  // 2. Upload parts
  const parts = await uploadParts(fileBuffer, init.partSize, init.presignedUrls);

  console.log(`  All parts uploaded`);

  // 3. Complete upload
  const complete = await apiPost<MediaUploadCompleteResponse>('/api/nft/media-upload-complete', {
    key: init.key,
    uploadId: init.uploadId,
    bucket: init.bucket,
    parts,
  });

  console.log(`  Upload complete: ${complete.ipfsUrl}`);

  // 4. Generate media metadata
  const generated = await apiPost<MediaGenerateResponse>('/api/nft/media-generate', {
    uri: complete.ipfsUrl,
    mimeType,
  });

  const dimensions = parseDimensions(generated.media.dimensions);

  const entry: NftMediaEntry = {
    url: generated.media.uri,
    mimeType: generated.media.mimeType,
    size: generated.media.size ?? fileSize,
    ...(dimensions ? { dimensions } : {}),
  };

  console.log(`  Media generated: ${entry.url}`);
  return entry;
}

/**
 * Pins NFT metadata to IPFS and returns the metadata URI.
 */
export async function pinMetadata(opts: {
  name: string;
  description: string;
  image: NftMediaEntry;
  video?: NftMediaEntry;
  tags?: string[];
  attributes?: NftAttribute[];
}): Promise<string> {
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
  };
  if (opts.tags && opts.tags.length > 0) {
    payload.tags = opts.tags;
  }
  if (opts.attributes && opts.attributes.length > 0) {
    payload.attributes = opts.attributes;
  }

  console.log('Pinning metadata to IPFS...');

  const result = await apiPost<MetadataResponse>('/api/nft/metadata', payload);

  console.log(`Metadata pinned: ${result.ipfsUrl}`);
  console.log(`Gateway URL: ${result.gatewayUrl}`);

  return result.ipfsUrl;
}
