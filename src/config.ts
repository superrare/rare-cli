import fs from 'fs';
import path from 'path';
import os from 'os';
import { getAddress, isAddress, type Address } from 'viem';
import { chainIds, supportedChains, isSupportedChain, type SupportedChain } from './contracts/addresses.js';
import { isHexString } from './sdk/validation.js';

export type PrivateKeyReference = `op://${string}`;

export type ChainConfig = {
  privateKey?: `0x${string}`;
  privateKeyRef?: PrivateKeyReference;
  accountAddress?: Address;
  rpcUrl?: string;
}

export type Config = {
  defaultChain?: SupportedChain;
  chains: Partial<Record<SupportedChain, ChainConfig>>;
}

const CONFIG_DIR = path.join(os.homedir(), '.rare');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const CONFIG_DIR_MODE = 0o700;
const CONFIG_FILE_MODE = 0o600;

export function getConfigFilePath(): string {
  return CONFIG_FILE;
}

export function configFileExists(): boolean {
  return fs.existsSync(CONFIG_FILE);
}

export function readConfig(): Config {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    return parseConfig(parsed);
  } catch (error) {
    if (isNodeFileNotFoundError(error)) {
      return { chains: {} };
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse rare config at ${CONFIG_FILE}.`, { cause: error });
    }

    throw error;
  }
}

export function writeConfig(config: Config): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: CONFIG_DIR_MODE });
  fs.chmodSync(CONFIG_DIR, CONFIG_DIR_MODE);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
    encoding: 'utf-8',
    mode: CONFIG_FILE_MODE,
  });
  fs.chmodSync(CONFIG_FILE, CONFIG_FILE_MODE);
}

export function deleteConfig(): boolean {
  try {
    fs.unlinkSync(CONFIG_FILE);
    return true;
  } catch (error) {
    if (isNodeFileNotFoundError(error)) {
      return false;
    }

    throw error;
  }
}

export function setDefaultChain(config: Config, defaultChain: SupportedChain): Config {
  return { ...config, defaultChain };
}

export function setChainConfig(config: Config, chain: SupportedChain, updates: ChainConfig): Config {
  return {
    ...config,
    chains: {
      ...config.chains,
      [chain]: {
        ...(config.chains[chain] ?? {}),
        ...updates,
      },
    },
  };
}

export function isPrivateKeyReference(value: string): value is PrivateKeyReference {
  return value.startsWith('op://') && value.length > 'op://'.length;
}

export function parsePrivateKeyReference(value: string, field: string): PrivateKeyReference {
  if (!isPrivateKeyReference(value)) {
    throw new Error(`${field} must be a 1Password secret reference beginning with op://.`);
  }

  return value;
}

export function getActiveChain(chainFlag?: string, chainIdFlag?: string): SupportedChain {
  const chainFromName = chainFlag === undefined ? undefined : parseChainName(chainFlag);
  const chainFromId = chainIdFlag === undefined ? undefined : parseChainId(chainIdFlag);

  if (chainFromName !== undefined && chainFromId !== undefined && chainFromName !== chainFromId) {
    throw new Error(
      `--chain "${chainFromName}" does not match --chain-id "${chainIdFlag}". Supported chain IDs: ${formatSupportedChainIds()}`,
    );
  }

  if (chainFromName !== undefined) return chainFromName;
  if (chainFromId !== undefined) return chainFromId;

  const config = readConfig();
  return config.defaultChain ?? 'sepolia';
}

export function getChainConfig(chain: SupportedChain): ChainConfig {
  const config = readConfig();
  return config.chains[chain] ?? {};
}

function parseChainName(value: string): SupportedChain {
  if (!isSupportedChain(value)) {
    throw new Error(`unsupported chain "${value}". Supported chains: ${supportedChains.join(', ')}`);
  }
  return value;
}

function parseChainId(value: string): SupportedChain {
  const chainId = Number(value);
  if (!Number.isInteger(chainId)) {
    throw new Error(`unsupported chain ID "${value}". Supported chain IDs: ${formatSupportedChainIds()}`);
  }

  const match = supportedChains.find((chain) => chainIds[chain] === chainId);
  if (match === undefined) {
    throw new Error(`unsupported chain ID "${value}". Supported chain IDs: ${formatSupportedChainIds()}`);
  }

  return match;
}

function formatSupportedChainIds(): string {
  return supportedChains.map((chain) => `${chainIds[chain]} (${chain})`).join(', ');
}

export function parseConfig(value: unknown): Config {
  if (!isRecord(value)) {
    return { chains: {} };
  }

  const defaultChain = typeof value.defaultChain === 'string' && isSupportedChain(value.defaultChain)
    ? value.defaultChain
    : undefined;
  const chains = isRecord(value.chains) ? parseChainConfigs(value.chains) : {};

  return {
    ...(defaultChain === undefined ? {} : { defaultChain }),
    chains,
  };
}

function parseChainConfigs(value: Record<string, unknown>): Partial<Record<SupportedChain, ChainConfig>> {
  return supportedChains.reduce<Partial<Record<SupportedChain, ChainConfig>>>((configs, chain) => {
    const chainConfig = parseChainConfig(value[chain]);
    return chainConfig === undefined ? configs : { ...configs, [chain]: chainConfig };
  }, {});
}

function parseChainConfig(value: unknown): ChainConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const privateKey = typeof value.privateKey === 'string' && isHexString(value.privateKey)
    ? value.privateKey
    : undefined;
  const privateKeyRef = typeof value.privateKeyRef === 'string' && isPrivateKeyReference(value.privateKeyRef)
    ? value.privateKeyRef
    : undefined;
  const accountAddress = parseAccountAddress(value);
  const rpcUrl = typeof value.rpcUrl === 'string' ? value.rpcUrl : undefined;

  if (
    privateKey === undefined &&
    privateKeyRef === undefined &&
    accountAddress === undefined &&
    rpcUrl === undefined
  ) {
    return undefined;
  }

  return {
    ...(privateKey === undefined ? {} : { privateKey }),
    ...(privateKeyRef === undefined ? {} : { privateKeyRef }),
    ...(accountAddress === undefined ? {} : { accountAddress }),
    ...(rpcUrl === undefined ? {} : { rpcUrl }),
  };
}

function parseAccountAddress(value: Record<string, unknown>): Address | undefined {
  const accountAddress = typeof value.accountAddress === 'string' ? value.accountAddress : undefined;
  const legacyWalletAddress = typeof value.walletAddress === 'string' ? value.walletAddress : undefined;
  const candidate = accountAddress ?? legacyWalletAddress;

  return candidate !== undefined && isAddress(candidate) ? getAddress(candidate) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
