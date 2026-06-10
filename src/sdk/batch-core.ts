import {
  concatHex,
  encodePacked,
  getAddress,
  isAddress,
  isAddressEqual,
  isHex,
  keccak256,
  maxUint256,
  type Address,
  type Hex,
} from 'viem';
import {
  toNonNegativeInteger,
  toPositiveInteger,
} from './amounts-core.js';
import type { IntegerInput } from './types/common.js';

export type BatchTokenListInputFormat = 'csv' | 'json';

export type BatchToken = {
  contractAddress: Address;
  tokenId: string;
  chainId?: number;
};

export type BatchTokenTreeEntry = BatchToken & {
  leaf: Hex;
  proof: Hex[];
};

export type BatchTokenListArtifact = {
  version: 1;
  type: 'rare-batch-token-list';
  root: Hex;
  count: number;
  chainId?: number;
  tokens: BatchToken[];
  entries: BatchTokenTreeEntry[];
};

export type BatchTokenProofArtifact = {
  version: 1;
  type: 'rare-batch-token-proof';
  root: Hex;
  contractAddress: Address;
  tokenId: string;
  chainId?: number;
  leaf: Hex;
  proof: Hex[];
  valid: boolean;
};

export type BatchTokenProofInput = {
  root?: Hex;
  contractAddress?: Address;
  tokenId?: string;
  chainId?: number;
  proof: Hex[];
};

export type BuildBatchTokenTreeParams = {
  content: string;
  format?: BatchTokenListInputFormat;
  sourceName?: string;
  chainId?: IntegerInput;
};

export type BatchTokenProofParams = {
  artifact: BatchTokenListArtifact;
  contractAddress: Address;
  tokenId: IntegerInput;
  chainId?: IntegerInput;
};

export type BatchTokenProofVerifyParams = {
  root: Hex;
  contractAddress: Address;
  tokenId: IntegerInput;
  proof: readonly Hex[];
};

export type UtilsTreeToken = BatchToken;
export type UtilsTreeArtifact = BatchTokenListArtifact;
export type UtilsTreeEntry = BatchTokenTreeEntry;
export type UtilsTreeProofArtifact = BatchTokenProofArtifact;
export type BuildUtilsTreeParams = BuildBatchTokenTreeParams;
export type UtilsTreeProofParams = BatchTokenProofParams;
export type UtilsTreeProofVerifyParams = BatchTokenProofVerifyParams;

type RawBatchToken = {
  contractAddress: string;
  tokenId: IntegerInput;
  chainId?: IntegerInput;
};

const contractColumnNames = [
  'contract',
  'contract address',
  'contractAddress',
  'contract_address',
  'collection',
  'collection address',
  'collectionAddress',
  'token contract',
  'tokenContract',
] as const;

const tokenIdColumnNames = [
  'token id',
  'tokenId',
  'token_id',
  'id',
  'nft id',
] as const;

const chainIdColumnNames = [
  'chain id',
  'chainId',
  'chain_id',
  'chain',
] as const;

export function buildBatchTokenTreeArtifact(
  params: BuildBatchTokenTreeParams,
): BatchTokenListArtifact {
  const tokens = parseBatchTokenList(params);
  const leaves = tokens.map((token) => hashBatchToken(token.contractAddress, token.tokenId));
  const levels = buildMerkleLevels(leaves);
  const root = levels.at(-1)?.[0];

  if (root === undefined) {
    throw new Error('Batch token list must include at least one token.');
  }

  const chainId = inferArtifactChainId(tokens);
  return {
    version: 1,
    type: 'rare-batch-token-list',
    root,
    count: tokens.length,
    ...(chainId === undefined ? {} : { chainId }),
    tokens,
    entries: tokens.map((token, index) => buildBatchTokenTreeEntry(token, leaves, levels, index)),
  };
}

export function parseBatchTokenList(params: BuildBatchTokenTreeParams): BatchToken[] {
  const format = params.format ?? detectBatchTokenInputFormat(params.content, params.sourceName);
  const rawTokens = format === 'json'
    ? parseJsonBatchTokens(params.content)
    : parseCsvBatchTokens(params.content);

  return normalizeBatchTokens(rawTokens, params.chainId);
}

export function parseBatchTokenListArtifact(
  content: string,
  chainIdInput?: IntegerInput,
): BatchTokenListArtifact {
  const parsed: unknown = parseJson(content, 'batch token artifact');

  if (!isRecord(parsed)) {
    throw new Error('Batch token artifact must be a JSON object.');
  }
  if (
    parsed.type !== undefined &&
    parsed.type !== 'rare-batch-token-list'
  ) {
    throw new Error('Batch token artifact type must be "rare-batch-token-list".');
  }
  if (parsed.type === undefined && !isUntypedBatchTokenListArtifactLike(parsed)) {
    throw new Error('Batch token artifact type must be "rare-batch-token-list".');
  }
  if (parsed.version !== undefined && parsed.version !== 1) {
    throw new Error('Batch token artifact version must be 1.');
  }
  if (typeof parsed.root !== 'string') {
    throw new Error('Batch token artifact root must be a bytes32 hex string.');
  }
  if (!Array.isArray(parsed.tokens)) {
    throw new Error('Batch token artifact tokens must be an array.');
  }

  const parsedChainId = parsed.chainId === undefined ? undefined : parseUnknownInteger(parsed.chainId, 'artifact chainId');
  const expectedChainId = chainIdInput === undefined ? undefined : normalizeChainId(chainIdInput, 'chainId');
  const artifactChainId = parsedChainId ?? expectedChainId;

  if (
    parsedChainId !== undefined &&
    expectedChainId !== undefined &&
    normalizeChainId(parsedChainId, 'artifact chainId') !== expectedChainId
  ) {
    throw new Error(
      `Input chainId ${normalizeChainId(parsedChainId, 'artifact chainId')} does not match --chain-id ${expectedChainId}.`,
    );
  }

  const artifact = buildBatchTokenTreeArtifact({
    content: JSON.stringify(parsed.tokens),
    format: 'json',
    sourceName: 'batch token artifact tokens',
    chainId: artifactChainId,
  });
  const root = normalizeBytes32(parsed.root, 'artifact root');

  if (typeof parsed.count === 'number' && parsed.count !== artifact.count) {
    throw new Error('Batch token artifact count does not match its token list.');
  }
  if (artifact.root !== root) {
    throw new Error('Batch token artifact root does not match its token list.');
  }

  return artifact;
}

export function parseBatchTokenListArtifactOrBuild(
  params: BuildBatchTokenTreeParams,
): BatchTokenListArtifact {
  if (params.content.trimStart().startsWith('{')) {
    const parsed: unknown = parseJson(params.content, 'batch token JSON');
    if (isRecord(parsed) && (
      parsed.type === 'rare-batch-token-list' ||
      isUntypedBatchTokenListArtifactLike(parsed)
    )) {
      return parseBatchTokenListArtifact(params.content, params.chainId);
    }
  }

  return buildBatchTokenTreeArtifact(params);
}

function isUntypedBatchTokenListArtifactLike(value: Record<string, unknown>): boolean {
  return (
    typeof value.root === 'string' &&
    Array.isArray(value.tokens) &&
    !('currency' in value) &&
    !('amount' in value) &&
    !('splitAddresses' in value) &&
    !('splitRatios' in value)
  );
}

export function getBatchTokenProof(params: BatchTokenProofParams): BatchTokenProofArtifact {
  const contractAddress = normalizeAddressValue(params.contractAddress, 'contractAddress');
  const tokenId = normalizeTokenId(params.tokenId, 'tokenId');
  const chainId = params.chainId === undefined
    ? params.artifact.chainId
    : normalizeChainId(params.chainId, 'chainId');

  if (
    params.artifact.chainId !== undefined &&
    chainId !== undefined &&
    chainId !== params.artifact.chainId
  ) {
    throw new Error(`Token chainId ${chainId} does not match artifact chainId ${params.artifact.chainId}.`);
  }

  const entry = params.artifact.entries.find((candidate) => (
    isAddressEqual(candidate.contractAddress, contractAddress) &&
    candidate.tokenId === tokenId
  ));

  if (entry === undefined) {
    throw new Error(`Token ${contractAddress} #${tokenId} is not present in the batch token list.`);
  }

  return {
    version: 1,
    type: 'rare-batch-token-proof',
    root: params.artifact.root,
    contractAddress: entry.contractAddress,
    tokenId: entry.tokenId,
    ...(chainId === undefined ? {} : { chainId }),
    leaf: entry.leaf,
    proof: entry.proof,
    valid: verifyBatchTokenProof({
      root: params.artifact.root,
      contractAddress: entry.contractAddress,
      tokenId: entry.tokenId,
      proof: entry.proof,
    }),
  };
}

export function verifyBatchTokenProof(params: BatchTokenProofVerifyParams): boolean {
  const root = normalizeBytes32(params.root, 'root');
  const proof = params.proof.map((entry, index) => normalizeBytes32(entry, `proof[${index}]`));
  const computedRoot = proof.reduce(
    (hash, proofItem) => parentHash(hash, proofItem),
    hashBatchToken(params.contractAddress, params.tokenId),
  );

  return computedRoot === root;
}

export function parseBatchTokenProofArtifact(content: string): BatchTokenProofArtifact {
  const parsed: unknown = parseJson(content, 'batch token proof artifact');

  if (!isRecord(parsed)) {
    throw new Error('Batch token proof artifact must be a JSON object.');
  }
  if (parsed.type !== 'rare-batch-token-proof') {
    throw new Error('Batch token proof artifact type must be "rare-batch-token-proof".');
  }
  if (parsed.version !== 1) {
    throw new Error('Batch token proof artifact version must be 1.');
  }
  if (typeof parsed.root !== 'string') {
    throw new Error('Batch token proof artifact root must be a bytes32 hex string.');
  }
  if (typeof parsed.contractAddress !== 'string') {
    throw new Error('Batch token proof artifact contractAddress must be a valid 0x address.');
  }
  if (parsed.tokenId === undefined) {
    throw new Error('Batch token proof artifact tokenId is required.');
  }
  if (!Array.isArray(parsed.proof)) {
    throw new Error('Batch token proof artifact proof must be an array.');
  }

  const contractAddress = normalizeAddressValue(parsed.contractAddress, 'proof contractAddress');
  const tokenId = normalizeTokenId(parseUnknownInteger(parsed.tokenId, 'proof tokenId'), 'proof tokenId');
  const root = normalizeBytes32(parsed.root, 'proof root');
  const proof = parsed.proof.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw new Error(`proof[${index}] must be a bytes32 hex string.`);
    }
    return normalizeBytes32(entry, `proof[${index}]`);
  });
  const leaf = hashBatchToken(contractAddress, tokenId);

  if (parsed.leaf !== undefined) {
    if (typeof parsed.leaf !== 'string') {
      throw new Error('Batch token proof artifact leaf must be a bytes32 hex string.');
    }
    const parsedLeaf = normalizeBytes32(parsed.leaf, 'proof leaf');
    if (parsedLeaf !== leaf) {
      throw new Error('Batch token proof artifact leaf does not match its contractAddress and tokenId.');
    }
  }

  const valid = verifyBatchTokenProof({
    root,
    contractAddress,
    tokenId,
    proof,
  });
  const chainId = parsed.chainId === undefined
    ? undefined
    : normalizeChainId(parseUnknownInteger(parsed.chainId, 'proof chainId'), 'proof chainId');

  return {
    version: 1,
    type: 'rare-batch-token-proof',
    root,
    contractAddress,
    tokenId,
    ...(chainId === undefined ? {} : { chainId }),
    leaf,
    proof,
    valid,
  };
}

export function parseBatchTokenProofInput(content: string): BatchTokenProofInput {
  const parsed: unknown = parseJson(content, '--proof JSON');

  if (isRecord(parsed) && parsed.type === 'rare-batch-token-proof') {
    const proof = parseBatchTokenProofArtifact(content);
    return {
      root: proof.root,
      contractAddress: proof.contractAddress,
      tokenId: proof.tokenId,
      chainId: proof.chainId,
      proof: proof.proof,
    };
  }

  const proof = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.proof)
      ? parsed.proof
      : undefined;

  if (proof === undefined) {
    throw new Error('--proof must be a JSON array or an object with a proof array.');
  }

  const root = isRecord(parsed) && typeof parsed.root === 'string'
    ? normalizeBytes32(parsed.root, 'proof root')
    : undefined;

  return {
    ...(root === undefined ? {} : { root }),
    proof: proof.map((entry, index) => {
      if (typeof entry !== 'string') {
        throw new Error(`proof[${index}] must be a bytes32 hex string.`);
      }
      return normalizeBytes32(entry, `proof[${index}]`);
    }),
  };
}

export function validateBatchTokenProofInputMatchesTarget(
  proofInput: BatchTokenProofInput | undefined,
  target: {
    artifact: BatchTokenListArtifact;
    contractAddress: Address;
    tokenId: IntegerInput;
    root: Hex;
    allowRootOverride: boolean;
  },
): void {
  if (proofInput === undefined) {
    return;
  }
  if (
    proofInput.root !== undefined &&
    !target.allowRootOverride &&
    proofInput.root !== target.artifact.root
  ) {
    throw new Error('Proof root does not match the input token list root.');
  }
  if (
    proofInput.root !== undefined &&
    target.allowRootOverride &&
    proofInput.root !== target.root
  ) {
    throw new Error('Proof root does not match --root.');
  }
  if (
    proofInput.contractAddress !== undefined &&
    !isAddressEqual(proofInput.contractAddress, target.contractAddress)
  ) {
    throw new Error('Proof artifact contractAddress does not match --contract.');
  }
  if (proofInput.tokenId !== undefined && proofInput.tokenId !== normalizeTokenId(target.tokenId, '--token-id')) {
    throw new Error('Proof artifact tokenId does not match --token-id.');
  }
  if (
    proofInput.chainId !== undefined &&
    target.artifact.chainId !== undefined &&
    proofInput.chainId !== target.artifact.chainId
  ) {
    throw new Error('Proof artifact chainId does not match the input token list chainId.');
  }
}

export function hashBatchToken(contractAddress: Address, tokenId: IntegerInput): Hex {
  const normalizedAddress = normalizeAddressValue(contractAddress, 'contractAddress');
  const normalizedTokenId = normalizeTokenId(tokenId, 'tokenId');
  return keccak256(encodePacked(['address', 'uint256'], [normalizedAddress, BigInt(normalizedTokenId)]));
}

export function normalizeBytes32(value: string, field: string): Hex {
  if (!isHex(value, { strict: true }) || value.length !== 66) {
    throw new Error(`${field} must be a bytes32 hex string.`);
  }

  const normalized = value.toLocaleLowerCase();
  if (!isHex(normalized, { strict: true }) || normalized.length !== 66) {
    throw new Error(`${field} must be a bytes32 hex string.`);
  }
  return normalized;
}

function detectBatchTokenInputFormat(
  content: string,
  sourceName: string | undefined,
): BatchTokenListInputFormat {
  const lowerSource = sourceName?.toLowerCase();
  if (lowerSource?.endsWith('.json')) {
    return 'json';
  }
  if (lowerSource?.endsWith('.csv')) {
    return 'csv';
  }
  const trimmed = content.trimStart();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return 'json';
  }
  return 'csv';
}

function parseJsonBatchTokens(content: string): RawBatchToken[] {
  const parsed: unknown = parseJson(content, 'batch token JSON');
  const entries = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.tokens)
      ? parsed.tokens
      : undefined;

  if (entries === undefined) {
    throw new Error('Batch token JSON must be an array of token objects or an object with a tokens array.');
  }

  return entries.map((entry, index) => extractJsonBatchToken(entry, index));
}

function parseCsvBatchTokens(content: string): RawBatchToken[] {
  const rows = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line, index) => parseCsvRow(line, index + 1))
    .filter((row) => row.some((cell) => cell.length > 0));
  const [firstRow] = rows;

  if (firstRow === undefined) {
    throw new Error('Batch token CSV must include at least one token.');
  }

  const contractIndex = firstRow.findIndex(isContractColumnName);
  const tokenIdIndex = firstRow.findIndex(isTokenIdColumnName);
  const chainIdIndex = firstRow.findIndex(isChainIdColumnName);

  if (contractIndex >= 0 && tokenIdIndex >= 0) {
    return rows.slice(1).map((row, index) => extractCsvBatchToken(row, {
      rowNumber: index + 2,
      contractIndex,
      tokenIdIndex,
      chainIdIndex,
    }));
  }

  const firstContractCell = firstRow[0];
  if (firstRow.length >= 2 && firstContractCell !== undefined && isAddress(firstContractCell)) {
    return rows.map((row, index) => extractCsvBatchToken(row, {
      rowNumber: index + 1,
      contractIndex: 0,
      tokenIdIndex: 1,
      chainIdIndex: row.length > 2 ? 2 : -1,
    }));
  }

  throw new Error('Batch token CSV must include contract address and token ID columns.');
}

function extractCsvBatchToken(
  row: string[],
  opts: {
    rowNumber: number;
    contractIndex: number;
    tokenIdIndex: number;
    chainIdIndex: number;
  },
): RawBatchToken {
  const contractAddress = row[opts.contractIndex];
  const tokenId = row[opts.tokenIdIndex];
  const chainId = opts.chainIdIndex >= 0 ? row[opts.chainIdIndex] : undefined;

  if (contractAddress === undefined || contractAddress.length === 0) {
    throw new Error(`Batch token CSV row ${opts.rowNumber} is missing a contract address.`);
  }
  if (tokenId === undefined || tokenId.length === 0) {
    throw new Error(`Batch token CSV row ${opts.rowNumber} is missing a token ID.`);
  }

  return {
    contractAddress,
    tokenId,
    ...(chainId === undefined || chainId.length === 0 ? {} : { chainId }),
  };
}

type CsvParseState = {
  fields: string[];
  current: string;
  inQuotes: boolean;
  skipNext: boolean;
};

function parseCsvRow(line: string, rowNumber: number): string[] {
  const parsed = Array.from(line).reduce<CsvParseState>((state, char, index) => {
    if (state.skipNext) {
      return { ...state, skipNext: false };
    }

    if (state.inQuotes) {
      if (char === '"' && line[index + 1] === '"') {
        return { ...state, current: `${state.current}"`, skipNext: true };
      }
      if (char === '"') {
        return { ...state, inQuotes: false };
      }
      return { ...state, current: `${state.current}${char}` };
    }

    if (char === ',') {
      return {
        ...state,
        fields: [...state.fields, state.current.trim()],
        current: '',
      };
    }
    if (char === '"') {
      if (state.current.trim().length > 0) {
        throw new Error(`Malformed batch token CSV row ${rowNumber}: unexpected quote.`);
      }
      return { ...state, inQuotes: true };
    }
    return { ...state, current: `${state.current}${char}` };
  }, {
    fields: [],
    current: '',
    inQuotes: false,
    skipNext: false,
  });

  if (parsed.inQuotes) {
    throw new Error(`Malformed batch token CSV row ${rowNumber}: unterminated quoted field.`);
  }

  return [...parsed.fields, parsed.current.trim()];
}

function extractJsonBatchToken(entry: unknown, index: number): RawBatchToken {
  if (!isRecord(entry)) {
    throw new Error(`Batch token JSON entry ${index} must be an object with contractAddress and tokenId fields.`);
  }

  const contractAddress = readStringField(entry, contractColumnNames);
  const tokenId = readIntegerField(entry, tokenIdColumnNames);
  const chainId = readIntegerField(entry, chainIdColumnNames);

  if (contractAddress === undefined) {
    throw new Error(`Batch token JSON entry ${index} is missing a contractAddress field.`);
  }
  if (tokenId === undefined) {
    throw new Error(`Batch token JSON entry ${index} is missing a tokenId field.`);
  }

  return {
    contractAddress,
    tokenId,
    ...(chainId === undefined ? {} : { chainId }),
  };
}

function normalizeBatchTokens(
  rawTokens: readonly RawBatchToken[],
  chainIdInput: IntegerInput | undefined,
): BatchToken[] {
  if (rawTokens.length === 0) {
    throw new Error('Batch token list must include at least one token.');
  }

  const explicitChainId = chainIdInput === undefined ? undefined : normalizeChainId(chainIdInput, 'chainId');
  const rowChainIds = rawTokens
    .map((token, index) => (
      token.chainId === undefined ? undefined : normalizeChainId(token.chainId, `batch token at index ${index} chainId`)
    ))
    .filter((chainId): chainId is number => chainId !== undefined);
  const uniqueRowChainIds = [...new Set(rowChainIds)];

  if (uniqueRowChainIds.length > 1) {
    throw new Error(`Batch token list must use one chainId; found ${uniqueRowChainIds.join(', ')}.`);
  }
  if (
    explicitChainId !== undefined &&
    uniqueRowChainIds[0] !== undefined &&
    explicitChainId !== uniqueRowChainIds[0]
  ) {
    throw new Error(`Input chainId ${uniqueRowChainIds[0]} does not match --chain-id ${explicitChainId}.`);
  }

  const chainId = explicitChainId ?? uniqueRowChainIds[0];
  const tokens = rawTokens.map((rawToken, index) => normalizeBatchToken(rawToken, index, chainId));
  const duplicate = tokens.find((token, index) => (
    tokens.slice(0, index).some((candidate) => (
      candidate.chainId === token.chainId &&
      candidate.tokenId === token.tokenId &&
      isAddressEqual(candidate.contractAddress, token.contractAddress)
    ))
  ));

  if (duplicate !== undefined) {
    throw new Error(`Duplicate batch token: ${duplicate.contractAddress} #${duplicate.tokenId}.`);
  }

  return [...tokens].sort(compareBatchTokens);
}

function buildBatchTokenTreeEntry(
  token: BatchToken,
  leaves: readonly Hex[],
  levels: readonly Hex[][],
  index: number,
): BatchTokenTreeEntry {
  const leaf = leaves[index];
  if (leaf === undefined) {
    throw new Error(`Missing Merkle leaf for batch token at index ${index}.`);
  }

  return {
    ...token,
    leaf,
    proof: buildMerkleProof(levels, index),
  };
}

function normalizeBatchToken(
  rawToken: RawBatchToken,
  index: number,
  chainId: number | undefined,
): BatchToken {
  return {
    contractAddress: normalizeAddressValue(rawToken.contractAddress, `batch token at index ${index} contractAddress`),
    tokenId: normalizeTokenId(rawToken.tokenId, `batch token at index ${index} tokenId`),
    ...(chainId === undefined ? {} : { chainId }),
  };
}

function normalizeAddressValue(value: string, field: string): Address {
  const trimmed = value.trim();
  if (!isAddress(trimmed)) {
    throw new Error(`${field} must be a valid 0x address.`);
  }

  return getAddress(trimmed);
}

export function normalizeTokenId(value: IntegerInput, field: string): string {
  const normalized = toNonNegativeInteger(normalizeIntegerInput(value, field), field);
  if (normalized > maxUint256) {
    throw new Error(`${field} must fit in uint256.`);
  }
  return normalized.toString();
}

function normalizeChainId(value: IntegerInput, field: string): number {
  const normalized = toPositiveInteger(normalizeIntegerInput(value, field), field);
  if (normalized > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${field} must fit in a safe JavaScript integer.`);
  }
  return Number(normalized);
}

function normalizeIntegerInput(value: IntegerInput, field: string): IntegerInput {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new Error(`${field} must be an integer.`);
    }
    return trimmed;
  }
  return value;
}

function parseUnknownInteger(value: unknown, field: string): IntegerInput {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return value;
  }
  throw new Error(`${field} must be an integer.`);
}

function compareBatchTokens(a: BatchToken, b: BatchToken): number {
  const addressCompare = a.contractAddress.localeCompare(b.contractAddress);
  if (addressCompare !== 0) {
    return addressCompare;
  }
  return a.tokenId.localeCompare(b.tokenId);
}

function inferArtifactChainId(tokens: readonly BatchToken[]): number | undefined {
  const [chainId] = [...new Set(tokens.map((token) => token.chainId))];
  return chainId;
}

function readStringField(
  entry: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  const value = keys
    .map((key) => entry[key])
    .find((candidate) => typeof candidate === 'string');

  return typeof value === 'string' ? value : undefined;
}

function readIntegerField(
  entry: Record<string, unknown>,
  keys: readonly string[],
): IntegerInput | undefined {
  const value = keys
    .map((key) => entry[key])
    .find((candidate) => (
      typeof candidate === 'string' ||
      typeof candidate === 'number' ||
      typeof candidate === 'bigint'
    ));

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return value;
  }
  return undefined;
}

function isContractColumnName(value: string): boolean {
  return isColumnName(value, contractColumnNames);
}

function isTokenIdColumnName(value: string): boolean {
  return isColumnName(value, tokenIdColumnNames);
}

function isChainIdColumnName(value: string): boolean {
  return isColumnName(value, chainIdColumnNames);
}

function isColumnName(value: string, candidates: readonly string[]): boolean {
  const normalized = normalizeColumnName(value);
  return candidates.some((candidate) => normalizeColumnName(candidate) === normalized);
}

function normalizeColumnName(value: string): string {
  return value.trim().replace(/[\s_-]+/g, '').toLowerCase();
}

function buildMerkleLevels(leaves: readonly Hex[]): Hex[][] {
  if (leaves.length === 0) {
    return [];
  }
  if (leaves.length === 1) {
    const [leaf] = leaves;
    return leaf === undefined ? [] : [[leaf]];
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
