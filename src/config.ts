import fs from 'fs';
import path from 'path';
import os from 'os';
import { chainIds, supportedChains, isSupportedChain, type SupportedChain } from './contracts/addresses.js';
import { isHexString } from './sdk/validation.js';

export type ChainConfig = {
  privateKey?: `0x${string}`;
  rpcUrl?: string;
}

export type Config = {
  defaultChain?: SupportedChain;
  chains: Partial<Record<SupportedChain, ChainConfig>>;
}

const CONFIG_DIR = path.join(os.homedir(), '.rare');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function readConfig(): Config {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    return parseConfig(parsed);
  } catch {
    return { chains: {} };
  }
}

export function writeConfig(config: Config): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
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

function parseConfig(value: unknown): Config {
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
  const rpcUrl = typeof value.rpcUrl === 'string' ? value.rpcUrl : undefined;

  if (privateKey === undefined && rpcUrl === undefined) {
    return undefined;
  }

  return {
    ...(privateKey === undefined ? {} : { privateKey }),
    ...(rpcUrl === undefined ? {} : { rpcUrl }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
