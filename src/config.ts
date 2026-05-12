import fs from 'fs';
import path from 'path';
import os from 'os';
import { supportedChains, isSupportedChain, type SupportedChain } from './contracts/addresses.js';
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

export function getActiveChain(chainFlag?: string): SupportedChain {
  if (chainFlag) {
    if (!isSupportedChain(chainFlag)) {
      console.error(`Error: unsupported chain "${chainFlag}".`);
      console.error(`Supported chains: ${supportedChains.join(', ')}`);
      process.exit(1);
    }
    return chainFlag;
  }
  const config = readConfig();
  return config.defaultChain ?? 'sepolia';
}

export function getChainConfig(chain: SupportedChain): ChainConfig {
  const config = readConfig();
  return config.chains[chain] ?? {};
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
