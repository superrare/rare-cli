import type { Address, Hash } from 'viem';
import { chainIds, type SupportedChain } from '../contracts/addresses.js';

export const DEFAULT_PRESERVATION_GATEWAY_URL = 'https://ipfs.io';
export const DEFAULT_PRESERVATION_MAX_BYTES = 1_073_741_824;
export const DEFAULT_PRESERVATION_SERVICE_URL = 'http://localhost:6969';
export const RARE_RATE_PER_BYTE_ATOMIC = 69_690_000_000n;

export interface TokenPreservationSource {
  chain: SupportedChain;
  chainId: number;
  contractAddress: Address;
  tokenId: string;
  universalTokenId: string;
  tokenUri: string;
}

export interface PreservationAssetDescriptor {
  assetId: string;
  role: string;
  originalUri: string;
  filename: string;
  mimeType: string;
  size: number;
  sha256: string;
}

export interface PreservationAsset extends PreservationAssetDescriptor {
  cid?: string;
  ipfsUrl?: string;
  gatewayUrl?: string;
}

export interface PreservationPaymentOption {
  scheme: string;
  network: `eip155:${number}`;
  asset: Address;
  payTo: Address;
  amount: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown> | null;
}

export interface PreservationPaymentSummary {
  paymentIdentifier?: string;
  network: string;
  tokenAddress: Address;
  tokenAmount: string;
  payerAddress: Address | null;
  transaction?: Hash | string;
  settledAt?: string;
  response?: unknown;
}

export interface QuoteTokenPreservationRequest {
  source: TokenPreservationSource;
  assets: PreservationAssetDescriptor[];
  preferredPaymentChain?: SupportedChain;
}

export interface PreservationQuote {
  quoteId: string;
  expiresAt: string;
  billableBytes: number;
  tokenAmount: string;
  ratePerByteAtomic: string;
  source: TokenPreservationSource;
  assets: PreservationAssetDescriptor[];
  acceptedPayments: PreservationPaymentOption[];
}

export interface PreservationUploadTarget {
  assetId: string;
  uploadUrl: string;
  method?: 'PUT' | 'POST';
  headers?: Record<string, string>;
}

export interface PreservationUploadSession {
  quoteId: string;
  uploadToken: string;
  expiresAt: string;
  uploadTargets: PreservationUploadTarget[];
}

export interface PreservationReceipt {
  receiptId: string;
  quoteId: string;
  expiresAt?: string;
  manifestCid: string;
  manifestIpfsUrl: string;
  manifestGatewayUrl?: string;
  billableBytes: number;
  payment: PreservationPaymentSummary;
  assets: PreservationAsset[];
  source: TokenPreservationSource;
  createdAt: string;
}

export interface QuoteTokenPreservationOptions {
  serviceUrl: string;
  request: QuoteTokenPreservationRequest;
  fetchImpl?: typeof fetch;
}

export interface CreatePreservationUploadSessionOptions {
  serviceUrl: string;
  quoteId: string;
  fetchImpl: typeof fetch;
}

export interface FinalizeTokenPreservationOptions {
  serviceUrl: string;
  quoteId: string;
  uploadToken: string;
  fetchImpl?: typeof fetch;
}

export interface UploadAssetLike {
  assetId: string;
  bytes: Uint8Array;
  mimeType: string;
}

export class PreservationServiceError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'PreservationServiceError';
    this.status = status;
    this.body = body;
  }
}

export function paymentNetworkForChain(chain: SupportedChain): `eip155:${number}` {
  return `eip155:${chainIds[chain]}` as const;
}

export async function quoteTokenPreservation(opts: QuoteTokenPreservationOptions): Promise<PreservationQuote> {
  const response = await (opts.fetchImpl ?? fetch)(serviceUrl('/v1/preservations/quotes', opts.serviceUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(opts.request),
  });

  return normalizePreservationQuote(await parseServiceJson<unknown>(response, 'Failed to quote preservation'));
}

export async function createPreservationUploadSession(
  opts: CreatePreservationUploadSessionOptions,
): Promise<PreservationUploadSession> {
  const response = await opts.fetchImpl(serviceUrl(`/v1/preservations/quotes/${encodeURIComponent(opts.quoteId)}/upload-session`, opts.serviceUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });

  return parseServiceJson<PreservationUploadSession>(response, 'Failed to create preservation upload session');
}

export async function uploadPreservationAssets(
  serviceBaseUrl: string,
  uploadSession: PreservationUploadSession,
  assets: UploadAssetLike[],
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const targets = new Map(uploadSession.uploadTargets.map((target) => [target.assetId, target]));

  for (const asset of assets) {
    const target = targets.get(asset.assetId);
    if (!target) {
      throw new Error(`No upload target returned for asset "${asset.assetId}".`);
    }

    const method = target.method ?? 'PUT';
    const headers = new Headers(target.headers ?? {});
    if (!headers.has('content-type')) {
      headers.set('content-type', asset.mimeType);
    }

    const response = await fetchImpl(resolveUploadTargetUrl(target.uploadUrl, serviceBaseUrl), {
      method,
      headers,
      body: asset.bytes as unknown as BodyInit,
    });

    if (!response.ok) {
      throw new PreservationServiceError(
        `Upload failed for asset "${asset.assetId}" with status ${response.status}`,
        response.status,
        await safeJson(response),
      );
    }
  }
}

export async function finalizeTokenPreservation(
  opts: FinalizeTokenPreservationOptions,
): Promise<PreservationReceipt> {
  const response = await (opts.fetchImpl ?? fetch)(
    serviceUrl(`/v1/preservations/quotes/${encodeURIComponent(opts.quoteId)}/finalize`, opts.serviceUrl),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ uploadToken: opts.uploadToken }),
    },
  );

  return normalizePreservationReceipt(await parseServiceJson<unknown>(response, 'Failed to finalize preservation'));
}

async function parseServiceJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const body = await safeJson(response);
  if (!response.ok) {
    const message =
      extractErrorMessage(body) ??
      `${fallbackMessage} (${response.status} ${response.statusText || 'Unknown Error'})`;
    throw new PreservationServiceError(message, response.status, body);
  }

  return body as T;
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const maybeError = (body as Record<string, unknown>).error;
  return typeof maybeError === 'string' ? maybeError : undefined;
}

function normalizePreservationQuote(body: unknown): PreservationQuote {
  if (!body || typeof body !== 'object') {
    throw new Error('Failed to quote preservation: invalid response body');
  }

  const record = body as Record<string, unknown>;
  const tokenAmount = normalizeTokenAmount(record.tokenAmount, 'quote');
  return {
    ...(record as unknown as PreservationQuote),
    tokenAmount,
  };
}

function normalizePreservationReceipt(body: unknown): PreservationReceipt {
  if (!body || typeof body !== 'object') {
    throw new Error('Failed to finalize preservation: invalid response body');
  }

  const record = body as Record<string, unknown>;
  const payment =
    record.payment && typeof record.payment === 'object'
      ? normalizePreservationPaymentSummary(record.payment as Record<string, unknown>)
      : undefined;

  return {
    ...(record as unknown as PreservationReceipt),
    ...(payment ? { payment } : {}),
  };
}

function normalizePreservationPaymentSummary(
  payment: Record<string, unknown>,
): PreservationPaymentSummary {
  const tokenAmount = normalizeTokenAmount(payment.tokenAmount, 'payment');
  return {
    ...(payment as unknown as PreservationPaymentSummary),
    tokenAmount,
  };
}

function normalizeTokenAmount(
  value: unknown,
  context: string,
): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Failed to parse preservation ${context}: missing tokenAmount`);
  }

  return value;
}

function serviceUrl(pathname: string, rawBaseUrl: string): string {
  const baseUrl = new URL(rawBaseUrl);
  return new URL(pathname, baseUrl).toString();
}

function resolveUploadTargetUrl(targetUrl: string, rawBaseUrl: string): string {
  try {
    return new URL(targetUrl).toString();
  } catch {
    return serviceUrl(targetUrl, rawBaseUrl);
  }
}
