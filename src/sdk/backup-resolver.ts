import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import type { Address, PublicClient } from 'viem';
import { isAddress } from 'viem';
import { tokenAbi } from '../contracts/abis/token.js';
import { chainIds, supportedChainFromChainId, type SupportedChain } from '../contracts/addresses.js';
import {
  DEFAULT_PRESERVATION_GATEWAY_URL,
  DEFAULT_PRESERVATION_MAX_BYTES,
  type PreservationAssetDescriptor,
  type TokenPreservationSource,
} from './backup-service.js';

const TEXT_DECODER = new TextDecoder();

const EXTENSION_MIME_TYPES: Record<string, string> = {
  '.json': 'application/json',
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
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

const CID_V0_REGEX = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
const CID_V1_REGEX =
  /^(b[A-Za-z2-7]{58,}|B[A-Z2-7]{58,}|z[1-9A-HJ-NP-Za-km-z]{48,}|F[0-9A-F]{50,})$/;

type MetadataCandidate = {
  role: string;
  uri: string;
};

type ResolvedUri = {
  originalUri: string;
  normalizedUri: string;
  fetchUrl: string | null;
};

type DownloadedAsset = {
  originalUri: string;
  normalizedUri: string;
  fetchUrl: string | null;
  bytes: Uint8Array;
  mimeType: string;
};

export interface ResolveTokenPreservationParams {
  publicClient: PublicClient;
  chain: SupportedChain;
  contract?: Address;
  tokenId?: bigint | number | string;
  universalTokenId?: string;
  gatewayUrl?: string;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
}

export interface StagedPreservationAsset extends PreservationAssetDescriptor {
  bytes: Uint8Array;
}

export interface ResolvedTokenPreservation {
  source: TokenPreservationSource;
  metadata: unknown;
  metadataText: string;
  assets: StagedPreservationAsset[];
  billableBytes: number;
}

export interface ParsedUniversalTokenId {
  chain: SupportedChain;
  contract: Address;
  tokenId: bigint;
  universalTokenId: string;
}

export function parseUniversalTokenId(value: string): ParsedUniversalTokenId {
  const match = /^(\d+)-(0x[a-fA-F0-9]{40})-(\d+)$/.exec(value.trim());
  if (!match) {
    throw new Error(
      'universalTokenId must use the format "<chainId>-<contractAddress>-<tokenId>", e.g. "1-0xabc...-123".'
    );
  }

  const chainId = Number.parseInt(match[1], 10);
  const chain = supportedChainFromChainId(chainId);
  if (!chain) {
    throw new Error(`Unsupported chain id in universalTokenId: ${chainId}`);
  }

  return {
    chain,
    contract: match[2] as Address,
    tokenId: BigInt(match[3]),
    universalTokenId: `${chainId}-${match[2].toLowerCase()}-${match[3]}`,
  };
}

export async function resolveTokenPreservation(
  params: ResolveTokenPreservationParams,
): Promise<ResolvedTokenPreservation> {
  const gatewayUrl = normalizeGatewayUrl(params.gatewayUrl ?? DEFAULT_PRESERVATION_GATEWAY_URL);
  const maxBytes = params.maxBytes ?? DEFAULT_PRESERVATION_MAX_BYTES;
  const fetchImpl = params.fetchImpl ?? fetch;

  const source = await resolveSource(params);
  const metadataDownload = await downloadAsset({
    role: 'metadata',
    uri: source.tokenUri,
    gatewayUrl,
    fetchImpl,
  });

  const metadataText = TEXT_DECODER.decode(metadataDownload.bytes);
  let metadata: unknown;
  try {
    metadata = JSON.parse(metadataText);
  } catch (error) {
    throw new Error(
      `Token metadata at "${source.tokenUri}" is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const stagedAssets: StagedPreservationAsset[] = [
    toStagedAsset({
      assetId: 'asset_0000',
      role: 'metadata',
      originalUri: metadataDownload.originalUri,
      bytes: metadataDownload.bytes,
      mimeType: metadataDownload.mimeType || 'application/json',
    }),
  ];

  let totalBytes = stagedAssets[0].size;
  assertWithinByteCap(totalBytes, maxBytes);

  const metadataBaseUri = metadataDownload.normalizedUri;
  const candidates = collectMetadataCandidates(metadata);
  const seenUris = new Set<string>();
  let assetIndex = 1;

  for (const candidate of candidates) {
    const resolvedUri = resolveUri(candidate.uri, gatewayUrl, metadataBaseUri);
    if (seenUris.has(resolvedUri.normalizedUri)) {
      continue;
    }
    seenUris.add(resolvedUri.normalizedUri);

    const downloaded = await downloadAsset({
      role: candidate.role,
      uri: resolvedUri.originalUri,
      gatewayUrl,
      fetchImpl,
      metadataBaseUri,
    });

    const staged = toStagedAsset({
      assetId: `asset_${String(assetIndex).padStart(4, '0')}`,
      role: candidate.role,
      originalUri: downloaded.originalUri,
      bytes: downloaded.bytes,
      mimeType: downloaded.mimeType,
    });

    stagedAssets.push(staged);
    totalBytes += staged.size;
    assertWithinByteCap(totalBytes, maxBytes);
    assetIndex += 1;
  }

  return {
    source,
    metadata,
    metadataText,
    assets: stagedAssets,
    billableBytes: totalBytes,
  };
}

async function resolveSource(
  params: ResolveTokenPreservationParams,
): Promise<TokenPreservationSource> {
  let chain = params.chain;
  let contract = params.contract;
  let tokenId = toBigInt(params.tokenId, 'tokenId');

  if (params.universalTokenId) {
    const parsed = parseUniversalTokenId(params.universalTokenId);
    chain = parsed.chain;
    contract = parsed.contract;
    tokenId = parsed.tokenId;
  }

  if (!contract || !isAddress(contract)) {
    throw new Error('contract must be a valid EVM address');
  }
  if (tokenId === undefined) {
    throw new Error('tokenId is required');
  }

  const tokenUri = await params.publicClient.readContract({
    address: contract,
    abi: tokenAbi,
    functionName: 'tokenURI',
    args: [tokenId],
  });

  return {
    chain,
    chainId: chainIds[chain],
    contractAddress: contract,
    tokenId: tokenId.toString(),
    universalTokenId: `${chainIds[chain]}-${contract.toLowerCase()}-${tokenId.toString()}`,
    tokenUri,
  };
}

function collectMetadataCandidates(metadata: unknown): MetadataCandidate[] {
  if (!metadata || typeof metadata !== 'object') {
    return [];
  }

  const root = metadata as Record<string, unknown>;
  const candidates: MetadataCandidate[] = [];

  pushStringCandidate(candidates, 'image', root.image);
  pushStringCandidate(candidates, 'image_url', root.image_url);
  pushStringCandidate(candidates, 'animation_url', root.animation_url);
  pushStringCandidate(candidates, 'video', root.video);
  pushStringCandidate(candidates, 'audio', root.audio);
  pushStringCandidate(candidates, 'model', root.model);
  pushStringCandidate(candidates, 'background_image', root.background_image);

  const media = root.media;
  if (media && typeof media === 'object') {
    const mediaRecord = media as Record<string, unknown>;
    pushStringCandidate(candidates, 'media.uri', mediaRecord.uri);
    pushStringCandidate(candidates, 'media.url', mediaRecord.url);
  }

  const properties = root.properties;
  if (properties && typeof properties === 'object') {
    const propertiesRecord = properties as Record<string, unknown>;
    pushStringCandidate(candidates, 'properties.image', propertiesRecord.image);
    pushStringCandidate(candidates, 'properties.video', propertiesRecord.video);
    pushStringCandidate(candidates, 'properties.audio', propertiesRecord.audio);
    pushStringCandidate(candidates, 'properties.model', propertiesRecord.model);

    const files = propertiesRecord.files;
    if (Array.isArray(files)) {
      for (const file of files) {
        if (!file || typeof file !== 'object') continue;
        const record = file as Record<string, unknown>;
        pushStringCandidate(candidates, 'properties.files', record.uri);
        pushStringCandidate(candidates, 'properties.files', record.url);
      }
    }
  }

  collectNestedAbsoluteIpfsCandidates(metadata, null, candidates);

  return candidates;
}

function collectNestedAbsoluteIpfsCandidates(
  value: unknown,
  role: string | null,
  target: MetadataCandidate[],
): void {
  if (typeof value === 'string') {
    if (!role) return;
    pushAbsoluteIpfsCandidate(target, role, value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectNestedAbsoluteIpfsCandidates(entry, role ? `${role}[${index}]` : `[${index}]`, target);
    });
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    collectNestedAbsoluteIpfsCandidates(entry, role ? `${role}.${key}` : key, target);
  }
}

function pushAbsoluteIpfsCandidate(target: MetadataCandidate[], role: string, value: unknown): void {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed) return;
  if (!looksLikeSupportedAbsolutePreservationUri(trimmed)) return;
  target.push({ role, uri: trimmed });
}

function pushStringCandidate(target: MetadataCandidate[], role: string, value: unknown): void {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed) return;
  if (role === 'external_url') return;
  target.push({ role, uri: trimmed });
}

async function downloadAsset(opts: {
  role: string;
  uri: string;
  gatewayUrl: string;
  fetchImpl: typeof fetch;
  metadataBaseUri?: string | null;
}): Promise<DownloadedAsset> {
  const resolved = resolveUri(opts.uri, opts.gatewayUrl, opts.metadataBaseUri ?? null);
  if (!resolved.fetchUrl) {
    throw new Error(`Unable to resolve "${opts.uri}" for preservation.`);
  }

  const response = await opts.fetchImpl(resolved.fetchUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${opts.role} from "${resolved.originalUri}" (${response.status} ${response.statusText || 'Unknown Error'})`
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get('content-type');

  return {
    originalUri: resolved.originalUri,
    normalizedUri: resolved.normalizedUri,
    fetchUrl: resolved.fetchUrl,
    bytes,
    mimeType: normalizeMimeType(contentType) ?? inferMimeTypeFromPath(resolved.fetchUrl),
  };
}

function resolveUri(rawValue: string, gatewayUrl: string, metadataBaseUri?: string | null): ResolvedUri {
  const canonicalUri = canonicalizeIpfsUri(rawValue, metadataBaseUri);
  return toIpfsResolvedUri(extractIpfsPathFromCanonicalUri(canonicalUri), gatewayUrl);
}

function normalizeIpfsPath(value: string): string {
  const normalized = value.replace(/^\/+/, '').replace(/^ipfs\//, '');
  if (!normalized) {
    throw new Error(`Invalid IPFS URI: "ipfs://${value}"`);
  }
  return normalized;
}

function normalizeGatewayUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function canonicalizeIpfsUri(rawValue: string, metadataBaseUri?: string | null): string {
  const value = rawValue.trim();
  if (!value) {
    throw new Error('Encountered an empty metadata URI while resolving preservation assets.');
  }

  if (value.startsWith('data:')) {
    throw new Error(
      'Preservation only supports CID-backed IPFS URIs. Embedded data: URIs are not eligible for preservation.'
    );
  }

  if (value.startsWith('ar://')) {
    throw new Error(
      `Preservation only supports CID-backed IPFS URIs. Found Arweave URI "${value}". Preservation does not rewrite tokenURI or metadata references, so ar:// assets are not eligible.`
    );
  }

  const absoluteUri = tryCanonicalizeAbsoluteIpfsUri(value);
  if (absoluteUri) {
    return absoluteUri;
  }

  if (hasUriScheme(value)) {
    throw unsupportedPreservationUri(value);
  }

  if (metadataBaseUri) {
    return resolveRelativeIpfsUri(value, metadataBaseUri);
  }

  throw unsupportedPreservationUri(value);
}

function looksLikeSupportedAbsolutePreservationUri(value: string): boolean {
  try {
    return tryCanonicalizeAbsoluteIpfsUri(value) !== null;
  } catch {
    return false;
  }
}

function tryCanonicalizeAbsoluteIpfsUri(value: string): string | null {
  if (value.startsWith('ipfs://')) {
    return `ipfs://${normalizeIpfsPath(stripQueryAndFragment(value.slice('ipfs://'.length)))}`;
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const ipfsPath = extractIpfsPathFromHttpUrl(new URL(value));
      return ipfsPath ? `ipfs://${ipfsPath}` : null;
    } catch {
      return null;
    }
  }

  const bareIpfsPath = extractIpfsPathFromBareValue(value);
  return bareIpfsPath ? `ipfs://${bareIpfsPath}` : null;
}

function resolveRelativeIpfsUri(value: string, metadataBaseUri: string): string {
  const metadataBasePath = extractIpfsPathFromCanonicalUri(metadataBaseUri);
  const baseSegments = metadataBasePath.split('/').filter(Boolean);
  const resolvedSegments = [...(baseSegments.length > 1 ? baseSegments.slice(0, -1) : baseSegments)];
  const relativePath = stripQueryAndFragment(value).replace(/^\/+/, '');

  if (!relativePath) {
    throw unsupportedPreservationUri(value);
  }

  for (const segment of relativePath.split('/')) {
    if (!segment || segment === '.') {
      continue;
    }

    if (segment === '..') {
      if (resolvedSegments.length > 1) {
        resolvedSegments.pop();
      }
      continue;
    }

    resolvedSegments.push(segment);
  }

  return `ipfs://${normalizeIpfsPath(resolvedSegments.join('/'))}`;
}

function hasUriScheme(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);
}

function stripQueryAndFragment(value: string): string {
  return value.replace(/[?#].*$/, '');
}

function extractIpfsPathFromBareValue(value: string): string | null {
  const candidate = stripQueryAndFragment(value).replace(/^\/+/, '');
  if (!candidate) {
    return null;
  }

  const normalized = normalizeIpfsPath(candidate);
  const [cid] = normalized.split('/');
  return cid && isLikelyCid(cid) ? normalized : null;
}

function isLikelyCid(value: string): boolean {
  return CID_V0_REGEX.test(value) || CID_V1_REGEX.test(value);
}

function extractIpfsPathFromHttpUrl(url: URL): string | null {
  const pathMatch = /^\/ipfs\/(.+)$/.exec(url.pathname);
  if (pathMatch) {
    return normalizeIpfsPath(pathMatch[1]);
  }

  const subdomainMatch = /^([^.]+)\.ipfs\./i.exec(url.hostname);
  if (subdomainMatch) {
    const pathSuffix = url.pathname.replace(/^\/+/, '');
    return normalizeIpfsPath(
      pathSuffix.length > 0 ? `${subdomainMatch[1]}/${pathSuffix}` : subdomainMatch[1]
    );
  }

  return null;
}

function extractIpfsPathFromCanonicalUri(uri: string): string {
  if (!uri.startsWith('ipfs://')) {
    throw new Error(`Expected an ipfs:// URI, received "${uri}".`);
  }

  return normalizeIpfsPath(uri.slice('ipfs://'.length));
}

function toIpfsResolvedUri(path: string, gatewayUrl: string): ResolvedUri {
  return {
    originalUri: `ipfs://${path}`,
    normalizedUri: `ipfs://${path}`,
    fetchUrl: `${gatewayUrl}/ipfs/${path}`,
  };
}

function unsupportedPreservationUri(value: string): Error {
  return new Error(
    `Preservation only supports CID-backed IPFS URIs. Found "${value}". Use ipfs://<cid>/..., a bare <cid>/... path, or an IPFS gateway URL like https://ipfs.io/ipfs/<cid>/...`
  );
}

function toStagedAsset(opts: {
  assetId: string;
  role: string;
  originalUri: string;
  bytes: Uint8Array;
  mimeType: string;
}): StagedPreservationAsset {
  return {
    assetId: opts.assetId,
    role: opts.role,
    originalUri: opts.originalUri,
    filename: inferFilename(opts.originalUri, opts.role, opts.mimeType),
    mimeType: opts.mimeType,
    size: opts.bytes.byteLength,
    sha256: sha256Hex(opts.bytes),
    bytes: opts.bytes,
  };
}

function inferFilename(uri: string, role: string, mimeType: string): string {
  if (!uri.startsWith('data:')) {
    const candidate = inferFilenameFromUri(uri);
    if (candidate) return candidate;
  }

  const extension = extensionFromMimeType(mimeType);
  const safeRole = role.replace(/[^a-zA-Z0-9._-]+/g, '-');
  return extension ? `${safeRole}${extension}` : `${safeRole}.bin`;
}

function inferFilenameFromUri(uri: string): string | undefined {
  try {
    if (uri.startsWith('ipfs://')) {
      const path = normalizeIpfsPath(uri.slice('ipfs://'.length));
      const lastSegment = path.split('/').pop();
      return lastSegment && lastSegment !== path ? lastSegment : undefined;
    }

    if (uri.startsWith('ar://')) {
      const path = uri.slice('ar://'.length).replace(/^\/+/, '');
      return path.split('/').pop() || undefined;
    }

    const parsed = new URL(uri);
    const lastSegment = basename(parsed.pathname);
    return lastSegment && lastSegment !== '/' ? lastSegment : undefined;
  } catch {
    return undefined;
  }
}

function normalizeMimeType(value: string | null): string | undefined {
  if (!value) return undefined;
  const [mimeType] = value.split(';');
  return mimeType?.trim() || undefined;
}

function inferMimeTypeFromPath(uri: string): string {
  const path = uri.toLowerCase();
  const extension = Object.keys(EXTENSION_MIME_TYPES).find((candidate) => path.endsWith(candidate));
  return extension ? EXTENSION_MIME_TYPES[extension] : 'application/octet-stream';
}

function extensionFromMimeType(mimeType: string): string | undefined {
  const entry = Object.entries(EXTENSION_MIME_TYPES).find(([, candidate]) => candidate === mimeType);
  return entry?.[0];
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertWithinByteCap(totalBytes: number, maxBytes: number): void {
  if (totalBytes > maxBytes) {
    throw new Error(
      `Preservation payload is ${totalBytes} bytes, which exceeds the configured cap of ${maxBytes} bytes.`
    );
  }
}

function toBigInt(value: bigint | number | string | undefined, field: string): bigint | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${field} must be a non-negative integer`);
    }
    return BigInt(value);
  }

  try {
    const parsed = BigInt(value);
    if (parsed < 0n) {
      throw new Error(`${field} must be a non-negative integer`);
    }
    return parsed;
  } catch {
    throw new Error(`${field} must be a non-negative integer`);
  }
}
