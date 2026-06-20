import { getAddress, isAddress, isAddressEqual, parseUnits, type Address, type Hex } from 'viem';
import type { SupportedChain } from '../contracts/addresses.js';
import type { LiquidCurveSegment } from '../liquid/curve-config.js';
import { stringifyAmountInput } from './amounts-core.js';
import type { AmountInput } from './types/common.js';
import type {
  DeploySovereignErc20MarketParams,
  DeploySovereignErc20MarketRewardsParams,
  DeploySovereignErc20Params,
  SovereignErc20BurnFromParams,
  SovereignErc20BurnParams,
  SovereignErc20DelegateParams,
  SovereignErc20IsDelegateParams,
  SovereignErc20Kind,
  SovereignErc20MintParams,
  SovereignErc20RewardToken,
  SovereignErc20RewardTokenInput,
  SovereignErc20RewardTokenName,
  SovereignErc20RewardsAccountParams,
  SovereignErc20RewardsClaimParams,
  SovereignErc20RewardsNotifyParams,
  SovereignErc20RewardsStatusParams,
  SovereignErc20RewardsSyncParams,
  SovereignErc20UpdateTokenUriParams,
} from './types/erc20.js';
import { requireInput } from './validation-core.js';

const ERC20_DECIMALS = 18;
const SHARE_SCALE = 10n ** 18n;
const MIN_INT24 = -8_388_608;
const MAX_INT24 = 8_388_607;
const MAX_UINT16 = 65_535;
const MAX_TOTAL_CURVE_POSITIONS = 25;

export const sovereignErc20Kinds = [
  'sovereign',
  'sovereign-market',
  'sovereign-market-rewards',
] as const satisfies readonly SovereignErc20Kind[];

export const sovereignErc20RewardTokens = [
  'self',
  'rare',
  'usdc',
] as const satisfies readonly SovereignErc20RewardTokenName[];

export const sovereignErc20KindReadNames = {
  sovereign: 'KIND_SOVEREIGN_ERC20',
  'sovereign-market': 'KIND_SOVEREIGN_ERC20_MARKET',
  'sovereign-market-rewards': 'KIND_SOVEREIGN_ERC20_MARKET_REWARDS',
} as const;

export const SOVEREIGN_ERC20_KIND_HASHES = {
  sovereign: '0x1bf69970d213ffdd2f8242c3ca83ebed9e247139ddea6479d0cc0bdfb26a1b98',
  'sovereign-market': '0xfdd8d938af117104e24354375f0f3e5d72d697a9f6414e8136a17a560b887036',
  'sovereign-market-rewards': '0xb0c35d34b09aead9fde6d7d4902c57cdadaf2777d88be56f59d8fcccb945eb45',
} as const satisfies Record<SovereignErc20Kind, Hex>;

export const ERC165_INTERFACE_ID = '0x01ffc9a7' as const;
export const ERC20_INTERFACE_ID = '0x36372b07' as const;
export const ERC20_METADATA_INTERFACE_ID = '0xa219a025' as const;
export const ERC20_PERMIT_INTERFACE_ID = '0x9d8ff7da' as const;
export const ERC1046_INTERFACE_ID = '0x3c130d90' as const;
export const ERC5313_INTERFACE_ID = '0x8da5cb5b' as const;
export const SOVEREIGN_ERC20_INTERFACE_ID = '0x4eefb48f' as const;
export const SOVEREIGN_ERC20_MARKET_INTERFACE_ID = '0x419c3ac7' as const;
export const ERC20_HOLDER_REWARDS_INTERFACE_ID = '0xcbc882bd' as const;

export type SovereignErc20KindReadName = (typeof sovereignErc20KindReadNames)[SovereignErc20Kind];

export type SovereignErc20RewardTokenPlan = SovereignErc20RewardToken;

export type SovereignErc20UnavailableReason =
  | 'factory-not-configured'
  | 'factory-unsupported'
  | 'factory-kind-mismatch'
  | 'implementation-not-set'
  | 'implementation-disabled'
  | 'reward-token-not-allowed';

export class SovereignErc20UnavailableError extends Error {
  readonly chain: SupportedChain;
  readonly chainId: number;
  readonly kind?: SovereignErc20Kind;
  readonly reason: SovereignErc20UnavailableReason;
  readonly factory?: Address;
  readonly implementation?: Address;
  readonly rewardToken?: SovereignErc20RewardToken;
  readonly rewardTokenAddress?: Address;
  readonly expectedKindHash?: Hex;
  readonly observedKindHash?: Hex;

  constructor(params: {
    chain: SupportedChain;
    chainId: number;
    reason: SovereignErc20UnavailableReason;
    kind?: SovereignErc20Kind;
    factory?: Address;
    implementation?: Address;
    rewardToken?: SovereignErc20RewardToken;
    rewardTokenAddress?: Address;
    expectedKindHash?: Hex;
    observedKindHash?: Hex;
    cause?: unknown;
  }) {
    super(formatUnavailableMessage(params), params.cause === undefined ? undefined : { cause: params.cause });
    this.name = 'SovereignErc20UnavailableError';
    this.chain = params.chain;
    this.chainId = params.chainId;
    this.kind = params.kind;
    this.reason = params.reason;
    this.factory = params.factory;
    this.implementation = params.implementation;
    this.rewardToken = params.rewardToken;
    this.rewardTokenAddress = params.rewardTokenAddress;
    this.expectedKindHash = params.expectedKindHash;
    this.observedKindHash = params.observedKindHash;
  }
}

export type SovereignErc20CurveWrite = {
  tickLower: number;
  tickUpper: number;
  numPositions: number;
  shares: bigint;
}

export type SovereignErc20CurvePlan = LiquidCurveSegment & {
  sharesWei: bigint;
}

export type SovereignErc20DeployBasePlan = {
  owner: Address;
  tokenUri: string;
  name: string;
  symbol: string;
  initialSupply: bigint;
  maxSupply: bigint;
  accountAddress: Address;
  requiresDelegate: boolean;
}

export type SovereignErc20DeployPlan = SovereignErc20DeployBasePlan & {
  kind: 'sovereign';
}

export type SovereignErc20MarketDeployPlan = SovereignErc20DeployBasePlan & {
  kind: 'sovereign-market';
  curves: SovereignErc20CurvePlan[];
}

export type SovereignErc20MarketRewardsDeployPlan = Omit<SovereignErc20MarketDeployPlan, 'kind'> & {
  kind: 'sovereign-market-rewards';
  rewardToken: SovereignErc20RewardTokenPlan;
}

export type PlannedSovereignErc20DeployAny =
  | SovereignErc20DeployPlan
  | SovereignErc20MarketDeployPlan
  | SovereignErc20MarketRewardsDeployPlan;

export type CreateSovereignErc20Write = {
  functionName: 'createSovereignERC20';
  args: readonly [Address, string, string, string, bigint, bigint];
}

export type CreateSovereignErc20MarketWrite = {
  functionName: 'createSovereignERC20Market';
  args: readonly [Address, string, string, string, bigint, readonly SovereignErc20CurveWrite[]];
}

export type CreateSovereignErc20MarketRewardsWrite = {
  functionName: 'createSovereignERC20MarketRewards';
  args: readonly [Address, string, string, string, bigint, readonly SovereignErc20CurveWrite[], Address];
}

export type SovereignErc20MintPlan = {
  contract: Address;
  to: Address;
  amount: bigint;
}

export type SovereignErc20BurnPlan = {
  contract: Address;
  amount: bigint;
}

export type SovereignErc20BurnFromPlan = {
  contract: Address;
  account: Address;
  amount: bigint;
}

export type SovereignErc20UpdateTokenUriPlan = {
  contract: Address;
  tokenUri: string;
}

export type SovereignErc20DelegatePlan = {
  operator: Address;
}

export type SovereignErc20IsDelegatePlan = {
  owner: Address;
  operator: Address;
}

export type SovereignErc20RewardsNotifyPlan = {
  contract: Address;
  amount: bigint;
  autoApprove: boolean;
}

export type SovereignErc20RewardsClaimPlan = {
  contract: Address;
  account: Address;
  recipient: Address;
}

export type SovereignErc20RewardsAccountPlan = {
  contract: Address;
  account: Address;
}

export function isSovereignErc20Kind(value: string): value is SovereignErc20Kind {
  return sovereignErc20Kinds.some((kind) => kind === value);
}

export function isSovereignErc20RewardToken(value: string): value is SovereignErc20RewardToken {
  return sovereignErc20RewardTokens.some((token) => token === value);
}

export function planDeploySovereignErc20(
  params: DeploySovereignErc20Params,
  defaults: { accountAddress: Address },
): SovereignErc20DeployPlan {
  const initialSupply = normalizeSovereignErc20Amount(params.initialSupply ?? 0n, 'initialSupply', { allowZero: true });
  const maxSupply = normalizeSovereignErc20Amount(params.maxSupply ?? 0n, 'maxSupply', { allowZero: true });
  if (maxSupply !== 0n && maxSupply < initialSupply) {
    throw new Error('maxSupply must be 0 for uncapped supply or greater than or equal to initialSupply.');
  }

  return {
    kind: 'sovereign',
    ...normalizeDeployBase(params, defaults),
    initialSupply,
    maxSupply,
  };
}

export function planDeploySovereignErc20Market(
  params: DeploySovereignErc20MarketParams,
  defaults: { accountAddress: Address },
): SovereignErc20MarketDeployPlan {
  const initialSupply = normalizeSovereignErc20Amount(params.initialSupply, 'initialSupply', { allowZero: false });
  return {
    kind: 'sovereign-market',
    ...normalizeDeployBase(params, defaults),
    initialSupply,
    maxSupply: initialSupply,
    curves: normalizeSovereignErc20Curves(params.curves),
  };
}

export function planDeploySovereignErc20MarketRewards(
  params: DeploySovereignErc20MarketRewardsParams,
  defaults: { accountAddress: Address },
): SovereignErc20MarketRewardsDeployPlan {
  return {
    ...planDeploySovereignErc20Market(params, defaults),
    kind: 'sovereign-market-rewards',
    rewardToken: normalizeRewardTokenInput(params.rewardToken),
  };
}

export function buildCreateSovereignErc20Write(plan: SovereignErc20DeployPlan): CreateSovereignErc20Write {
  return {
    functionName: 'createSovereignERC20',
    args: [plan.owner, plan.tokenUri, plan.name, plan.symbol, plan.initialSupply, plan.maxSupply],
  };
}

export function buildCreateSovereignErc20MarketWrite(
  plan: SovereignErc20MarketDeployPlan,
): CreateSovereignErc20MarketWrite {
  return {
    functionName: 'createSovereignERC20Market',
    args: [plan.owner, plan.tokenUri, plan.name, plan.symbol, plan.initialSupply, toCurveWrites(plan.curves)],
  };
}

export function buildCreateSovereignErc20MarketRewardsWrite(
  plan: SovereignErc20MarketRewardsDeployPlan,
  rewardToken: Address,
): CreateSovereignErc20MarketRewardsWrite {
  return {
    functionName: 'createSovereignERC20MarketRewards',
    args: [plan.owner, plan.tokenUri, plan.name, plan.symbol, plan.initialSupply, toCurveWrites(plan.curves), rewardToken],
  };
}

export function planSovereignErc20Mint(
  params: SovereignErc20MintParams,
  defaults: { accountAddress: Address },
): SovereignErc20MintPlan {
  return {
    contract: normalizeSovereignErc20Address(params.contract, 'contract'),
    to: normalizeSovereignErc20Address(params.to ?? defaults.accountAddress, 'to'),
    amount: normalizeSovereignErc20Amount(params.amount, 'amount', { allowZero: false }),
  };
}

export function planSovereignErc20Burn(params: SovereignErc20BurnParams): SovereignErc20BurnPlan {
  return {
    contract: normalizeSovereignErc20Address(params.contract, 'contract'),
    amount: normalizeSovereignErc20Amount(params.amount, 'amount', { allowZero: false }),
  };
}

export function planSovereignErc20BurnFrom(params: SovereignErc20BurnFromParams): SovereignErc20BurnFromPlan {
  return {
    contract: normalizeSovereignErc20Address(params.contract, 'contract'),
    account: normalizeSovereignErc20Address(params.account, 'account'),
    amount: normalizeSovereignErc20Amount(params.amount, 'amount', { allowZero: false }),
  };
}

export function planSovereignErc20UpdateTokenUri(
  params: SovereignErc20UpdateTokenUriParams,
): SovereignErc20UpdateTokenUriPlan {
  return {
    contract: normalizeSovereignErc20Address(params.contract, 'contract'),
    tokenUri: params.tokenUri,
  };
}

export function planSovereignErc20Delegate(
  params: SovereignErc20DelegateParams,
): SovereignErc20DelegatePlan {
  return {
    operator: normalizeSovereignErc20Address(params.operator, 'operator'),
  };
}

export function planDelegate(params: SovereignErc20DelegateParams): SovereignErc20DelegatePlan {
  return planSovereignErc20Delegate(params);
}

export function planSovereignErc20IsDelegate(params: SovereignErc20IsDelegateParams): SovereignErc20IsDelegatePlan {
  return {
    owner: normalizeSovereignErc20Address(params.owner, 'owner'),
    operator: normalizeSovereignErc20Address(params.operator, 'operator'),
  };
}

export function planIsDelegate(params: SovereignErc20IsDelegateParams): SovereignErc20IsDelegatePlan {
  return planSovereignErc20IsDelegate(params);
}

export function planErc20Contract(params: { contract: Address }): { contract: Address } {
  return {
    contract: normalizeSovereignErc20Address(params.contract, 'contract'),
  };
}

export function planErc20Account(params: { contract: Address; account: Address }): { contract: Address; account: Address } {
  return {
    contract: normalizeSovereignErc20Address(params.contract, 'contract'),
    account: normalizeSovereignErc20Address(params.account, 'account'),
  };
}

export function planSovereignErc20RewardsStatus(
  params: SovereignErc20RewardsStatusParams,
): { contract: Address; account?: Address } {
  return {
    contract: normalizeSovereignErc20Address(params.contract, 'contract'),
    ...(params.account === undefined ? {} : { account: normalizeSovereignErc20Address(params.account, 'account') }),
  };
}

export function planSovereignErc20RewardsNotify(
  params: SovereignErc20RewardsNotifyParams,
): SovereignErc20RewardsNotifyPlan {
  return {
    contract: normalizeSovereignErc20Address(params.contract, 'contract'),
    amount: normalizeSovereignErc20Amount(params.amount, 'amount', { allowZero: false }),
    autoApprove: params.autoApprove ?? true,
  };
}

export function planRewardsNotify(params: SovereignErc20RewardsNotifyParams): SovereignErc20RewardsNotifyPlan {
  return planSovereignErc20RewardsNotify(params);
}

export function planSovereignErc20RewardsSync(params: SovereignErc20RewardsSyncParams): { contract: Address } {
  return {
    contract: normalizeSovereignErc20Address(params.contract, 'contract'),
  };
}

export function planRewardsSync(params: SovereignErc20RewardsSyncParams): { contract: Address } {
  return planSovereignErc20RewardsSync(params);
}

export function planSovereignErc20RewardsClaim(
  params: SovereignErc20RewardsClaimParams,
  defaults: { accountAddress: Address },
): SovereignErc20RewardsClaimPlan {
  return {
    contract: normalizeSovereignErc20Address(params.contract, 'contract'),
    account: defaults.accountAddress,
    recipient: normalizeSovereignErc20Address(params.recipient ?? defaults.accountAddress, 'recipient'),
  };
}

export function planRewardsClaim(
  params: SovereignErc20RewardsClaimParams,
  defaults: { accountAddress: Address },
): SovereignErc20RewardsClaimPlan {
  return planSovereignErc20RewardsClaim(params, defaults);
}

export function planSovereignErc20RewardsAccount(
  params: SovereignErc20RewardsAccountParams,
): SovereignErc20RewardsAccountPlan {
  return {
    contract: normalizeSovereignErc20Address(params.contract, 'contract'),
    account: normalizeSovereignErc20Address(params.account, 'account'),
  };
}

export function planRewardsAccount(params: SovereignErc20RewardsAccountParams): SovereignErc20RewardsAccountPlan {
  return planSovereignErc20RewardsAccount(params);
}

export function planRewardsStatus(params: SovereignErc20RewardsStatusParams): { contract: Address; account?: Address } {
  return planSovereignErc20RewardsStatus(params);
}

export function normalizeSovereignErc20Address(value: Address, field: string): Address {
  if (!isAddress(value)) {
    throw new Error(`${field} must be a valid address.`);
  }
  return getAddress(value);
}

export function normalizeSovereignErc20Amount(
  value: AmountInput,
  field: string,
  opts: { allowZero: boolean },
): bigint {
  const normalized = typeof value === 'bigint'
    ? value
    : parseUnits(normalizeAmountString(value, field), ERC20_DECIMALS);
  if (normalized < 0n) {
    throw new Error(`${field} must be greater than or equal to 0.`);
  }
  if (!opts.allowZero && normalized === 0n) {
    throw new Error(`${field} must be greater than 0.`);
  }
  return normalized;
}

function normalizeDeployBase(
  params: Pick<DeploySovereignErc20Params, 'owner' | 'tokenUri' | 'name' | 'symbol'>,
  defaults: { accountAddress: Address },
): Omit<SovereignErc20DeployBasePlan, 'initialSupply' | 'maxSupply'> {
  const owner = normalizeSovereignErc20Address(params.owner ?? defaults.accountAddress, 'owner');
  return {
    owner,
    tokenUri: params.tokenUri ?? '',
    name: normalizeDisplayString(params.name, 'name'),
    symbol: normalizeDisplayString(params.symbol, 'symbol'),
    accountAddress: defaults.accountAddress,
    requiresDelegate: !isAddressEqual(owner, defaults.accountAddress),
  };
}

function normalizeDisplayString(value: string, field: string): string {
  const required = requireInput(value, field);
  if (required.trim().length === 0) {
    throw new Error(`${field} must not be blank.`);
  }
  return required;
}

function normalizeAmountString(value: Exclude<AmountInput, bigint>, field: string): string {
  const rawValue = stringifyAmountInput(value, field).trim();
  if (!/^\d+(\.\d+)?$/.test(rawValue)) {
    throw new Error(`${field} must be a valid positive decimal amount.`);
  }
  return rawValue;
}

function normalizeSovereignErc20Curves(curves: LiquidCurveSegment[]): SovereignErc20CurvePlan[] {
  if (curves.length === 0) {
    throw new Error('curves must contain at least one segment.');
  }

  const normalized = curves.map(normalizeCurveSegment);
  const totalPositions = normalized.reduce((sum, curve) => sum + curve.numPositions, 0);
  if (totalPositions > MAX_TOTAL_CURVE_POSITIONS) {
    throw new Error(`Total positions across all curves must not exceed ${MAX_TOTAL_CURVE_POSITIONS}.`);
  }

  const sortedCurves = [...normalized].sort((a, b) => a.tickLower - b.tickLower);
  const hasGapOrOverlap = sortedCurves
    .slice(1)
    .some((curve, index) => curve.tickLower !== sortedCurves[index]?.tickUpper);
  if (hasGapOrOverlap) {
    throw new Error('Curve segments must be contiguous with no gaps or overlap.');
  }

  const shareSum = sortedCurves.reduce((sum, curve) => sum + curve.sharesWei, 0n);
  if (shareSum !== SHARE_SCALE) {
    throw new Error('Curve share values must add up to 1.');
  }

  return sortedCurves;
}

function normalizeCurveSegment(curve: LiquidCurveSegment): SovereignErc20CurvePlan {
  const tickLower = normalizeInteger(curve.tickLower, 'curve.tickLower');
  const tickUpper = normalizeInteger(curve.tickUpper, 'curve.tickUpper');
  const numPositions = normalizeInteger(curve.numPositions, 'curve.numPositions');
  if (tickLower < MIN_INT24 || tickUpper > MAX_INT24) {
    throw new Error(`Curve ticks must fit in int24 (${MIN_INT24} to ${MAX_INT24}).`);
  }
  if (tickLower >= tickUpper) {
    throw new Error('curve.tickLower must be less than curve.tickUpper.');
  }
  if (numPositions <= 0 || numPositions > MAX_UINT16) {
    throw new Error(`curve.numPositions must be between 1 and ${MAX_UINT16}.`);
  }

  const sharesWei = parseShare(curve.shares, 'curve.shares');
  return {
    tickLower,
    tickUpper,
    numPositions,
    shares: formatShareDecimal(sharesWei),
    sharesWei,
  };
}

function normalizeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${field} must be a safe integer.`);
  }
  return value;
}

function parseShare(value: string, field: string): bigint {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`${field} must be a valid decimal share.`);
  }
  const sharesWei = parseUnits(normalized, ERC20_DECIMALS);
  if (sharesWei <= 0n || sharesWei > SHARE_SCALE) {
    throw new Error(`${field} must be greater than 0 and less than or equal to 1.`);
  }
  return sharesWei;
}

function formatShareDecimal(value: bigint): string {
  const integer = value / SHARE_SCALE;
  const fractional = value % SHARE_SCALE;
  if (fractional === 0n) {
    return integer.toString();
  }
  return `${integer.toString()}.${fractional.toString().padStart(18, '0').replace(/0+$/, '')}`;
}

function toCurveWrites(curves: SovereignErc20CurvePlan[]): SovereignErc20CurveWrite[] {
  return curves.map((curve) => ({
    tickLower: curve.tickLower,
    tickUpper: curve.tickUpper,
    numPositions: curve.numPositions,
    shares: curve.sharesWei,
  }));
}

function normalizeRewardTokenInput(input: SovereignErc20RewardTokenInput): SovereignErc20RewardTokenPlan {
  const normalized = input.toLowerCase();
  if (isSovereignErc20RewardToken(normalized)) {
    return normalized;
  }
  throw new Error('rewardToken must be "self", "rare", or "usdc".');
}

function formatUnavailableMessage(params: {
  chain: SupportedChain;
  chainId: number;
  reason: SovereignErc20UnavailableReason;
  kind?: SovereignErc20Kind;
  factory?: Address;
  implementation?: Address;
  rewardToken?: SovereignErc20RewardToken;
  rewardTokenAddress?: Address;
}): string {
  const kind = params.kind === undefined ? 'Sovereign ERC20' : `Sovereign ERC20 kind "${params.kind}"`;
  const chain = `${params.chain} (${params.chainId.toString()})`;
  if (params.reason === 'factory-not-configured') {
    return `${kind} is not available on ${chain}: liquidFactory is not configured.`;
  }
  if (params.reason === 'factory-unsupported') {
    return `${kind} is not available on ${chain}: configured factory does not expose Sovereign ERC20 support.`;
  }
  if (params.reason === 'factory-kind-mismatch') {
    return `${kind} is not available on ${chain}: configured factory reports an unexpected kind hash.`;
  }
  if (params.reason === 'implementation-not-set') {
    return `${kind} is not available on ${chain}: no implementation is configured in the factory.`;
  }
  if (params.reason === 'implementation-disabled') {
    return `${kind} is not available on ${chain}: factory implementation ${params.implementation ?? 'unknown'} is disabled.`;
  }
  return `${kind} is not available on ${chain}: reward token ${params.rewardToken ?? 'unknown'} ` +
    `(${params.rewardTokenAddress ?? 'unknown'}) is not approved by the factory.`;
}
