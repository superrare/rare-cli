import type { Address, Hash } from 'viem';
import { chainIds, type SupportedChain } from '../contracts/addresses.js';
import { DEFAULT_BASE_URL } from '../data-access/client.js';

export const DEFAULT_PRESERVATION_GATEWAY_URL = 'https://superrare.myfilebase.com';
export const DEFAULT_PRESERVATION_MAX_BYTES = 1_073_741_824;
export const DEFAULT_PRESERVATION_SERVICE_URL = DEFAULT_BASE_URL;
export const RARE_RATE_PER_BYTE_ATOMIC = 69_690_000_000n;
const FINALIZE_POLL_INTERVAL_MS = 1_000;
const FINALIZE_POLL_TIMEOUT_MS = 300_000;
const PAYMENT_STATUS_POLL_INTERVAL_MS = 1_000;

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
  uploadTransport: 'google-cloud-storage-xml-multipart';
  partSizeBytes: number;
  uploadParts: PreservationUploadPartTarget[];
  completeUrl: string;
  completeMethod: 'POST';
}

export interface PreservationUploadPartTarget {
  partNumber: number;
  uploadUrl: string;
  method: 'PUT';
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

export type PreservationQuoteStatus =
  | 'quoted'
  | 'paid'
  | 'uploaded'
  | 'finalized'
  | 'expired'
  | 'rejected'
  | (string & {});

export type PreservationPaymentLifecycleStatus =
  | 'not_started'
  | 'pending'
  | 'settled'
  | (string & {});

export interface PreservationQuotePaymentStatus {
  quoteId: string;
  quoteStatus: PreservationQuoteStatus;
  expiresAt: string;
  paymentStatus: PreservationPaymentLifecycleStatus;
  payment: PreservationPaymentSummary | null;
}

export type PreservationFinalizeJobState =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export type PreservationFinalizeProgressPhase =
  | 'queued'
  | 'processing'
  | 'resolving_settlement'
  | 'pinning_assets'
  | 'pinning_manifest'
  | 'persisting_receipt'
  | 'completed'
  | 'failed'
  | (string & {});

export interface PreservationFinalizeJobStatus {
  jobId: string | null;
  quoteId: string;
  status: PreservationFinalizeJobState;
  progressPhase: PreservationFinalizeProgressPhase | null;
  attempts: number;
  submittedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  receipt: PreservationReceipt | null;
}

export interface PreservationUploadProgress {
  phase: 'asset-started' | 'part-completed' | 'asset-completed';
  assetId: string;
  assetIndex: number;
  assetCount: number;
  partNumber: number | null;
  partCount: number | null;
  uploadedBytes: number;
  totalBytes: number;
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
  statusFetchImpl?: typeof fetch;
  onPaymentStatusUpdate?: (status: PreservationQuotePaymentStatus) => void;
}

export interface FinalizeTokenPreservationOptions {
  serviceUrl: string;
  quoteId: string;
  uploadToken: string;
  fetchImpl?: typeof fetch;
  onStatusUpdate?: (status: PreservationFinalizeJobStatus) => void;
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
  const paymentStatusPoller =
    opts.onPaymentStatusUpdate
      ? startQuotePaymentStatusPolling({
        serviceUrl: opts.serviceUrl,
        quoteId: opts.quoteId,
        fetchImpl: opts.statusFetchImpl ?? fetch,
        onStatusUpdate: opts.onPaymentStatusUpdate,
      })
      : null;

  try {
    const response = await opts.fetchImpl(serviceUrl(`/v1/preservations/quotes/${encodeURIComponent(opts.quoteId)}/upload-session`, opts.serviceUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    return parseServiceJson<PreservationUploadSession>(response, 'Failed to create preservation upload session');
  } finally {
    paymentStatusPoller?.stop();
  }
}

export async function uploadPreservationAssets(
  serviceBaseUrl: string,
  uploadSession: PreservationUploadSession,
  assets: UploadAssetLike[],
  fetchImpl: typeof fetch = fetch,
  onProgress?: (progress: PreservationUploadProgress) => void,
): Promise<void> {
  const targets = new Map(uploadSession.uploadTargets.map((target) => [target.assetId, target]));

  for (const [assetIndex, asset] of assets.entries()) {
    const target = targets.get(asset.assetId);
    if (!target) {
      throw new Error(`No upload target returned for asset "${asset.assetId}".`);
    }

    if (target.uploadTransport !== 'google-cloud-storage-xml-multipart') {
      throw new Error(
        `Unsupported upload transport "${target.uploadTransport}" for asset "${asset.assetId}".`,
      );
    }

    const sortedUploadParts = sortUploadParts(target.uploadParts);
    const expectedPartCount = getMultipartPartCount(asset.bytes.byteLength, target.partSizeBytes);
    if (sortedUploadParts.length !== expectedPartCount) {
      throw new Error(
        `Upload target for asset "${asset.assetId}" returned ${sortedUploadParts.length} part URLs; expected ${expectedPartCount}.`,
      );
    }

    onProgress?.({
      phase: 'asset-started',
      assetId: asset.assetId,
      assetIndex,
      assetCount: assets.length,
      partNumber: null,
      partCount: sortedUploadParts.length,
      uploadedBytes: 0,
      totalBytes: asset.bytes.byteLength,
    });

    let uploadedBytes = 0;
    for (const uploadPart of sortedUploadParts) {
      const partOffset = (uploadPart.partNumber - 1) * target.partSizeBytes;
      const partBytes = asset.bytes.subarray(
        partOffset,
        Math.min(partOffset + target.partSizeBytes, asset.bytes.byteLength),
      );
      if (partBytes.byteLength === 0) {
        throw new Error(
          `Upload target for asset "${asset.assetId}" included an empty part ${uploadPart.partNumber}.`,
        );
      }

      const response = await fetchImpl(
        resolveUploadTargetUrl(uploadPart.uploadUrl, serviceBaseUrl),
        {
          method: uploadPart.method,
          body: new Uint8Array(partBytes),
        },
      );

      if (!response.ok) {
        throw new PreservationServiceError(
          `Upload failed for asset "${asset.assetId}" part ${uploadPart.partNumber}/${sortedUploadParts.length} with status ${response.status}`,
          response.status,
          await safeJson(response),
        );
      }

      uploadedBytes += partBytes.byteLength;
      onProgress?.({
        phase: 'part-completed',
        assetId: asset.assetId,
        assetIndex,
        assetCount: assets.length,
        partNumber: uploadPart.partNumber,
        partCount: sortedUploadParts.length,
        uploadedBytes,
        totalBytes: asset.bytes.byteLength,
      });
    }

    const completeResponse = await fetchImpl(
      resolveUploadTargetUrl(target.completeUrl, serviceBaseUrl),
      {
        method: target.completeMethod,
      },
    );

    if (!completeResponse.ok) {
      throw new PreservationServiceError(
        `Upload completion failed for asset "${asset.assetId}" with status ${completeResponse.status}`,
        completeResponse.status,
        await safeJson(completeResponse),
      );
    }

    onProgress?.({
      phase: 'asset-completed',
      assetId: asset.assetId,
      assetIndex,
      assetCount: assets.length,
      partNumber: sortedUploadParts.length,
      partCount: sortedUploadParts.length,
      uploadedBytes,
      totalBytes: asset.bytes.byteLength,
    });
  }
}

export async function finalizeTokenPreservation(
  opts: FinalizeTokenPreservationOptions,
): Promise<PreservationReceipt> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const response = await fetchImpl(
    serviceUrl(`/v1/preservations/quotes/${encodeURIComponent(opts.quoteId)}/finalize`, opts.serviceUrl),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ uploadToken: opts.uploadToken }),
    },
  );

  const initialStatus = normalizeFinalizeJobStatus(
    await parseServiceJson<unknown>(response, 'Failed to finalize preservation'),
  );
  return await waitForFinalizeReceipt({
    initialStatus,
    serviceUrl: opts.serviceUrl,
    fetchImpl,
    onStatusUpdate: opts.onStatusUpdate,
  });
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

function normalizePreservationQuotePaymentStatus(
  body: unknown,
): PreservationQuotePaymentStatus {
  if (!body || typeof body !== 'object') {
    throw new Error('Failed to fetch preservation payment status: invalid response body');
  }

  const record = body as Record<string, unknown>;
  const payment =
    record.payment && typeof record.payment === 'object'
      ? normalizePreservationPaymentSummary(record.payment as Record<string, unknown>)
      : null;

  return {
    ...(record as unknown as PreservationQuotePaymentStatus),
    quoteStatus: normalizePreservationQuoteStatus(record.quoteStatus),
    paymentStatus: normalizePreservationPaymentLifecycleStatus(record.paymentStatus),
    payment,
  };
}

function normalizeFinalizeJobStatus(body: unknown): PreservationFinalizeJobStatus {
  if (!body || typeof body !== 'object') {
    throw new Error('Failed to finalize preservation: invalid finalize job response');
  }

  const record = body as Record<string, unknown>;
  const status = normalizeFinalizeJobState(record.status);
  const progressPhase = normalizeFinalizeProgressPhase(record.progressPhase);
  const receipt =
    record.receipt && typeof record.receipt === 'object'
      ? normalizePreservationReceipt(record.receipt)
      : null;

  return {
    ...(record as unknown as PreservationFinalizeJobStatus),
    status,
    progressPhase,
    receipt,
  };
}

function normalizeFinalizeJobState(value: unknown): PreservationFinalizeJobState {
  switch (value) {
    case 'queued':
    case 'processing':
    case 'completed':
    case 'failed':
      return value;
    default:
      throw new Error('Failed to finalize preservation: invalid finalize job status');
  }
}

function normalizeFinalizeProgressPhase(
  value: unknown,
): PreservationFinalizeProgressPhase | null {
  if (value == null) {
    return null;
  }

  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizePreservationQuoteStatus(value: unknown): PreservationQuoteStatus {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Failed to fetch preservation payment status: invalid quote status');
  }

  return value as PreservationQuoteStatus;
}

function normalizePreservationPaymentLifecycleStatus(
  value: unknown,
): PreservationPaymentLifecycleStatus {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Failed to fetch preservation payment status: invalid payment status');
  }

  return value as PreservationPaymentLifecycleStatus;
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

async function waitForFinalizeReceipt(opts: {
  initialStatus: PreservationFinalizeJobStatus;
  serviceUrl: string;
  fetchImpl: typeof fetch;
  onStatusUpdate?: (status: PreservationFinalizeJobStatus) => void;
}): Promise<PreservationReceipt> {
  let jobStatus = opts.initialStatus;
  opts.onStatusUpdate?.(jobStatus);

  if (jobStatus.status === 'completed') {
    return requireFinalizeReceipt(jobStatus);
  }

  if (jobStatus.status === 'failed') {
    throw buildFinalizeFailure(jobStatus);
  }

  if (!jobStatus.jobId) {
    throw new Error(
      'Failed to finalize preservation: seller returned a queued finalize job without a jobId',
    );
  }

  const jobId = jobStatus.jobId;
  const deadline = Date.now() + FINALIZE_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await delay(FINALIZE_POLL_INTERVAL_MS);
    jobStatus = await getFinalizeJobStatus({
      serviceUrl: opts.serviceUrl,
      jobId,
      fetchImpl: opts.fetchImpl,
    });
    opts.onStatusUpdate?.(jobStatus);

    if (jobStatus.status === 'completed') {
      return requireFinalizeReceipt(jobStatus);
    }

    if (jobStatus.status === 'failed') {
      throw buildFinalizeFailure(jobStatus);
    }
  }

  throw new Error(
    `Preservation finalization timed out after ${Math.round(FINALIZE_POLL_TIMEOUT_MS / 1000)} seconds (job ${jobId}).`,
  );
}

async function getFinalizeJobStatus(opts: {
  serviceUrl: string;
  jobId: string;
  fetchImpl: typeof fetch;
}): Promise<PreservationFinalizeJobStatus> {
  const response = await opts.fetchImpl(
    serviceUrl(
      `/v1/preservations/finalize-jobs/${encodeURIComponent(opts.jobId)}`,
      opts.serviceUrl,
    ),
  );
  return normalizeFinalizeJobStatus(
    await parseServiceJson<unknown>(
      response,
      'Failed to fetch preservation finalize job status',
    ),
  );
}

function requireFinalizeReceipt(
  jobStatus: PreservationFinalizeJobStatus,
): PreservationReceipt {
  if (jobStatus.receipt) {
    return jobStatus.receipt;
  }

  throw new Error(
    'Failed to finalize preservation: completed finalize job did not include a receipt',
  );
}

function buildFinalizeFailure(jobStatus: PreservationFinalizeJobStatus): Error {
  const suffix = jobStatus.jobId ? ` (job ${jobStatus.jobId})` : '';
  const detail = jobStatus.errorMessage ? `: ${jobStatus.errorMessage}` : '';
  return new Error(`Preservation finalization failed${suffix}${detail}`);
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getQuotePaymentStatus(opts: {
  serviceUrl: string;
  quoteId: string;
  fetchImpl: typeof fetch;
}): Promise<PreservationQuotePaymentStatus> {
  const response = await opts.fetchImpl(
    serviceUrl(
      `/v1/preservations/quotes/${encodeURIComponent(opts.quoteId)}/payment-status`,
      opts.serviceUrl,
    ),
  );

  return normalizePreservationQuotePaymentStatus(
    await parseServiceJson<unknown>(
      response,
      'Failed to fetch preservation payment status',
    ),
  );
}

function startQuotePaymentStatusPolling(opts: {
  serviceUrl: string;
  quoteId: string;
  fetchImpl: typeof fetch;
  onStatusUpdate: (status: PreservationQuotePaymentStatus) => void;
}): { stop: () => void } {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let previousPaymentStatus: string | null = null;

  const scheduleNextPoll = (): void => {
    if (stopped) {
      return;
    }

    timer = setTimeout(() => {
      void pollOnce();
    }, PAYMENT_STATUS_POLL_INTERVAL_MS);
  };

  const pollOnce = async (): Promise<void> => {
    if (stopped) {
      return;
    }

    try {
      const status = await getQuotePaymentStatus({
        serviceUrl: opts.serviceUrl,
        quoteId: opts.quoteId,
        fetchImpl: opts.fetchImpl,
      });

      if (stopped) {
        return;
      }

      if (status.paymentStatus !== previousPaymentStatus) {
        previousPaymentStatus = status.paymentStatus;
        opts.onStatusUpdate(status);
      }

      if (status.paymentStatus === 'settled') {
        return;
      }
    } catch {
      return;
    }

    scheduleNextPoll();
  };

  scheduleNextPoll();

  return {
    stop(): void {
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
    },
  };
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

function sortUploadParts(
  uploadParts: PreservationUploadPartTarget[],
): PreservationUploadPartTarget[] {
  const sortedUploadParts = [...uploadParts].sort(
    (left, right) => left.partNumber - right.partNumber,
  );

  for (const [index, uploadPart] of sortedUploadParts.entries()) {
    const expectedPartNumber = index + 1;
    if (uploadPart.partNumber !== expectedPartNumber) {
      throw new Error(
        `Upload session returned non-consecutive part numbers; expected ${expectedPartNumber}, received ${uploadPart.partNumber}.`,
      );
    }
  }

  return sortedUploadParts;
}

function getMultipartPartCount(totalBytes: number, partSizeBytes: number): number {
  if (!Number.isInteger(partSizeBytes) || partSizeBytes <= 0) {
    throw new Error(`Invalid preservation multipart part size: ${partSizeBytes}`);
  }

  return Math.ceil(totalBytes / partSizeBytes);
}
