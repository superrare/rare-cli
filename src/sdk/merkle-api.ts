import { getAddress, type Address, type Hex } from 'viem';
import { normalizeBytes32 } from './batch-core.js';
import { createApiClient, type ApiClient } from '../data-access/index.js';

export type NftMerkleProofContext =
  | 'batch-listing'
  | 'batch-auction'
  | 'batch-offer';

export type ApiNftMerkleProof = {
  root: Hex;
  contractAddress: Address;
  tokenId: string;
  leaf: Hex;
  proof: Hex[];
};

export type ApiAddressMerkleProof = {
  root: Hex;
  address: Address;
  leaf: Hex;
  proof: Hex[];
};

type RareApiConfig = {
  apiBaseUrl?: string;
  apiFetch?: typeof fetch;
};

export async function generateApiNftMerkleRoot(
  config: RareApiConfig,
  nfts: readonly { contractAddress: Address; tokenId: string | number | bigint }[],
): Promise<Hex> {
  const { data } = await withApiTransportRetry(async () => await createConfiguredApiClient(config).POST(
    '/v1/merkle-roots/nfts',
    {
      body: {
        nfts: nfts.map((nft) => ({
          contractAddress: nft.contractAddress,
          tokenId: nft.tokenId.toString(),
        })),
      },
    },
  ));
  if (!data) {
    throw new Error('rare-api returned an invalid NFT Merkle root response.');
  }
  return normalizeBytes32(data.merkleRoot, 'rare-api NFT Merkle root');
}

export async function generateApiAddressMerkleRoot(
  config: RareApiConfig,
  params: {
    addresses: readonly Address[];
    storageTarget: 'batch-listing' | 'collection-allowlist' | 'both';
  },
): Promise<Hex> {
  const { data } = await withApiTransportRetry(async () => await createConfiguredApiClient(config).POST(
    '/v1/merkle-roots/addresses',
    {
      body: {
        addresses: [...params.addresses],
        storageTarget: params.storageTarget,
      },
    },
  ));
  if (!data) {
    throw new Error('rare-api returned an invalid address Merkle root response.');
  }
  return normalizeBytes32(data.merkleRoot, 'rare-api address Merkle root');
}

export async function resolveApiNftMerkleProof(
  config: RareApiConfig,
  params: {
    chainId: number;
    contractAddress: Address;
    tokenId: string | number | bigint;
    root?: Hex;
    context?: NftMerkleProofContext;
    creator?: Address;
  },
): Promise<ApiNftMerkleProof> {
  const { data } = await withApiTransportRetry(async () => await createConfiguredApiClient(config).POST(
    '/v1/merkle-roots/nfts/proof',
    {
      body: {
        chainId: params.chainId,
        contractAddress: params.contractAddress,
        tokenId: params.tokenId.toString(),
        ...(params.root === undefined ? {} : { root: params.root }),
        ...(params.context === undefined ? {} : { context: params.context }),
        ...(params.creator === undefined ? {} : { creator: params.creator }),
      },
    },
  ));
  if (!data) {
    throw new Error('rare-api returned an invalid NFT Merkle proof response.');
  }
  return {
    root: normalizeBytes32(data.root, 'rare-api NFT Merkle root'),
    contractAddress: getAddress(data.contractAddress),
    tokenId: data.tokenId,
    leaf: normalizeBytes32(data.leaf, 'rare-api NFT Merkle leaf'),
    proof: normalizeProof(data.proof, 'rare-api NFT Merkle proof'),
  };
}

export async function resolveApiNftMerkleProofFromRoots(
  config: RareApiConfig,
  params: {
    chainId: number;
    contractAddress: Address;
    tokenId: string | number | bigint;
    roots: readonly Hex[];
    context?: NftMerkleProofContext;
    creator?: Address;
  },
): Promise<ApiNftMerkleProof> {
  const roots = uniqueRoots(params.roots);
  const { matches, lastNotFound } = await collectApiNftMerkleProofMatches(config, params, roots);
  const [match] = matches;

  if (matches.length === 1 && match !== undefined) {
    return match;
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple active ${params.context ?? 'NFT'} Merkle roots contain token ` +
        `${params.contractAddress}/${params.tokenId.toString()}. Pass root as an override.`,
    );
  }

  if (lastNotFound !== undefined) {
    throw lastNotFound;
  }
  throw new Error(
    `No candidate ${params.context ?? 'NFT'} Merkle roots were available for token ` +
      `${params.contractAddress}/${params.tokenId.toString()}.`,
  );
}

export function isApiNftMerkleProofResolutionError(error: unknown): boolean {
  return (
    isApiErrorLike(error) &&
    error.path === '/v1/merkle-roots/nfts/proof' &&
    (error.status === 404 || error.status === 409)
  );
}

export async function resolveApiAddressMerkleProof(
  config: RareApiConfig,
  params: {
    root: Hex;
    address: Address;
    storageTarget: 'batch-listing' | 'collection-allowlist';
  },
): Promise<ApiAddressMerkleProof> {
  const { data } = await withApiTransportRetry(async () => await createConfiguredApiClient(config).POST(
    '/v1/merkle-roots/addresses/proof',
    { body: params },
  ));
  if (!data) {
    throw new Error('rare-api returned an invalid address Merkle proof response.');
  }
  return {
    root: normalizeBytes32(data.root, 'rare-api address Merkle root'),
    address: getAddress(data.address),
    leaf: normalizeBytes32(data.leaf, 'rare-api address Merkle leaf'),
    proof: normalizeProof(data.proof, 'rare-api address Merkle proof'),
  };
}

function createConfiguredApiClient(config: RareApiConfig): ApiClient {
  return createApiClient(config.apiBaseUrl, config.apiFetch);
}

function normalizeProof(proof: readonly string[], label: string): Hex[] {
  return proof.map((entry, index) => normalizeBytes32(entry, `${label}[${index}]`));
}

async function withApiTransportRetry<T>(request: () => Promise<T>, attempt = 1): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (attempt >= 3 || !isRetryableApiTransportError(error)) {
      throw error;
    }

    await sleep(250 * attempt);
    return await withApiTransportRetry(request, attempt + 1);
  }
}

async function collectApiNftMerkleProofMatches(
  config: RareApiConfig,
  params: {
    chainId: number;
    contractAddress: Address;
    tokenId: string | number | bigint;
    roots: readonly Hex[];
    context?: NftMerkleProofContext;
    creator?: Address;
  },
  roots: readonly Hex[],
  index = 0,
  matches: readonly ApiNftMerkleProof[] = [],
  lastNotFound?: Error,
): Promise<{ matches: readonly ApiNftMerkleProof[]; lastNotFound?: Error }> {
  const root = roots[index];
  if (root === undefined) {
    return { matches, lastNotFound };
  }

  try {
    const proof = await resolveApiNftMerkleProof(config, { ...params, root });
    return await collectApiNftMerkleProofMatches(config, params, roots, index + 1, [...matches, proof], lastNotFound);
  } catch (error) {
    if (!isApiNftMerkleProofNotFound(error)) {
      throw error;
    }
    return await collectApiNftMerkleProofMatches(config, params, roots, index + 1, matches, error);
  }
}

function isApiNftMerkleProofNotFound(error: unknown): error is Error & { readonly path: string; readonly status: number } {
  return (
    isApiErrorLike(error) &&
    error.path === '/v1/merkle-roots/nfts/proof' &&
    error.status === 404
  );
}

function isApiErrorLike(error: unknown): error is Error & { readonly path: string; readonly status: number } {
  return (
    error instanceof Error &&
    'path' in error &&
    typeof error.path === 'string' &&
    'status' in error &&
    typeof error.status === 'number'
  );
}

function isRetryableApiTransportError(error: unknown): boolean {
  if (isApiErrorLike(error)) {
    return false;
  }

  return /(fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN)/i.test(errorCauseText(error));
}

function errorCauseText(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  return `${error.message} ${errorCauseText(error.cause)}`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueRoots(roots: readonly Hex[]): Hex[] {
  return [...new Set(roots.map((root) => normalizeBytes32(root, 'candidate root')))];
}
