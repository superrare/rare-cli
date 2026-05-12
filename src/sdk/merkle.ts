import { Buffer } from 'node:buffer';
import { readFile, writeFile } from 'node:fs/promises';
import { MerkleTree } from 'merkletreejs';
import {
  encodePacked,
  getAddress,
  isAddress,
  isAddressEqual,
  isHex,
  keccak256,
  type Address,
} from 'viem';
import { toInteger } from './helpers.js';
import type {
  BatchListingProofArtifact,
  BatchListingRootArtifact,
  BatchListingTokenEntry,
  IntegerInput,
} from './types.js';

export type BuildRootArtifactInput = {
  tokens: BatchListingTokenEntry[];
  currency: Address;
  amount: bigint;
  splitAddresses?: Address[];
  splitRatios?: number[];
  allowListAddresses?: Address[];
  allowListEndTimestamp?: IntegerInput;
}

export type BuildBatchListingTreeResult = {
  root: `0x${string}`;
  tree: MerkleTree;
  sortedTokens: { contract: Address; tokenId: string }[];
}

export type BuildAllowListTreeResult = {
  root: `0x${string}`;
  tree: MerkleTree;
  sortedAddresses: Address[];
}

type NormalizedTokenEntry = {
  contract: Address;
  tokenId: string;
  tokenIdBigInt: bigint;
};

type AllowListFile = {
  addresses: Address[];
  expectedRoot?: `0x${string}`;
  endTimestamp?: bigint;
};

type AllowListProofFields = {
  allowListProof: `0x${string}`[];
  allowListAddress: Address;
};

export const ZERO_ROOT = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

function hexBuffer(hex: string): Buffer {
  return Buffer.from(hex.startsWith('0x') ? hex.slice(2) : hex, 'hex');
}

function tokenLeaf(contract: Address, tokenId: bigint): Buffer {
  const packed = encodePacked(['address', 'uint256'], [contract, tokenId]);
  return hexBuffer(keccak256(packed));
}

function addressLeaf(address: Address): Buffer {
  return hexBuffer(keccak256(address));
}

function parseBytes32(value: string, field: string): `0x${string}` {
  if (!isHex(value) || value.length !== 66) {
    throw new Error(`${field} must be a 0x-prefixed bytes32 hex string`);
  }
  return value;
}

function parseBytes32Array(values: string[], field: string): `0x${string}`[] {
  return values.map((value, index) => parseBytes32(value, `${field}[${index}]`));
}

function compareTokenEntries(a: NormalizedTokenEntry, b: NormalizedTokenEntry): number {
  if (!isAddressEqual(a.contract, b.contract)) {
    return a.contract.localeCompare(b.contract);
  }
  return a.tokenId.localeCompare(b.tokenId);
}

function normalizeTokenEntry(token: BatchListingTokenEntry): NormalizedTokenEntry {
  if (!isAddress(token.contract)) {
    throw new Error(`Invalid token contract address: ${token.contract}`);
  }
  return {
    contract: getAddress(token.contract),
    tokenId: String(token.tokenId),
    tokenIdBigInt: toInteger(token.tokenId, 'tokenId'),
  };
}

export function buildBatchListingTree(
  tokens: BatchListingTokenEntry[],
): BuildBatchListingTreeResult {
  if (tokens.length === 0) {
    throw new Error('buildBatchListingTree requires at least one token');
  }

  const sorted = tokens.map(normalizeTokenEntry).sort(compareTokenEntries);
  const leaves = sorted.map((token) => tokenLeaf(token.contract, token.tokenIdBigInt));
  const tree = new MerkleTree(leaves, (data: Buffer) => hexBuffer(keccak256(data)), {
    sortPairs: true,
  });

  return {
    root: parseBytes32(tree.getHexRoot(), 'root'),
    tree,
    sortedTokens: sorted.map(({ contract, tokenId }) => ({ contract, tokenId })),
  };
}

export function buildAllowListTree(addresses: Address[]): BuildAllowListTreeResult {
  if (addresses.length === 0) {
    throw new Error('buildAllowListTree requires at least one address');
  }

  const sorted = addresses
    .map((address) => {
      if (!isAddress(address)) throw new Error(`Invalid allowlist address: ${address}`);
      return getAddress(address);
    })
    .sort((a, b) => a.localeCompare(b));
  const leaves = sorted.map(addressLeaf);
  const tree = new MerkleTree(leaves, (data: Buffer) => hexBuffer(keccak256(data)), {
    sortPairs: true,
  });

  return {
    root: parseBytes32(tree.getHexRoot(), 'root'),
    tree,
    sortedAddresses: sorted,
  };
}

export function getTokenProof(
  tree: MerkleTree,
  contract: Address,
  tokenId: bigint,
): `0x${string}`[] {
  const leaf = tokenLeaf(getAddress(contract), tokenId);
  return parseBytes32Array(tree.getHexProof(leaf), 'proof');
}

export function getAddressProof(tree: MerkleTree, address: Address): `0x${string}`[] {
  const leaf = addressLeaf(getAddress(address));
  return parseBytes32Array(tree.getHexProof(leaf), 'proof');
}

export function buildRootArtifact(input: BuildRootArtifactInput): BatchListingRootArtifact {
  const { root: nftRoot, sortedTokens } = buildBatchListingTree(input.tokens);
  const splitAddresses = input.splitAddresses ?? [];
  const splitRatios = input.splitRatios ?? [];

  validateSplits(splitAddresses, splitRatios);

  const allowList = input.allowListAddresses !== undefined && input.allowListAddresses.length > 0
    ? buildAllowListArtifact(input.allowListAddresses, input.allowListEndTimestamp)
    : undefined;

  return {
    root: nftRoot,
    currency: getAddress(input.currency),
    amount: input.amount.toString(),
    splitAddresses: splitAddresses.map((address) => getAddress(address)),
    splitRatios,
    tokens: sortedTokens.map((token) => ({ contract: token.contract, tokenId: token.tokenId })),
    ...(allowList === undefined ? {} : { allowList }),
  };
}

function validateSplits(splitAddresses: Address[], splitRatios: number[]): void {
  if (splitAddresses.length !== splitRatios.length) {
    throw new Error('splitAddresses and splitRatios must have the same length');
  }
  if (splitRatios.length === 0) return;

  const sum = splitRatios.reduce((acc, ratio) => acc + ratio, 0);
  if (sum !== 100) {
    throw new Error(`splitRatios must sum to 100, got ${sum}`);
  }
  splitRatios.forEach((ratio) => {
    if (!Number.isInteger(ratio) || ratio < 0 || ratio > 255) {
      throw new Error(`splitRatios entries must be uint8 (0-255), got ${ratio}`);
    }
  });
}

function buildAllowListArtifact(
  allowListAddresses: Address[],
  allowListEndTimestamp: IntegerInput | undefined,
): NonNullable<BatchListingRootArtifact['allowList']> {
  const { root, sortedAddresses } = buildAllowListTree(allowListAddresses);
  return {
    root,
    addresses: sortedAddresses,
    ...(allowListEndTimestamp === undefined
      ? {}
      : { endTimestamp: toInteger(allowListEndTimestamp, 'allowListEndTimestamp').toString() }),
  };
}

export function buildProofArtifact(
  artifact: BatchListingRootArtifact,
  contract: Address,
  tokenId: IntegerInput,
  buyer?: Address,
): BatchListingProofArtifact {
  const tokenIdBig = toInteger(tokenId, 'tokenId');
  const contractChecksum = getAddress(contract);
  const found = artifact.tokens.find(
    (token) => isAddressEqual(token.contract, contractChecksum) && BigInt(token.tokenId) === tokenIdBig,
  );

  if (found === undefined) {
    throw new Error(
      `Token ${contractChecksum}/${tokenIdBig.toString()} is not in this root artifact's token set`,
    );
  }

  const { tree, root } = buildBatchListingTree(
    artifact.tokens.map((token) => ({ contract: token.contract, tokenId: token.tokenId })),
  );
  if (root !== artifact.root) {
    throw new Error(
      `Recomputed NFT tree root (${root}) does not match artifact root (${artifact.root}). Artifact is corrupt or tree encoding has drifted.`,
    );
  }

  const allowListProofFields = buildAllowListProofFields(artifact, buyer);
  return {
    root: artifact.root,
    contract: contractChecksum,
    tokenId: tokenIdBig.toString(),
    proof: getTokenProof(tree, contractChecksum, tokenIdBig),
    ...(allowListProofFields ?? {}),
  };
}

function buildAllowListProofFields(
  artifact: BatchListingRootArtifact,
  buyer: Address | undefined,
): AllowListProofFields | undefined {
  if (artifact.allowList === undefined) return undefined;
  if (buyer === undefined) {
    throw new Error(
      'This root has an allowlist; pass buyer address to buildProofArtifact to include allowListProof',
    );
  }
  if (!isAddress(buyer)) throw new Error(`Invalid buyer address: ${buyer}`);

  const buyerChecksum = getAddress(buyer);
  const inAllowList = artifact.allowList.addresses.some((address) => isAddressEqual(address, buyerChecksum));
  if (!inAllowList) {
    throw new Error(`Buyer ${buyerChecksum} is not in the allowlist`);
  }

  const { tree, root } = buildAllowListTree(artifact.allowList.addresses);
  if (root !== artifact.allowList.root) {
    throw new Error(
      `Recomputed allowlist root (${root}) does not match artifact (${artifact.allowList.root})`,
    );
  }

  return {
    allowListProof: getAddressProof(tree, buyerChecksum),
    allowListAddress: buyerChecksum,
  };
}

function assertRecord(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be a JSON object`);
  }
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
  assertRecord(value, 'Root artifact');
  assertHexRoot(value.root, 'root');
  assertAddress(value.currency, 'currency');
  if (typeof value.amount !== 'string') throw new Error('amount must be a string (base units)');
  if (!Array.isArray(value.splitAddresses)) throw new Error('splitAddresses must be an array');
  if (!Array.isArray(value.splitRatios)) throw new Error('splitRatios must be an array');
  if (!Array.isArray(value.tokens) || value.tokens.length === 0) {
    throw new Error('tokens must be a non-empty array');
  }
  value.tokens.forEach((token) => {
    assertRecord(token, 'tokens[]');
    assertAddress(token.contract, 'tokens[].contract');
    if (typeof token.tokenId !== 'string') throw new Error('tokens[].tokenId must be a string');
  });
  if (value.allowList !== undefined && value.allowList !== null) {
    assertRecord(value.allowList, 'allowList');
    assertHexRoot(value.allowList.root, 'allowList.root');
    if (!Array.isArray(value.allowList.addresses)) throw new Error('allowList.addresses must be an array');
  }
}

export function validateProofArtifact(value: unknown): asserts value is BatchListingProofArtifact {
  assertRecord(value, 'Proof artifact');
  assertHexRoot(value.root, 'root');
  assertAddress(value.contract, 'contract');
  if (typeof value.tokenId !== 'string') throw new Error('tokenId must be a string');
  if (!Array.isArray(value.proof)) throw new Error('proof must be an array of bytes32 hex');
  value.proof.forEach((proof) => {
    assertHexRoot(proof, 'proof entry');
  });
  if (value.allowListProof !== undefined && value.allowListProof !== null) {
    if (!Array.isArray(value.allowListProof)) throw new Error('allowListProof must be an array');
  }
}

function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

export async function loadRootArtifact(path: string): Promise<BatchListingRootArtifact> {
  const parsed = parseJson(await readFile(path, 'utf8'));
  validateRootArtifact(parsed);
  return parsed;
}

export async function loadProofArtifact(path: string): Promise<BatchListingProofArtifact> {
  const parsed = parseJson(await readFile(path, 'utf8'));
  validateProofArtifact(parsed);
  return parsed;
}

export async function writeArtifact(path: string, data: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * Token-set input file accepts two shapes:
 *   1. [{contract, tokenId}, ...]
 *   2. {tokens: [{chainId?, contract, tokenId}, ...]}
 * Detection is by top-level type (array vs object).
 */
export async function loadTokenSet(path: string): Promise<BatchListingTokenEntry[]> {
  return parseTokenSet(parseJson(await readFile(path, 'utf8')));
}

function parseTokenSet(value: unknown): BatchListingTokenEntry[] {
  const rawTokens = Array.isArray(value) ? value : getTokenSetTokens(value);
  if (rawTokens.length === 0) throw new Error('Token-set file is empty');
  return rawTokens.map(parseTokenSetEntry);
}

function getTokenSetTokens(value: unknown): unknown[] {
  assertRecord(value, 'Token-set file');
  if (!Array.isArray(value.tokens)) {
    throw new Error('Token-set file must be a JSON array or an object with a "tokens" array');
  }
  return value.tokens;
}

function parseTokenSetEntry(entry: unknown, index: number): BatchListingTokenEntry {
  assertRecord(entry, `tokens[${index}]`);
  assertAddress(entry.contract, `tokens[${index}].contract`);
  if (
    typeof entry.tokenId !== 'string' &&
    typeof entry.tokenId !== 'number' &&
    typeof entry.tokenId !== 'bigint'
  ) {
    throw new Error(`tokens[${index}].tokenId must be a string, number, or bigint`);
  }
  return {
    contract: getAddress(entry.contract),
    tokenId: typeof entry.tokenId === 'bigint' ? entry.tokenId : String(entry.tokenId),
  };
}

/**
 * Allowlist input accepts:
 *   1. ["0x..", "0x.."]
 *   2. {addresses: ["0x.."], root?: "0x..", endTimestamp?: ...}
 * If `root` is present, it is recomputed and verified against the addresses.
 */
export async function loadAllowList(path: string): Promise<AllowListFile> {
  const allowList = parseAllowList(parseJson(await readFile(path, 'utf8')));
  verifyExpectedAllowListRoot(allowList);
  return allowList;
}

function parseAllowList(value: unknown): AllowListFile {
  if (Array.isArray(value)) {
    return { addresses: value.map(parseAllowListAddress) };
  }

  assertRecord(value, 'Allowlist file');
  if (!Array.isArray(value.addresses)) {
    throw new Error('Allowlist file must be a string[] or {addresses: string[]}');
  }

  return {
    addresses: value.addresses.map(parseAllowListAddress),
    ...parseOptionalAllowListRoot(value.root),
    ...parseOptionalAllowListEndTimestamp(value.endTimestamp),
  };
}

function parseAllowListAddress(value: unknown, index: number): Address {
  if (typeof value !== 'string' || !isAddress(value)) {
    throw new Error(`addresses[${index}] must be a valid 0x address`);
  }
  return getAddress(value);
}

function parseOptionalAllowListRoot(value: unknown): Pick<AllowListFile, 'expectedRoot'> {
  if (value === undefined || value === null) return {};
  assertHexRoot(value, 'allowList.root');
  return { expectedRoot: value };
}

function parseOptionalAllowListEndTimestamp(value: unknown): Pick<AllowListFile, 'endTimestamp'> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') {
    throw new Error('allowList.endTimestamp must be a string, number, or bigint');
  }
  return { endTimestamp: toInteger(value, 'allowList.endTimestamp') };
}

function verifyExpectedAllowListRoot(allowList: AllowListFile): void {
  if (allowList.expectedRoot === undefined) return;

  const { root } = buildAllowListTree(allowList.addresses);
  if (root !== allowList.expectedRoot) {
    throw new Error(
      `Allowlist root mismatch: file says ${allowList.expectedRoot}, recomputed ${root}`,
    );
  }
}
