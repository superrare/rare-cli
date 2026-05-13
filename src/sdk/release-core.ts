import {
  getAddress,
  isAddress,
  isHex,
  keccak256,
  parseEther,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import type {
  AmountInput,
  ReleaseAllowlistConfig,
  IntegerInput,
  ReleaseConfigureParams,
  ReleaseLimitConfig,
  ReleaseSellerStakingMinimum,
  ReleaseStatus,
  TimestampInput,
} from './types.js';
import { ETH_ADDRESS } from '../contracts/addresses.js';
import { toInteger, toNonNegativeInteger } from './helpers.js';

export const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;
export const RELEASE_ALLOWLIST_ARTIFACT_KIND = 'rare-release-allowlist-v1' as const;
const RELEASE_ALLOWLIST_LEAF_ENCODING = 'keccak256(address)' as const;
const RELEASE_ALLOWLIST_TREE = 'sorted-addresses-sort-pairs' as const;

export type ReleaseAllowlistInputFormat = 'csv' | 'json';

export type ReleaseAllowlistWalletProof = {
  address: Address;
  leaf: Hex;
  proof: Hex[];
};

export type ReleaseAllowlistArtifact = {
  kind: typeof RELEASE_ALLOWLIST_ARTIFACT_KIND;
  version: 1;
  leafEncoding: typeof RELEASE_ALLOWLIST_LEAF_ENCODING;
  tree: typeof RELEASE_ALLOWLIST_TREE;
  root: Hex;
  wallets: ReleaseAllowlistWalletProof[];
};

export type ReleaseAllowlistConfigPlan = {
  contract: Address;
  root: Hex;
  endTimestamp: bigint;
};

export type ReleaseLimitConfigPlan = {
  contract: Address;
  limit: bigint;
};

export type ReleaseSellerStakingMinimumPlan = {
  contract: Address;
  amount: bigint;
  endTimestamp: bigint;
};

export type RawDirectSaleConfig = {
  seller: Address;
  currencyAddress: Address;
  price: bigint;
  startTime: bigint;
  maxMints: bigint;
  splitRecipients: readonly Address[];
  splitRatios: readonly number[];
};

export type RawAllowlistConfig = {
  root: `0x${string}`;
  endTimestamp: bigint;
};

export type RawStakingMinimum = {
  amount: bigint;
  endTimestamp: bigint;
};

export type ReleaseConfigurePlan = {
  contract: Address;
  currencyAddress: Address;
  price: bigint;
  startTime: bigint;
  maxMints: bigint;
  splitRecipients: Address[];
  splitRatios: number[];
};

export type ReleaseSplitAccumulator = {
  addresses: Address[];
  ratios: number[];
};

export function requireRareMinterAddress(address: Address | undefined): Address {
  if (!address) {
    throw new Error('RareMinter is not configured for this chain. Supported RareMinter chains: mainnet, sepolia.');
  }
  return address;
}

export function assertReleaseContractOwner(opts: {
  contract: Address;
  accountAddress: Address;
  owner: Address;
}): void {
  const { contract, accountAddress, owner } = opts;
  if (owner.toLowerCase() !== accountAddress.toLowerCase()) {
    throw new Error(
      `Connected wallet ${accountAddress} is not the owner of collection ${contract}. ` +
        `Contract owner is ${owner}.`,
    );
  }
}

export function normalizeReleaseTimestamp(
  value: TimestampInput | undefined,
  field: string,
  opts: { defaultValue?: bigint } = {},
): bigint {
  let timestamp: bigint;

  if (value === undefined) {
    if (opts.defaultValue === undefined) {
      throw new Error(`${field} is required.`);
    }
    timestamp = opts.defaultValue;
  } else if (value instanceof Date) {
    const milliseconds = value.getTime();
    if (!Number.isFinite(milliseconds)) {
      throw new Error(`${field} must be a valid date.`);
    }
    timestamp = BigInt(Math.floor(milliseconds / 1000));
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^-?\d+$/.test(trimmed)) {
      timestamp = BigInt(trimmed);
    } else {
      const milliseconds = Date.parse(trimmed);
      if (Number.isNaN(milliseconds)) {
        throw new Error(`${field} must be a unix timestamp or ISO date string.`);
      }
      timestamp = BigInt(Math.floor(milliseconds / 1000));
    }
  } else {
    timestamp = toInteger(value, field);
  }

  if (timestamp < 0n) {
    throw new Error(`${field} must be greater than or equal to 0.`);
  }
  return timestamp;
}

export function normalizeReleaseStartTime(
  value: TimestampInput | undefined,
  nowSeconds: bigint,
): bigint {
  return normalizeReleaseTimestamp(value, 'startTime', { defaultValue: nowSeconds });
}

export function normalizeReleasePrice(opts: {
  currencyAddress: Address;
  amount: AmountInput;
  currencyDecimals: number | null;
}): bigint {
  const { currencyAddress, amount, currencyDecimals } = opts;

  if (typeof amount === 'bigint') {
    if (amount < 0n) {
      throw new Error('price must be greater than or equal to 0.');
    }
    return amount;
  }

  const parsed = currencyAddress === ETH_ADDRESS
    ? parseEther(String(amount))
    : parseUnits(String(amount), requireCurrencyDecimals(currencyDecimals));

  if (parsed < 0n) {
    throw new Error('price must be greater than or equal to 0.');
  }
  return parsed;
}

export function resolveReleaseSplits(opts: {
  splitAddresses?: Address[];
  splitRatios?: number[];
  defaultRecipient: Address;
}): { splitRecipients: Address[]; splitRatios: number[] } {
  const { splitAddresses, splitRatios, defaultRecipient } = opts;
  const hasAddresses = splitAddresses !== undefined;
  const hasRatios = splitRatios !== undefined;

  if (!hasAddresses && !hasRatios) {
    return {
      splitRecipients: [defaultRecipient],
      splitRatios: [100],
    };
  }

  if (!splitAddresses || !splitRatios) {
    throw new Error('splitAddresses and splitRatios must be provided together.');
  }

  if (splitAddresses.length === 0) {
    throw new Error('At least one split recipient is required.');
  }

  if (splitAddresses.length !== splitRatios.length) {
    throw new Error('splitAddresses and splitRatios must have the same length.');
  }

  const seen = new Set<string>();
  let sum = 0;

  for (let i = 0; i < splitAddresses.length; i++) {
    const address = splitAddresses[i]!;
    const lower = address.toLowerCase();
    if (seen.has(lower)) {
      throw new Error(`Duplicate split recipient: "${address}".`);
    }
    seen.add(lower);

    const ratio = splitRatios[i]!;
    if (!Number.isInteger(ratio) || ratio < 1 || ratio > 100) {
      throw new Error(`Invalid split ratio "${ratio}". Ratios must be integers between 1 and 100.`);
    }
    sum += ratio;
  }

  if (sum !== 100) {
    throw new Error(`Split ratios must sum to 100 (got ${sum}).`);
  }

  return {
    splitRecipients: [...splitAddresses],
    splitRatios: [...splitRatios],
  };
}

export function planReleaseConfigure(
  params: ReleaseConfigureParams,
  opts: {
    accountAddress: Address;
    nowSeconds: bigint;
    currencyDecimals: number | null;
  },
): ReleaseConfigurePlan {
  const currencyAddress = params.currency ?? ETH_ADDRESS;
  const price = normalizeReleasePrice({
    currencyAddress,
    amount: params.price,
    currencyDecimals: opts.currencyDecimals,
  });
  const startTime = normalizeReleaseStartTime(params.startTime, opts.nowSeconds);
  const maxMints = toInteger(params.maxMints, 'maxMints');
  if (maxMints < 1n || maxMints > 100n) {
    throw new Error('maxMints must be an integer between 1 and 100.');
  }
  const { splitRecipients, splitRatios } = resolveReleaseSplits({
    splitAddresses: params.splitAddresses,
    splitRatios: params.splitRatios,
    defaultRecipient: opts.accountAddress,
  });

  return {
    contract: params.contract,
    currencyAddress,
    price,
    startTime,
    maxMints,
    splitRecipients,
    splitRatios,
  };
}

export function planReleaseAllowlistConfig(params: {
  contract: Address;
  root?: Hex;
  artifact?: ReleaseAllowlistArtifact;
  endTimestamp: TimestampInput;
}): ReleaseAllowlistConfigPlan {
  const root = params.root ?? params.artifact?.root;
  if (!root) {
    throw new Error('allowlist root is required. Pass a root or allowlist artifact.');
  }

  return {
    contract: params.contract,
    root: normalizeBytes32(root, 'allowlist root'),
    endTimestamp: normalizeReleaseTimestamp(params.endTimestamp, 'endTimestamp'),
  };
}

export function planReleaseClearAllowlistConfig(params: {
  contract: Address;
}): ReleaseAllowlistConfigPlan {
  return {
    contract: params.contract,
    root: ZERO_BYTES32,
    endTimestamp: 0n,
  };
}

export function planReleaseLimitConfig(params: {
  contract: Address;
  limit: IntegerInput;
}): ReleaseLimitConfigPlan {
  return {
    contract: params.contract,
    limit: toNonNegativeInteger(params.limit, 'limit'),
  };
}

export function planReleaseSellerStakingMinimum(params: {
  contract: Address;
  amount: AmountInput;
  endTimestamp?: TimestampInput;
}): ReleaseSellerStakingMinimumPlan {
  const amount = normalizeReleaseStakingAmount(params.amount);
  const endTimestamp = params.endTimestamp === undefined && amount === 0n
    ? 0n
    : normalizeReleaseTimestamp(params.endTimestamp, 'endTimestamp');

  return {
    contract: params.contract,
    amount,
    endTimestamp,
  };
}

export function normalizeReleaseStakingAmount(amount: AmountInput): bigint {
  const normalized = typeof amount === 'bigint'
    ? amount
    : parseEther(String(amount));
  if (normalized < 0n) {
    throw new Error('amount must be greater than or equal to 0.');
  }
  return normalized;
}

export function collectReleaseSplit(
  value: string,
  previous: ReleaseSplitAccumulator | undefined,
): ReleaseSplitAccumulator {
  const idx = value.indexOf('=');
  if (idx <= 0 || idx === value.length - 1) {
    throw new Error(`Invalid --split format: "${value}". Expected ADDRESS=RATIO (e.g. 0xabc...=70).`);
  }

  const address = value.slice(0, idx).trim();
  const ratioInput = value.slice(idx + 1).trim();
  if (!isAddress(address)) {
    throw new Error(`Invalid address in --split: "${address}".`);
  }

  const addresses = previous ? [...previous.addresses] : [];
  const ratios = previous ? [...previous.ratios] : [];
  if (addresses.some((candidate) => candidate.toLowerCase() === address.toLowerCase())) {
    throw new Error(`Duplicate address in --split: "${address}".`);
  }

  const ratio = Number(ratioInput);
  if (!Number.isInteger(ratio) || ratio < 1 || ratio > 100) {
    throw new Error(`Invalid ratio in --split: "${ratioInput}". Must be an integer between 1 and 100.`);
  }

  return {
    addresses: [...addresses, address as Address],
    ratios: [...ratios, ratio],
  };
}

export function finalizeReleaseSplitAccumulator(
  accumulator: ReleaseSplitAccumulator | undefined,
): { addresses: Address[]; ratios: number[] } | undefined {
  if (!accumulator || accumulator.addresses.length === 0) return undefined;

  const sum = accumulator.ratios.reduce((total, ratio) => total + ratio, 0);
  if (sum !== 100) {
    throw new Error(`--split ratios must sum to 100 (got ${sum}).`);
  }

  return {
    addresses: [...accumulator.addresses],
    ratios: [...accumulator.ratios],
  };
}

export function buildReleaseAllowlistArtifactFromInput(
  input: string,
  format: ReleaseAllowlistInputFormat,
): ReleaseAllowlistArtifact {
  const wallets = format === 'csv'
    ? parseReleaseAllowlistCsv(input)
    : parseReleaseAllowlistJson(input);
  return buildReleaseAllowlistArtifact(wallets);
}

export function parseReleaseAllowlistArtifactJson(input: string): ReleaseAllowlistArtifact {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    throw new Error(`Malformed allowlist artifact JSON: ${(error as Error).message}`);
  }
  return parseReleaseAllowlistArtifact(parsed);
}

export function parseReleaseAllowlistArtifact(input: unknown): ReleaseAllowlistArtifact {
  if (!isRecord(input)) {
    throw new Error('Allowlist artifact must be a JSON object.');
  }
  if (input.kind !== RELEASE_ALLOWLIST_ARTIFACT_KIND || input.version !== 1) {
    throw new Error(`Unsupported allowlist artifact. Expected kind "${RELEASE_ALLOWLIST_ARTIFACT_KIND}" version 1.`);
  }
  const root = normalizeBytes32(input.root, 'allowlist artifact root');
  if (!Array.isArray(input.wallets)) {
    throw new Error('Allowlist artifact must include a wallets array.');
  }

  const wallets = normalizeAllowlistRows(
    input.wallets.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new Error(`Invalid allowlist artifact wallet at index ${index}: expected an object.`);
      }
      return {
        value: entry.address,
        label: `artifact wallet ${index + 1}`,
      };
    }),
  );
  const artifact = buildReleaseAllowlistArtifact(wallets);
  if (!hexEquals(artifact.root, root)) {
    throw new Error(
      `Allowlist artifact root ${root} does not match the artifact wallets. Rebuild the artifact from the source allowlist.`,
    );
  }

  return artifact;
}

export function parseReleaseAllowlistCsv(input: string): Address[] {
  const rows = parseCsvRows(input).filter((row) =>
    row.fields.some((field) => field.trim().length > 0),
  );
  if (rows.length === 0) {
    throw new Error('CSV allowlist is empty.');
  }

  const headerColumn = findAllowlistAddressColumn(rows[0]!.fields);
  let addressColumn = 0;
  let dataRows = rows;

  if (headerColumn !== -1) {
    addressColumn = headerColumn;
    dataRows = rows.slice(1);
  } else if (!isAddress(rows[0]!.fields[0]?.trim() ?? '')) {
    throw new Error('CSV allowlist must put wallet addresses in the first column or include an address/wallet header.');
  }

  if (dataRows.length === 0) {
    throw new Error('CSV allowlist does not contain any wallet rows.');
  }

  return normalizeAllowlistRows(dataRows.map((row) => ({
    value: row.fields[addressColumn],
    label: `CSV row ${row.number}`,
  })));
}

export function parseReleaseAllowlistJson(input: string): Address[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    throw new Error(`Malformed JSON allowlist: ${(error as Error).message}`);
  }

  if (isRecord(parsed) && parsed.kind === RELEASE_ALLOWLIST_ARTIFACT_KIND) {
    return parseReleaseAllowlistArtifact(parsed).wallets.map((wallet) => wallet.address);
  }

  const entries = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.wallets)
      ? parsed.wallets
      : isRecord(parsed) && Array.isArray(parsed.addresses)
        ? parsed.addresses
        : null;

  if (!entries) {
    throw new Error(
      'JSON allowlist must be an array of wallet addresses, an array of objects with address/wallet, or an object with wallets/addresses.',
    );
  }

  return normalizeAllowlistRows(entries.map((entry, index) => ({
    value: getAddressFromJsonAllowlistEntry(entry, `JSON entry ${index + 1}`),
    label: `JSON entry ${index + 1}`,
  })));
}

export function buildReleaseAllowlistArtifact(wallets: readonly Address[]): ReleaseAllowlistArtifact {
  const addresses = normalizeAllowlistRows(wallets.map((wallet, index) => ({
    value: wallet,
    label: `wallet ${index + 1}`,
  })));
  if (addresses.length === 0) {
    throw new Error('Allowlist must contain at least one wallet address.');
  }

  const sortedAddresses = [...addresses].sort(compareAddress);
  const leaves = sortedAddresses.map(hashAllowlistAddress);
  const layers = buildMerkleLayers(leaves);
  const root = layers[layers.length - 1]![0]!;

  return {
    kind: RELEASE_ALLOWLIST_ARTIFACT_KIND,
    version: 1,
    leafEncoding: RELEASE_ALLOWLIST_LEAF_ENCODING,
    tree: RELEASE_ALLOWLIST_TREE,
    root,
    wallets: sortedAddresses.map((address, index) => ({
      address,
      leaf: leaves[index]!,
      proof: getMerkleProof(layers, index),
    })),
  };
}

export function getReleaseAllowlistProof(opts: {
  artifact: ReleaseAllowlistArtifact;
  address: Address;
}): ReleaseAllowlistWalletProof | null {
  const address = getAddress(opts.address);
  return opts.artifact.wallets.find((entry) => addressesEqual(entry.address, address)) ?? null;
}

export function verifyReleaseAllowlistProof(opts: {
  root: Hex;
  address: Address;
  proof: readonly Hex[];
}): boolean {
  const root = normalizeBytes32(opts.root, 'allowlist root');
  let hash = hashAllowlistAddress(getAddress(opts.address));
  for (const sibling of opts.proof) {
    hash = hashMerklePair(hash, normalizeBytes32(sibling, 'allowlist proof item'));
  }
  return hexEquals(hash, root);
}

export function shapeReleaseAllowlistConfig(opts: {
  rareMinter: Address;
  contract: Address;
  allowlist: RawAllowlistConfig;
  nowSeconds: bigint;
}): ReleaseAllowlistConfig {
  return {
    rareMinter: opts.rareMinter,
    contract: opts.contract,
    root: opts.allowlist.root,
    endTimestamp: opts.allowlist.endTimestamp,
    active: opts.allowlist.root !== ZERO_BYTES32 && opts.allowlist.endTimestamp > opts.nowSeconds,
    now: opts.nowSeconds,
  };
}

export function shapeReleaseLimitConfig(opts: {
  rareMinter: Address;
  contract: Address;
  limit: bigint;
}): ReleaseLimitConfig {
  return {
    rareMinter: opts.rareMinter,
    contract: opts.contract,
    limit: opts.limit,
    enabled: opts.limit > 0n,
  };
}

export function shapeReleaseSellerStakingMinimum(opts: {
  rareMinter: Address;
  contract: Address;
  stakingMinimum: RawStakingMinimum;
  nowSeconds: bigint;
}): ReleaseSellerStakingMinimum {
  return {
    rareMinter: opts.rareMinter,
    contract: opts.contract,
    amount: opts.stakingMinimum.amount,
    endTimestamp: opts.stakingMinimum.endTimestamp,
    active: opts.stakingMinimum.amount > 0n && opts.stakingMinimum.endTimestamp > opts.nowSeconds,
    now: opts.nowSeconds,
  };
}

export function assertReleaseAllowlistConfigMatches(expected: {
  root: `0x${string}`;
  endTimestamp: bigint;
}, actual: RawAllowlistConfig): void {
  if (
    actual.root.toLowerCase() !== expected.root.toLowerCase() ||
    actual.endTimestamp !== expected.endTimestamp
  ) {
    throw new Error(
      `RareMinter allowlist verification failed. Expected root ${expected.root} ending ${expected.endTimestamp}, ` +
        `read root ${actual.root} ending ${actual.endTimestamp}.`,
    );
  }
}

export function assertReleaseLimitMatches(field: string, expected: bigint, actual: bigint): void {
  if (actual !== expected) {
    throw new Error(`RareMinter ${field} verification failed. Expected ${expected}, read ${actual}.`);
  }
}

export function assertReleaseSellerStakingMinimumMatches(expected: {
  amount: bigint;
  endTimestamp: bigint;
}, actual: RawStakingMinimum): void {
  if (actual.amount !== expected.amount || actual.endTimestamp !== expected.endTimestamp) {
    throw new Error(
      `RareMinter seller staking minimum verification failed. Expected amount ${expected.amount} ending ${expected.endTimestamp}, ` +
        `read amount ${actual.amount} ending ${actual.endTimestamp}.`,
    );
  }
}

export function shapeReleaseStatus(opts: {
  rareMinter: Address;
  contract: Address;
  directSale: RawDirectSaleConfig;
  allowlist: RawAllowlistConfig;
  mintLimit: bigint;
  txLimit: bigint;
  account: Address | null;
  accountMints: bigint | null;
  accountTxs: bigint | null;
  stakingMinimum: RawStakingMinimum;
  totalSupply: bigint | null;
  maxSupply: bigint | null;
  currencyDecimals: number | null;
  nowSeconds: bigint;
}): ReleaseStatus {
  const configured = opts.directSale.seller !== ETH_ADDRESS;
  const started = configured && opts.directSale.startTime <= opts.nowSeconds;
  const allowlistActive = opts.allowlist.root !== ZERO_BYTES32 && opts.allowlist.endTimestamp > opts.nowSeconds;
  const stakingMinimumActive = opts.stakingMinimum.amount > 0n && opts.stakingMinimum.endTimestamp > opts.nowSeconds;

  const remainingSupply =
    opts.totalSupply !== null && opts.maxSupply !== null
      ? opts.maxSupply > opts.totalSupply ? opts.maxSupply - opts.totalSupply : 0n
      : null;
  const soldOut =
    opts.totalSupply !== null && opts.maxSupply !== null
      ? opts.maxSupply > 0n && opts.totalSupply >= opts.maxSupply
      : null;

  const accountMintLimitReached =
    opts.account !== null &&
    opts.accountMints !== null &&
    opts.mintLimit > 0n &&
    opts.accountMints >= opts.mintLimit;
  const accountTxLimitReached =
    opts.account !== null &&
    opts.accountTxs !== null &&
    opts.txLimit > 0n &&
    opts.accountTxs >= opts.txLimit;

  const currentlyMintable =
    configured &&
    started &&
    soldOut !== true &&
    !accountMintLimitReached &&
    !accountTxLimitReached;

  return {
    rareMinter: opts.rareMinter,
    contract: opts.contract,
    configured,
    seller: opts.directSale.seller,
    currencyAddress: opts.directSale.currencyAddress,
    currencyDecimals: opts.currencyDecimals,
    price: opts.directSale.price,
    startTime: opts.directSale.startTime,
    maxMints: opts.directSale.maxMints,
    splitRecipients: [...opts.directSale.splitRecipients],
    splitRatios: [...opts.directSale.splitRatios],
    allowlistRoot: opts.allowlist.root,
    allowlistEndTimestamp: opts.allowlist.endTimestamp,
    allowlistActive,
    requiresAllowlist: allowlistActive,
    mintLimit: opts.mintLimit,
    txLimit: opts.txLimit,
    account: opts.account,
    accountMints: opts.accountMints,
    accountTxs: opts.accountTxs,
    stakingMinimumAmount: opts.stakingMinimum.amount,
    stakingMinimumEndTimestamp: opts.stakingMinimum.endTimestamp,
    stakingMinimumActive,
    totalSupply: opts.totalSupply,
    maxSupply: opts.maxSupply,
    remainingSupply,
    soldOut,
    started,
    currentlyMintable,
    isEth: opts.directSale.currencyAddress === ETH_ADDRESS,
    now: opts.nowSeconds,
  };
}

function requireCurrencyDecimals(decimals: number | null): number {
  if (decimals === null) {
    throw new Error('currencyDecimals is required to normalize ERC20 price amounts.');
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error('currencyDecimals must be a non-negative integer.');
  }
  return decimals;
}

function normalizeBytes32(value: unknown, field: string): Hex {
  if (typeof value !== 'string' || !isHex(value) || value.length !== 66) {
    throw new Error(`${field} must be a 32-byte hex string.`);
  }
  return value.toLowerCase() as Hex;
}

function parseCsvRows(input: string): Array<{ fields: string[]; number: number }> {
  const rows: Array<{ fields: string[]; number: number }> = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let rowNumber = 1;

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      if (field.length > 0) {
        throw new Error(`Malformed CSV allowlist at row ${rowNumber}: unexpected quote.`);
      }
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n' || char === '\r') {
      row.push(field);
      rows.push({ fields: row, number: rowNumber });
      row = [];
      field = '';
      if (char === '\r' && input[i + 1] === '\n') {
        i++;
      }
      rowNumber++;
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new Error(`Malformed CSV allowlist at row ${rowNumber}: unterminated quoted field.`);
  }

  row.push(field);
  rows.push({ fields: row, number: rowNumber });
  return rows;
}

function findAllowlistAddressColumn(fields: string[]): number {
  return fields.findIndex((field) => {
    const normalized = field.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalized === 'address' ||
      normalized === 'wallet' ||
      normalized === 'walletaddress';
  });
}

function normalizeAllowlistRows(rows: Array<{ value: unknown; label: string }>): Address[] {
  const seen = new Map<string, string>();
  return rows.map((row) => {
    if (typeof row.value !== 'string') {
      throw new Error(`Invalid allowlist address at ${row.label}: expected a string.`);
    }

    const raw = row.value.trim();
    if (!isAddress(raw)) {
      throw new Error(`Invalid allowlist address at ${row.label}: "${raw}".`);
    }
    const address = getAddress(raw);
    const lower = address.toLowerCase();
    const firstLabel = seen.get(lower);
    if (firstLabel) {
      throw new Error(`Duplicate allowlist address at ${row.label}: "${address}" duplicates ${firstLabel}.`);
    }
    seen.set(lower, row.label);
    return address;
  });
}

function getAddressFromJsonAllowlistEntry(entry: unknown, label: string): unknown {
  if (typeof entry === 'string') {
    return entry;
  }
  if (!isRecord(entry)) {
    throw new Error(`Invalid allowlist ${label}: expected a string or object.`);
  }
  if ('address' in entry) return entry.address;
  if ('wallet' in entry) return entry.wallet;
  if ('walletAddress' in entry) return entry.walletAddress;
  if ('wallet_address' in entry) return entry.wallet_address;
  throw new Error(`Invalid allowlist ${label}: object must include address, wallet, walletAddress, or wallet_address.`);
}

function buildMerkleLayers(leaves: Hex[]): Hex[][] {
  const layers: Hex[][] = [leaves];
  let current = leaves;
  while (current.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i]!;
      const right = current[i + 1];
      next.push(right ? hashMerklePair(left, right) : left);
    }
    layers.push(next);
    current = next;
  }
  return layers;
}

function getMerkleProof(layers: Hex[][], leafIndex: number): Hex[] {
  const proof: Hex[] = [];
  let index = leafIndex;

  for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex++) {
    const layer = layers[layerIndex]!;
    const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
    const sibling = layer[siblingIndex];
    if (sibling) {
      proof.push(sibling);
    }
    index = Math.floor(index / 2);
  }

  return proof;
}

function hashAllowlistAddress(address: Address): Hex {
  return keccak256(address);
}

function hashMerklePair(a: Hex, b: Hex): Hex {
  const [left, right] = compareHex(a, b) <= 0 ? [a, b] : [b, a];
  return keccak256(`0x${left.slice(2)}${right.slice(2)}` as Hex);
}

function compareAddress(a: Address, b: Address): number {
  return a.toLowerCase().localeCompare(b.toLowerCase());
}

function compareHex(a: Hex, b: Hex): number {
  return a.toLowerCase().localeCompare(b.toLowerCase());
}

function addressesEqual(a: Address, b: Address): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function hexEquals(a: Hex, b: Hex): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
