import { getAddress, type Address, type Hex } from 'viem';
import type { RareClientConfig } from './types.js';
import { normalizeBytes32 } from './batch-core.js';
import { resolveRareApiBaseUrl as resolveConfiguredRareApiBaseUrl } from '../data-access/base-url.js';

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

export class RareApiMerkleError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(`API error ${status} on ${path}: ${message}`);
    this.name = 'RareApiMerkleError';
  }
}

export async function generateApiNftMerkleRoot(
  config: RareClientConfig,
  nfts: readonly { contractAddress: Address; tokenId: string | number | bigint }[],
): Promise<Hex> {
  const response = await postRareApiJson(
    config,
    '/v1/merkle-roots/nfts',
    {
      nfts: nfts.map((nft) => ({
        contractAddress: nft.contractAddress,
        tokenId: nft.tokenId.toString(),
      })),
    },
  );
  if (!isGenerateMerkleRootResponse(response)) {
    throw new Error('rare-api returned an invalid NFT Merkle root response.');
  }
  return normalizeBytes32(response.merkleRoot, 'rare-api NFT Merkle root');
}

export async function generateApiAddressMerkleRoot(
  config: RareClientConfig,
  params: {
    addresses: readonly Address[];
    storageTarget: 'batch-listing' | 'collection-allowlist' | 'both';
  },
): Promise<Hex> {
  const response = await postRareApiJson(
    config,
    '/v1/merkle-roots/addresses',
    {
      addresses: [...params.addresses],
      storageTarget: params.storageTarget,
    },
  );
  if (!isGenerateMerkleRootResponse(response)) {
    throw new Error('rare-api returned an invalid address Merkle root response.');
  }
  return normalizeBytes32(response.merkleRoot, 'rare-api address Merkle root');
}

export async function resolveApiNftMerkleProof(
  config: RareClientConfig,
  params: {
    chainId: number;
    contractAddress: Address;
    tokenId: string | number | bigint;
    root?: Hex;
    context?: NftMerkleProofContext;
    creator?: Address;
  },
): Promise<ApiNftMerkleProof> {
  const response = await postRareApiJson(
    config,
    '/v1/merkle-roots/nfts/proof',
    {
      chainId: params.chainId,
      contractAddress: params.contractAddress,
      tokenId: params.tokenId.toString(),
      ...(params.root === undefined ? {} : { root: params.root }),
      ...(params.context === undefined ? {} : { context: params.context }),
      ...(params.creator === undefined ? {} : { creator: params.creator }),
    },
  );
  if (!isApiNftMerkleProofResponse(response)) {
    throw new Error('rare-api returned an invalid NFT Merkle proof response.');
  }
  return {
    root: normalizeBytes32(response.root, 'rare-api NFT Merkle root'),
    contractAddress: getAddress(response.contractAddress),
    tokenId: response.tokenId,
    leaf: normalizeBytes32(response.leaf, 'rare-api NFT Merkle leaf'),
    proof: normalizeProof(response.proof, 'rare-api NFT Merkle proof'),
  };
}

export async function resolveApiAddressMerkleProof(
  config: RareClientConfig,
  params: {
    root: Hex;
    address: Address;
    storageTarget: 'batch-listing' | 'collection-allowlist';
  },
): Promise<ApiAddressMerkleProof> {
  const response = await postRareApiJson(
    config,
    '/v1/merkle-roots/addresses/proof',
    params,
  );
  if (!isApiAddressMerkleProofResponse(response)) {
    throw new Error('rare-api returned an invalid address Merkle proof response.');
  }
  return {
    root: normalizeBytes32(response.root, 'rare-api address Merkle root'),
    address: getAddress(response.address),
    leaf: normalizeBytes32(response.leaf, 'rare-api address Merkle leaf'),
    proof: normalizeProof(response.proof, 'rare-api address Merkle proof'),
  };
}

async function postRareApiJson(
  config: RareClientConfig,
  path: string,
  body: unknown,
): Promise<unknown> {
  const baseUrl = resolveRareApiBaseUrl(config).replace(/\/+$/, '');
  const fetchImpl = config.apiFetch ?? fetch;
  const response = await fetchImpl(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await readRareApiErrorMessage(response);
    throw new RareApiMerkleError(message ?? response.statusText, response.status, path);
  }

  return response.json();
}

function resolveRareApiBaseUrl(config: RareClientConfig): string {
  return resolveConfiguredRareApiBaseUrl(config.apiBaseUrl);
}

async function readRareApiErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.clone().json();
    return isErrorBody(body) ? body.error : undefined;
  } catch {
    return undefined;
  }
}

function isErrorBody(value: unknown): value is { error: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof value.error === 'string'
  );
}

function normalizeProof(proof: readonly string[], label: string): Hex[] {
  return proof.map((entry, index) => normalizeBytes32(entry, `${label}[${index}]`));
}

type ApiNftMerkleProofResponse = {
  root: string;
  contractAddress: string;
  tokenId: string;
  leaf: string;
  proof: string[];
};

type ApiAddressMerkleProofResponse = {
  root: string;
  address: string;
  leaf: string;
  proof: string[];
};

function isGenerateMerkleRootResponse(value: unknown): value is { merkleRoot: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'merkleRoot' in value &&
    typeof value.merkleRoot === 'string'
  );
}

function isApiNftMerkleProofResponse(value: unknown): value is ApiNftMerkleProofResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    hasString(value, 'root') &&
    hasString(value, 'contractAddress') &&
    hasString(value, 'tokenId') &&
    hasString(value, 'leaf') &&
    hasStringArray(value, 'proof')
  );
}

function isApiAddressMerkleProofResponse(value: unknown): value is ApiAddressMerkleProofResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    hasString(value, 'root') &&
    hasString(value, 'address') &&
    hasString(value, 'leaf') &&
    hasStringArray(value, 'proof')
  );
}

function hasString(value: object, key: string): boolean {
  return key in value && typeof Reflect.get(value, key) === 'string';
}

function hasStringArray(value: object, key: string): boolean {
  const entry: unknown = key in value ? Reflect.get(value, key) : undefined;
  return Array.isArray(entry) && entry.every((item) => typeof item === 'string');
}
