import { getAddress, type Address, type Hex } from 'viem';
import type { RareClientConfig } from './types/client.js';
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

export async function generateApiNftMerkleRoot(
  config: RareClientConfig,
  nfts: readonly { contractAddress: Address; tokenId: string | number | bigint }[],
): Promise<Hex> {
  const { data } = await createConfiguredApiClient(config).POST(
    '/v1/merkle-roots/nfts',
    {
      body: {
        nfts: nfts.map((nft) => ({
          contractAddress: nft.contractAddress,
          tokenId: nft.tokenId.toString(),
        })),
      },
    },
  );
  if (!data) {
    throw new Error('rare-api returned an invalid NFT Merkle root response.');
  }
  return normalizeBytes32(data.merkleRoot, 'rare-api NFT Merkle root');
}

export async function generateApiAddressMerkleRoot(
  config: RareClientConfig,
  params: {
    addresses: readonly Address[];
    storageTarget: 'batch-listing' | 'collection-allowlist' | 'both';
  },
): Promise<Hex> {
  const { data } = await createConfiguredApiClient(config).POST(
    '/v1/merkle-roots/addresses',
    {
      body: {
        addresses: [...params.addresses],
        storageTarget: params.storageTarget,
      },
    },
  );
  if (!data) {
    throw new Error('rare-api returned an invalid address Merkle root response.');
  }
  return normalizeBytes32(data.merkleRoot, 'rare-api address Merkle root');
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
  const { data } = await createConfiguredApiClient(config).POST(
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
  );
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

export async function resolveApiAddressMerkleProof(
  config: RareClientConfig,
  params: {
    root: Hex;
    address: Address;
    storageTarget: 'batch-listing' | 'collection-allowlist';
  },
): Promise<ApiAddressMerkleProof> {
  const { data } = await createConfiguredApiClient(config).POST(
    '/v1/merkle-roots/addresses/proof',
    { body: params },
  );
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

function createConfiguredApiClient(config: RareClientConfig): ApiClient {
  return createApiClient(config.apiBaseUrl, config.apiFetch);
}

function normalizeProof(proof: readonly string[], label: string): Hex[] {
  return proof.map((entry, index) => normalizeBytes32(entry, `${label}[${index}]`));
}
