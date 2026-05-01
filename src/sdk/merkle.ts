import { readFile, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import {
  type Address,
  encodePacked,
  getAddress,
  isAddress,
  isHex,
  keccak256,
} from 'viem';
import { MerkleTree } from 'merkletreejs';
import type {
  BatchListingProofArtifact,
  BatchListingRootArtifact,
  BatchListingTokenEntry,
  IntegerInput,
} from './types.js';
import { toInteger } from './helpers.js';

export interface BuildRootArtifactInput {
  tokens: BatchListingTokenEntry[];
  currency: Address;
  amount: bigint;
  splitAddresses?: Address[];
  splitRatios?: number[];
  allowListAddresses?: Address[];
  allowListEndTimestamp?: IntegerInput;
}

export interface BuildBatchListingTreeResult {
  root: `0x${string}`;
  tree: MerkleTree;
  sortedTokens: { contract: Address; tokenId: string }[];
}

export interface BuildAllowListTreeResult {
  root: `0x${string}`;
  tree: MerkleTree;
  sortedAddresses: Address[];
}

const ZERO_ROOT = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

function hexBuffer(hex: string): Buffer {
  return Buffer.from(hex.startsWith('0x') ? hex.slice(2) : hex, 'hex');
}

function tokenLeaf(contract: Address, tokenId: bigint): Buffer {
  const packed = encodePacked(['address', 'uint256'], [contract, tokenId]);
  return hexBuffer(keccak256(packed));
}

function addressLeaf(address: Address): Buffer {
  return hexBuffer(keccak256(address as `0x${string}`));
}

function compareTokenEntries(
  a: { contract: Address; tokenId: string; tokenIdBigInt: bigint },
  b: { contract: Address; tokenId: string; tokenIdBigInt: bigint },
): number {
  const ac = a.contract.toLowerCase();
  const bc = b.contract.toLowerCase();
  if (ac !== bc) return ac < bc ? -1 : 1;
  return a.tokenId.localeCompare(b.tokenId);
}

export function buildBatchListingTree(
  tokens: BatchListingTokenEntry[],
): BuildBatchListingTreeResult {
  if (tokens.length === 0) {
    throw new Error('buildBatchListingTree requires at least one token');
  }

  const normalized = tokens.map((t) => {
    if (!isAddress(t.contract)) {
      throw new Error(`Invalid token contract address: ${t.contract}`);
    }
    return {
      contract: getAddress(t.contract) as Address,
      tokenId: String(t.tokenId),
      tokenIdBigInt: toInteger(t.tokenId, 'tokenId'),
    };
  });

  const sorted = [...normalized].sort(compareTokenEntries);
  const leaves = sorted.map((t) => tokenLeaf(t.contract, t.tokenIdBigInt));
  const tree = new MerkleTree(leaves, (data: Buffer) => hexBuffer(keccak256(data)), {
    sortPairs: true,
  });

  return {
    root: tree.getHexRoot() as `0x${string}`,
    tree,
    sortedTokens: sorted.map(({ contract, tokenId }) => ({ contract, tokenId })),
  };
}

export function buildAllowListTree(addresses: Address[]): BuildAllowListTreeResult {
  if (addresses.length === 0) {
    throw new Error('buildAllowListTree requires at least one address');
  }

  const normalized = addresses.map((addr) => {
    if (!isAddress(addr)) throw new Error(`Invalid allowlist address: ${addr}`);
    return getAddress(addr) as Address;
  });

  const sorted = [...normalized].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const leaves = sorted.map(addressLeaf);
  const tree = new MerkleTree(leaves, (data: Buffer) => hexBuffer(keccak256(data)), {
    sortPairs: true,
  });

  return {
    root: tree.getHexRoot() as `0x${string}`,
    tree,
    sortedAddresses: sorted,
  };
}

export function getTokenProof(
  tree: MerkleTree,
  contract: Address,
  tokenId: bigint,
): `0x${string}`[] {
  const leaf = tokenLeaf(getAddress(contract) as Address, tokenId);
  return tree.getHexProof(leaf) as `0x${string}`[];
}

export function getAddressProof(tree: MerkleTree, address: Address): `0x${string}`[] {
  const leaf = addressLeaf(getAddress(address) as Address);
  return tree.getHexProof(leaf) as `0x${string}`[];
}

export function buildRootArtifact(input: BuildRootArtifactInput): BatchListingRootArtifact {
  const { root: nftRoot, sortedTokens } = buildBatchListingTree(input.tokens);

  const splitAddresses = input.splitAddresses ?? [];
  const splitRatios = input.splitRatios ?? [];
  if (splitAddresses.length !== splitRatios.length) {
    throw new Error('splitAddresses and splitRatios must have the same length');
  }
  if (splitRatios.length > 0) {
    const sum = splitRatios.reduce((acc, n) => acc + n, 0);
    if (sum !== 100) {
      throw new Error(`splitRatios must sum to 100, got ${sum}`);
    }
    for (const r of splitRatios) {
      if (!Number.isInteger(r) || r < 0 || r > 255) {
        throw new Error(`splitRatios entries must be uint8 (0-255), got ${r}`);
      }
    }
  }

  const artifact: BatchListingRootArtifact = {
    root: nftRoot,
    currency: getAddress(input.currency) as Address,
    amount: input.amount.toString(),
    splitAddresses: splitAddresses.map((a) => getAddress(a) as Address),
    splitRatios,
    tokens: sortedTokens.map((t) => ({ contract: t.contract, tokenId: t.tokenId })),
  };

  if (input.allowListAddresses && input.allowListAddresses.length > 0) {
    const { root: allowRoot, sortedAddresses } = buildAllowListTree(input.allowListAddresses);
    artifact.allowList = {
      root: allowRoot,
      addresses: sortedAddresses,
      endTimestamp: input.allowListEndTimestamp
        ? toInteger(input.allowListEndTimestamp, 'allowListEndTimestamp').toString()
        : undefined,
    };
  }

  return artifact;
}

export function buildProofArtifact(
  artifact: BatchListingRootArtifact,
  contract: Address,
  tokenId: IntegerInput,
  buyer?: Address,
): BatchListingProofArtifact {
  const tokenIdBig = toInteger(tokenId, 'tokenId');
  const contractChecksum = getAddress(contract) as Address;

  const found = artifact.tokens.find(
    (t) => t.contract.toLowerCase() === contractChecksum.toLowerCase() && BigInt(t.tokenId) === tokenIdBig,
  );
  if (!found) {
    throw new Error(
      `Token ${contractChecksum}/${tokenIdBig.toString()} is not in this root artifact's token set`,
    );
  }

  const tokens: BatchListingTokenEntry[] = artifact.tokens.map((t) => ({
    contract: t.contract,
    tokenId: t.tokenId,
  }));
  const { tree, root } = buildBatchListingTree(tokens);
  if (root.toLowerCase() !== artifact.root.toLowerCase()) {
    throw new Error(
      `Recomputed NFT tree root (${root}) does not match artifact root (${artifact.root}). Artifact is corrupt or tree encoding has drifted.`,
    );
  }
  const proof = getTokenProof(tree, contractChecksum, tokenIdBig);

  const result: BatchListingProofArtifact = {
    root: artifact.root,
    contract: contractChecksum,
    tokenId: tokenIdBig.toString(),
    proof,
  };

  if (artifact.allowList) {
    if (!buyer) {
      throw new Error(
        'This root has an allowlist; pass buyer address to buildProofArtifact to include allowListProof',
      );
    }
    if (!isAddress(buyer)) throw new Error(`Invalid buyer address: ${buyer}`);
    const buyerChecksum = getAddress(buyer) as Address;
    const inAllowList = artifact.allowList.addresses.some(
      (a) => a.toLowerCase() === buyerChecksum.toLowerCase(),
    );
    if (!inAllowList) {
      throw new Error(`Buyer ${buyerChecksum} is not in the allowlist`);
    }
    const { tree: allowTree, root: allowRoot } = buildAllowListTree(artifact.allowList.addresses);
    if (allowRoot.toLowerCase() !== artifact.allowList.root.toLowerCase()) {
      throw new Error(
        `Recomputed allowlist root (${allowRoot}) does not match artifact (${artifact.allowList.root})`,
      );
    }
    result.allowListProof = getAddressProof(allowTree, buyerChecksum);
    result.allowListAddress = buyerChecksum;
  }

  return result;
}

function assertHexRoot(value: unknown, field: string): asserts value is `0x${string}` {
  if (typeof value !== 'string' || !isHex(value) || value.length !== 66) {
    throw new Error(`${field} must be a 0x-prefixed bytes32 hex string`);
  }
}

function assertAddress(value: unknown, field: string): asserts value is Address {
  if (typeof value !== 'string' || !isAddress(value)) {
    throw new Error(`${field} must be a valid 0x address`);
  }
}

export function validateRootArtifact(value: unknown): asserts value is BatchListingRootArtifact {
  if (!value || typeof value !== 'object') {
    throw new Error('Root artifact must be a JSON object');
  }
  const a = value as Record<string, unknown>;
  assertHexRoot(a.root, 'root');
  assertAddress(a.currency, 'currency');
  if (typeof a.amount !== 'string') throw new Error('amount must be a string (base units)');
  if (!Array.isArray(a.splitAddresses)) throw new Error('splitAddresses must be an array');
  if (!Array.isArray(a.splitRatios)) throw new Error('splitRatios must be an array');
  if (!Array.isArray(a.tokens) || a.tokens.length === 0) {
    throw new Error('tokens must be a non-empty array');
  }
  for (const t of a.tokens) {
    const tt = t as Record<string, unknown>;
    assertAddress(tt.contract, 'tokens[].contract');
    if (typeof tt.tokenId !== 'string') throw new Error('tokens[].tokenId must be a string');
  }
  if (a.allowList !== undefined && a.allowList !== null) {
    const al = a.allowList as Record<string, unknown>;
    assertHexRoot(al.root, 'allowList.root');
    if (!Array.isArray(al.addresses)) throw new Error('allowList.addresses must be an array');
  }
}

export function validateProofArtifact(value: unknown): asserts value is BatchListingProofArtifact {
  if (!value || typeof value !== 'object') {
    throw new Error('Proof artifact must be a JSON object');
  }
  const a = value as Record<string, unknown>;
  assertHexRoot(a.root, 'root');
  assertAddress(a.contract, 'contract');
  if (typeof a.tokenId !== 'string') throw new Error('tokenId must be a string');
  if (!Array.isArray(a.proof)) throw new Error('proof must be an array of bytes32 hex');
  for (const p of a.proof) {
    if (typeof p !== 'string' || !isHex(p) || p.length !== 66) {
      throw new Error('proof entries must be 0x-prefixed bytes32 hex strings');
    }
  }
  if (a.allowListProof !== undefined && a.allowListProof !== null) {
    if (!Array.isArray(a.allowListProof)) throw new Error('allowListProof must be an array');
  }
}

export async function loadRootArtifact(path: string): Promise<BatchListingRootArtifact> {
  const text = await readFile(path, 'utf8');
  const parsed = JSON.parse(text);
  validateRootArtifact(parsed);
  return parsed;
}

export async function loadProofArtifact(path: string): Promise<BatchListingProofArtifact> {
  const text = await readFile(path, 'utf8');
  const parsed = JSON.parse(text);
  validateProofArtifact(parsed);
  return parsed;
}

export async function writeArtifact(path: string, data: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(data, null, 2) + '\n');
}

export interface TokenSetFileShape {
  tokens?: { chainId?: number; contract: Address; tokenId: string | number }[];
}

/**
 * Token-set input file accepts two shapes:
 *   1. [{contract, tokenId}, ...]
 *   2. {tokens: [{chainId?, contract, tokenId}, ...]}
 * Detection is by top-level type (array vs object).
 */
export async function loadTokenSet(path: string): Promise<BatchListingTokenEntry[]> {
  const text = await readFile(path, 'utf8');
  const parsed = JSON.parse(text);
  const raw: { contract: unknown; tokenId: unknown }[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as TokenSetFileShape)?.tokens)
      ? ((parsed as TokenSetFileShape).tokens as { contract: unknown; tokenId: unknown }[])
      : (() => {
          throw new Error(
            'Token-set file must be a JSON array or an object with a "tokens" array',
          );
        })();

  if (raw.length === 0) throw new Error('Token-set file is empty');

  return raw.map((entry, idx) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`tokens[${idx}] must be an object`);
    }
    if (typeof entry.contract !== 'string' || !isAddress(entry.contract)) {
      throw new Error(`tokens[${idx}].contract must be a valid 0x address`);
    }
    if (
      typeof entry.tokenId !== 'string' &&
      typeof entry.tokenId !== 'number' &&
      typeof entry.tokenId !== 'bigint'
    ) {
      throw new Error(`tokens[${idx}].tokenId must be a string, number, or bigint`);
    }
    return {
      contract: getAddress(entry.contract) as Address,
      tokenId: typeof entry.tokenId === 'bigint' ? entry.tokenId : String(entry.tokenId),
    };
  });
}

export interface AllowListFileShape {
  addresses?: Address[];
  root?: `0x${string}`;
  endTimestamp?: string | number;
}

/**
 * Allowlist input accepts:
 *   1. ["0x..", "0x.."]
 *   2. {addresses: ["0x.."], root?: "0x..", endTimestamp?: ...}
 * If `root` is present, it is recomputed and verified against the addresses.
 */
export async function loadAllowList(
  path: string,
): Promise<{ addresses: Address[]; expectedRoot?: `0x${string}`; endTimestamp?: bigint }> {
  const text = await readFile(path, 'utf8');
  const parsed = JSON.parse(text);

  let rawAddresses: unknown[];
  let expectedRoot: `0x${string}` | undefined;
  let endTimestamp: bigint | undefined;

  if (Array.isArray(parsed)) {
    rawAddresses = parsed;
  } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.addresses)) {
    rawAddresses = parsed.addresses;
    if (parsed.root !== undefined && parsed.root !== null) {
      assertHexRoot(parsed.root, 'allowList.root');
      expectedRoot = parsed.root;
    }
    if (parsed.endTimestamp !== undefined && parsed.endTimestamp !== null) {
      endTimestamp = toInteger(parsed.endTimestamp as IntegerInput, 'allowList.endTimestamp');
    }
  } else {
    throw new Error('Allowlist file must be a string[] or {addresses: string[]}');
  }

  const addresses = rawAddresses.map((a, idx) => {
    if (typeof a !== 'string' || !isAddress(a)) {
      throw new Error(`addresses[${idx}] must be a valid 0x address`);
    }
    return getAddress(a) as Address;
  });

  if (expectedRoot) {
    const { root } = buildAllowListTree(addresses);
    if (root.toLowerCase() !== expectedRoot.toLowerCase()) {
      throw new Error(
        `Allowlist root mismatch: file says ${expectedRoot}, recomputed ${root}`,
      );
    }
  }

  return { addresses, expectedRoot, endTimestamp };
}

export { ZERO_ROOT };
