import { expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createWalletClient,
  createPublicClient,
  erc20Abi,
  formatUnits,
  http,
  parseUnits,
  type Address,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  chainIds,
  resolveCurrency,
  supportedChains,
  viemChains,
  type SupportedChain,
} from '../../../src/contracts/addresses.js';
import { parseJsonStdout, runCli } from '../../helpers/cli.js';
import { loadDotEnv, missingLiveEnv } from '../env.mjs';
import { withLiveWriteConsent } from './live-consent.js';
import {
  releaseLiveWallets,
  reserveLiveWallet,
  reserveLiveWalletPair,
  type LiveWalletLease,
} from './live-wallet-pool.js';

loadDotEnv();

export const missingEnv = missingLiveEnv();
export const E2E_TOKEN_URI = 'ipfs://bafybeidznwopf6bnfakqbertnhohgh65usqlo7bhnehycurg4xmc5ebnm4/metadata.json';
export const LIQUID_CURVES = [
  {
    tickLower: -60_000,
    tickUpper: 60_000,
    numPositions: 1,
    shares: '1',
  },
] as const;

export type TxResult = {
  txHash: string;
  blockNumber: string;
};

export type LiveFixture = {
  sellerHome: string;
  buyerHome?: string;
  tempDir: string;
  curvesFile: string;
  chain: SupportedChain;
  chainId: number;
  publicClient: PublicClient;
  sellerAddress: Address;
  buyerAddress?: Address;
  sellerWallet: LiveWalletLease;
  buyerWallet?: LiveWalletLease;
  rareAddress: Address;
  usdcAddress: Address;
};

export type BuyerLiveFixture = LiveFixture & {
  buyerHome: string;
  buyerAddress: Address;
};

export class LiveFixtureRef<TFixture> {
  #value: TFixture | undefined;

  constructor(private readonly errorMessage: string) {}

  get value(): TFixture {
    if (this.#value === undefined) {
      throw new Error(this.errorMessage);
    }
    return this.#value;
  }

  get optionalValue(): TFixture | undefined {
    return this.#value;
  }

  set(value: TFixture): void {
    this.#value = value;
  }
}

export async function createLiveFixture(options: { buyer?: boolean } = {}): Promise<LiveFixture> {
  const sellerHome = await createTempHome('rare-cli-live-seller-home-');
  const buyerHome = options.buyer ? await createTempHome('rare-cli-live-buyer-home-') : undefined;
  const tempDir = await mkdtemp(join(tmpdir(), 'rare-cli-live-'));
  const curvesFile = join(tempDir, 'liquid-curves.json');
  let sellerWallet: LiveWalletLease | undefined;
  let buyerWallet: LiveWalletLease | undefined;

  try {
    const chain = await step('detect live chain', () => detectLiveChain());
    const publicClient = createLivePublicClient(chain);
    if (buyerHome === undefined) {
      sellerWallet = await step('reserve seller live wallet', () => reserveLiveWallet('seller', chain));
    } else {
      ({ sellerWallet, buyerWallet } = await step('reserve seller and buyer live wallets', () => reserveLiveWalletPair(chain)));
    }
    await writeFile(curvesFile, JSON.stringify(LIQUID_CURVES, null, 2), 'utf8');
    await step('configure seller wallet', () => configureLiveHome(sellerHome, chain, sellerWallet.privateKey));
    if (buyerHome) {
      if (buyerWallet === undefined) {
        throw new Error('Buyer wallet lease was not created.');
      }
      await step('configure buyer wallet', () => configureLiveHome(buyerHome, chain, buyerWallet.privateKey));
    }

    return {
      sellerHome,
      buyerHome,
      tempDir,
      curvesFile,
      chain,
      chainId: chainIds[chain],
      publicClient,
      sellerAddress: sellerWallet.address,
      buyerAddress: buyerWallet?.address,
      sellerWallet,
      buyerWallet,
      rareAddress: resolveCurrency('rare', chain),
      usdcAddress: resolveCurrency('usdc', chain),
    };
  } catch (error) {
    await cleanupLiveFixture({ sellerHome, buyerHome, tempDir, sellerWallet, buyerWallet });
    throw error;
  }
}

export async function cleanupLiveFixture(
  live: Pick<LiveFixture, 'sellerHome' | 'buyerHome' | 'tempDir'> &
    Partial<Pick<LiveFixture, 'sellerWallet' | 'buyerWallet'>> | undefined,
): Promise<void> {
  await cleanupTempPath(live?.sellerHome);
  await cleanupTempPath(live?.buyerHome);
  await cleanupTempPath(live?.tempDir);
  await releaseLiveWallets([live?.sellerWallet, live?.buyerWallet]);
}

export function requireBuyerFixture(fixture: LiveFixture): BuyerLiveFixture {
  if (fixture.buyerHome === undefined || fixture.buyerAddress === undefined) {
    throw new Error('Live buyer fixture requires E2E_BUYER_PRIVATE_KEYS and buyer setup.');
  }
  return {
    ...fixture,
    buyerHome: fixture.buyerHome,
    buyerAddress: fixture.buyerAddress,
  };
}

export async function detectLiveChain(): Promise<SupportedChain> {
  const publicClient = createPublicClient({ transport: http(liveRpcUrl()) });
  const chainId = await publicClient.getChainId();
  const chain = supportedChains.find((supportedChain) => chainIds[supportedChain] === chainId);
  if (!chain) {
    throw new Error(`TEST_RPC_URL returned unsupported chain id ${chainId}. Supported chain ids: ${Object.values(chainIds).join(', ')}`);
  }
  return chain;
}

export async function jsonCommand<T>(home: string, args: string[], timeoutMs = 180_000): Promise<T> {
  return parseJsonStdout<T>(await runCli(['--json', ...withLiveWriteConsent(args)], { home, timeoutMs }));
}

export function expectTx(result: TxResult): void {
  expect(result.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  expect(result.blockNumber).toMatch(/^\d+$/);
}

export async function expectTokenBalanceAtLeast(
  live: LiveFixture,
  owner: Address,
  token: Address,
  amount: string,
): Promise<void> {
  const balance = await readTokenBalance(live, owner, token);
  const required = await parseTokenAmount(live, token, amount);
  if (balance < required) {
    throw new Error(`E2E wallet ${owner} has insufficient token ${token} on ${live.chain}. Required ${required}, found ${balance}.`);
  }
}

export async function readTokenBalance(live: LiveFixture, owner: Address, token: Address): Promise<bigint> {
  return live.publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner],
  });
}

export async function readTokenAllowance(
  live: LiveFixture,
  token: Address,
  owner: Address,
  spender: Address,
): Promise<bigint> {
  return live.publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, spender],
  });
}

export async function approveToken(
  live: LiveFixture,
  token: Address,
  spender: Address,
  amount: bigint,
  ownerRole: 'seller' | 'buyer',
): Promise<void> {
  const privateKey = ownerRole === 'seller'
    ? live.sellerWallet.privateKey
    : live.buyerWallet?.privateKey;
  if (privateKey === undefined) {
    throw new Error('Live buyer wallet lease is required for token approval.');
  }
  const walletClient = createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: viemChains[live.chain],
    transport: http(liveRpcUrl()),
  });
  const txHash = await walletClient.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: 'approve',
    args: [spender, amount],
  });
  await live.publicClient.waitForTransactionReceipt({ hash: txHash });
}

export async function parseTokenAmount(live: LiveFixture, token: Address, amount: string): Promise<bigint> {
  return parseUnits(amount, await readErc20Decimals(live, token));
}

export async function readErc20Decimals(live: LiveFixture, token: Address): Promise<number> {
  return live.publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'decimals',
  });
}

export async function formatTokenAmount(live: LiveFixture, token: Address, amount: bigint): Promise<string> {
  return formatUnits(amount, await readErc20Decimals(live, token));
}

export function liveSwapEthAmount(): string {
  return process.env.E2E_SWAP_ETH_AMOUNT ?? '0.000001';
}

export function liveSwapRareAmount(): string {
  return process.env.E2E_SWAP_RARE_AMOUNT ?? '0.000001';
}

export function liveSwapRareToUsdcAmount(): string {
  return process.env.E2E_SWAP_RARE_TO_USDC_AMOUNT ?? '0.01';
}

export function liveInitialRareLiquidity(): string {
  return process.env.E2E_LIQUID_INITIAL_RARE_LIQUIDITY ?? '1';
}

export function liveLiquidEditionSellAmount(): string {
  return process.env.E2E_LIQUID_EDITION_SELL_AMOUNT ?? '0.000001';
}

export function uniqueTokenName(prefix: string): string {
  return `${prefix} ${Date.now().toString(36).slice(-6).toUpperCase()}`;
}

export function uniqueSymbol(prefix: string): string {
  return `${prefix}${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

export async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  console.error(`[live e2e] ${label}`);
  return fn();
}

function createLivePublicClient(chain: SupportedChain): PublicClient {
  return createPublicClient({
    chain: viemChains[chain],
    transport: http(liveRpcUrl()),
  });
}

async function configureLiveHome(home: string, chain: SupportedChain, privateKey: string): Promise<void> {
  const result = await runCli([
    'configure',
    '--default-chain',
    chain,
    '--chain',
    chain,
    '--private-key',
    privateKey,
    '--rpc-url',
    liveRpcUrl(),
  ], { home });

  expect(result.code).toBe(0);
  expect(result.stderr).toBe('');
}

export function liveRpcUrl(): string {
  const value = process.env.TEST_RPC_URL;
  if (!value) {
    throw new Error('TEST_RPC_URL must be set.');
  }
  return value;
}

async function createTempHome(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function cleanupTempPath(path: string | undefined): Promise<void> {
  if (!path) return;
  await rm(path, { recursive: true, force: true });
}
