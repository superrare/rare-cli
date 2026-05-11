import { concatHex, getAddress, isAddress, isHex, keccak256, type Address, type Hex } from 'viem';
import type { IntegerInput } from './types.js';
import { toNonNegativeInteger } from './helpers.js';

export type ReleaseAllowlistInputFormat = 'csv' | 'json';

export type ReleaseAllowlistEntry = {
  address: Address;
  leaf: Hex;
  proof: Hex[];
};

export type ReleaseAllowlistArtifact = {
  version: 1;
  type: 'rare-release-allowlist';
  root: Hex;
  count: number;
  addresses: Address[];
  entries: ReleaseAllowlistEntry[];
};

export type ReleaseAllowlistProof = {
  root: Hex;
  address: Address;
  leaf: Hex;
  proof: Hex[];
  valid: boolean;
};

export type BuildReleaseAllowlistParams = {
  content: string;
  format?: ReleaseAllowlistInputFormat;
  sourceName?: string;
};

export type ReleaseAllowlistConfigPlan = {
  contract: Address;
  root: Hex;
  endTimestamp: bigint;
};

export type ReleaseLimitPlan = {
  contract: Address;
  limit: bigint;
};

export type ReleaseSellerStakingMinimumPlan = {
  contract: Address;
  minimum: bigint;
  endTimestamp: bigint;
};

const addressColumnNames = [
  'address',
  'user address',
  'wallet',
  'wallet address',
  'walletAddress',
  'Address',
  'ADDRESS',
] as const;

export function buildReleaseAllowlistArtifact(
  params: BuildReleaseAllowlistParams,
): ReleaseAllowlistArtifact {
  const addresses = parseReleaseAllowlistAddresses(params);
  const leaves = addresses.map(hashAllowlistAddress);
  const levels = buildMerkleLevels(leaves);
  const [root] = levels[levels.length - 1];

  if (root === undefined) {
    throw new Error('Allowlist must include at least one address.');
  }

  return {
    version: 1,
    type: 'rare-release-allowlist',
    root,
    count: addresses.length,
    addresses,
    entries: addresses.map((address, index) => ({
      address,
      leaf: leaves[index],
      proof: buildMerkleProof(levels, index),
    })),
  };
}

export function parseReleaseAllowlistAddresses(
  params: BuildReleaseAllowlistParams,
): Address[] {
  const format = params.format ?? detectAllowlistInputFormat(params.content, params.sourceName);
  const rawAddresses = format === 'json'
    ? parseJsonAllowlistAddresses(params.content)
    : parseCsvAllowlistAddresses(params.content);

  return normalizeAllowlistAddresses(rawAddresses);
}

export function parseReleaseAllowlistArtifact(content: string): ReleaseAllowlistArtifact {
  const parsed: unknown = parseJson(content, 'allowlist artifact');

  if (!isRecord(parsed)) {
    throw new Error('Allowlist artifact must be a JSON object.');
  }
  if (parsed.type !== 'rare-release-allowlist') {
    throw new Error('Allowlist artifact type must be "rare-release-allowlist".');
  }
  if (parsed.version !== 1) {
    throw new Error('Allowlist artifact version must be 1.');
  }
  if (typeof parsed.root !== 'string') {
    throw new Error('Allowlist artifact root must be a bytes32 hex string.');
  }
  if (!Array.isArray(parsed.addresses)) {
    throw new Error('Allowlist artifact addresses must be an array.');
  }

  const artifact = buildReleaseAllowlistArtifact({
    content: JSON.stringify(parsed.addresses),
    format: 'json',
    sourceName: 'allowlist artifact addresses',
  });
  const root = normalizeBytes32(parsed.root, 'artifact root');

  if (artifact.root.toLowerCase() !== root.toLowerCase()) {
    throw new Error('Allowlist artifact root does not match its address list.');
  }

  return artifact;
}

export function parseReleaseAllowlistArtifactOrBuild(
  params: BuildReleaseAllowlistParams,
): ReleaseAllowlistArtifact {
  if (params.content.trimStart().startsWith('{')) {
    return parseReleaseAllowlistArtifact(params.content);
  }

  return buildReleaseAllowlistArtifact(params);
}

export function getReleaseAllowlistProof(
  artifact: ReleaseAllowlistArtifact,
  address: Address,
): ReleaseAllowlistProof {
  const normalized = getAddress(address);
  const entry = artifact.entries.find((candidate) => (
    candidate.address.toLowerCase() === normalized.toLowerCase()
  ));

  if (entry === undefined) {
    throw new Error(`Address ${normalized} is not present in the allowlist.`);
  }

  return {
    root: artifact.root,
    address: entry.address,
    leaf: entry.leaf,
    proof: entry.proof,
    valid: verifyReleaseAllowlistProof({
      root: artifact.root,
      address: entry.address,
      proof: entry.proof,
    }),
  };
}

export function verifyReleaseAllowlistProof(params: {
  root: Hex;
  address: Address;
  proof: readonly Hex[];
}): boolean {
  const computedRoot = params.proof.reduce(
    (hash, proofItem) => parentHash(hash, proofItem),
    hashAllowlistAddress(params.address),
  );

  return computedRoot.toLowerCase() === params.root.toLowerCase();
}

export function planReleaseAllowlistConfig(params: {
  contract: Address;
  root: Hex;
  endTimestamp: IntegerInput;
}): ReleaseAllowlistConfigPlan {
  return {
    contract: params.contract,
    root: normalizeBytes32(params.root, 'root'),
    endTimestamp: toNonNegativeInteger(params.endTimestamp, 'endTimestamp'),
  };
}

export function planReleaseMintLimit(params: {
  contract: Address;
  limit: IntegerInput;
}): ReleaseLimitPlan {
  return {
    contract: params.contract,
    limit: toNonNegativeInteger(params.limit, 'limit'),
  };
}

export function planReleaseTxLimit(params: {
  contract: Address;
  limit: IntegerInput;
}): ReleaseLimitPlan {
  return {
    contract: params.contract,
    limit: toNonNegativeInteger(params.limit, 'limit'),
  };
}

export function planReleaseSellerStakingMinimum(params: {
  contract: Address;
  minimum: IntegerInput;
  endTimestamp: IntegerInput;
}): ReleaseSellerStakingMinimumPlan {
  return {
    contract: params.contract,
    minimum: toNonNegativeInteger(params.minimum, 'minimum'),
    endTimestamp: toNonNegativeInteger(params.endTimestamp, 'endTimestamp'),
  };
}

export function normalizeBytes32(value: string, field: string): Hex {
  if (!isHex(value, { strict: true }) || value.length !== 66) {
    throw new Error(`${field} must be a bytes32 hex string.`);
  }

  return value;
}

function detectAllowlistInputFormat(
  content: string,
  sourceName: string | undefined,
): ReleaseAllowlistInputFormat {
  const lowerSource = sourceName?.toLowerCase();
  if (lowerSource?.endsWith('.json')) {
    return 'json';
  }
  if (lowerSource?.endsWith('.csv')) {
    return 'csv';
  }
  if (content.trimStart().startsWith('[')) {
    return 'json';
  }
  return 'csv';
}

function parseJsonAllowlistAddresses(content: string): string[] {
  const parsed: unknown = parseJson(content, 'allowlist JSON');
  if (!Array.isArray(parsed)) {
    throw new Error('Allowlist JSON must be an array of addresses or address objects.');
  }

  return parsed.map((entry, index) => extractJsonAddress(entry, index));
}

function parseCsvAllowlistAddresses(content: string): string[] {
  const rows = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(parseCsvRow)
    .filter((row) => row.some((cell) => cell.length > 0));
  const [firstRow] = rows;

  if (firstRow === undefined) {
    throw new Error('Allowlist CSV must include at least one address.');
  }

  const headerIndex = firstRow.findIndex(isAddressColumnName);
  if (headerIndex >= 0) {
    return rows.slice(1).map((row, index) => {
      const value = row[headerIndex];
      if (value === undefined || value.length === 0) {
        throw new Error(`Allowlist CSV row ${index + 2} is missing an address.`);
      }
      return value;
    });
  }

  if (firstRow.length === 1 && isAddress(firstRow[0])) {
    return rows.map((row, index) => {
      const [value] = row;
      if (value === undefined || value.length === 0) {
        throw new Error(`Allowlist CSV row ${index + 1} is missing an address.`);
      }
      return value;
    });
  }

  throw new Error('Allowlist CSV must include an address column.');
}

function parseCsvRow(line: string): string[] {
  return line.split(',').map((cell) => (
    cell.trim().replace(/^"|"$/g, '').replace(/""/g, '"')
  ));
}

function normalizeAllowlistAddresses(rawAddresses: readonly string[]): Address[] {
  if (rawAddresses.length === 0) {
    throw new Error('Allowlist must include at least one address.');
  }

  const seen = new Set<string>();
  return rawAddresses.map((rawAddress, index) => {
    const address = normalizeAddressValue(rawAddress, `allowlist address at index ${index}`);
    const key = address.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Duplicate allowlist address: ${address}.`);
    }
    seen.add(key);
    return address;
  }).sort((a, b) => a.localeCompare(b));
}

function extractJsonAddress(entry: unknown, index: number): string {
  if (typeof entry === 'string') {
    return entry;
  }
  if (isRecord(entry)) {
    const value = addressColumnNames
      .map((key) => entry[key])
      .find((candidate) => typeof candidate === 'string');

    if (typeof value === 'string') {
      return value;
    }
  }

  throw new Error(`Allowlist JSON entry ${index} must be an address string or object with an address field.`);
}

function normalizeAddressValue(value: string, field: string): Address {
  const trimmed = value.trim();
  if (!isAddress(trimmed)) {
    throw new Error(`${field} must be a valid 0x address.`);
  }

  return getAddress(trimmed);
}

function isAddressColumnName(value: string): boolean {
  const normalized = value.trim().replace(/[\s_-]+/g, '').toLowerCase();
  return normalized === 'address' || normalized === 'useraddress' || normalized === 'wallet' || normalized === 'walletaddress';
}

function hashAllowlistAddress(address: Address): Hex {
  return keccak256(address);
}

function buildMerkleLevels(leaves: readonly Hex[]): Hex[][] {
  if (leaves.length === 0) {
    return [];
  }
  if (leaves.length === 1) {
    return [[leaves[0]]];
  }

  const level = [...leaves];
  return [
    level,
    ...buildMerkleLevels(nextMerkleLevel(level)),
  ];
}

function nextMerkleLevel(level: readonly Hex[]): Hex[] {
  return level
    .filter((_node, index) => index % 2 === 0)
    .map((node, pairIndex) => {
      const sibling = level[(pairIndex * 2) + 1];
      return sibling === undefined ? node : parentHash(node, sibling);
    });
}

function buildMerkleProof(levels: readonly Hex[][], leafIndex: number): Hex[] {
  return levels.slice(0, -1).reduce<{ index: number; proof: Hex[] }>((state, level) => {
    const siblingIndex = state.index % 2 === 0 ? state.index + 1 : state.index - 1;
    const sibling = level[siblingIndex];
    return {
      index: Math.floor(state.index / 2),
      proof: sibling === undefined ? state.proof : [...state.proof, sibling],
    };
  }, { index: leafIndex, proof: [] }).proof;
}

function parentHash(a: Hex, b: Hex): Hex {
  const [left, right] = a <= b ? [a, b] : [b, a];
  return keccak256(concatHex([left, right]));
}

function parseJson(content: string, label: string): unknown {
  try {
    return JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid JSON';
    throw new Error(`Could not parse ${label}: ${message}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
