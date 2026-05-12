import fs from 'fs';
import path from 'path';
import os from 'os';
import { chainIds, supportedChains, isSupportedChain, type SupportedChain } from './contracts/addresses.js';

export interface ChainConfig {
  privateKey?: string;
  rpcUrl?: string;
}

export interface Config {
  defaultChain?: SupportedChain;
  chains: Partial<Record<SupportedChain, ChainConfig>>;
}

const CONFIG_DIR = path.join(os.homedir(), '.rare');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function readConfig(): Config {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as Config;
  } catch {
    return { chains: {} };
  }
}

export function writeConfig(config: Config): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function getActiveChain(chainFlag?: string, chainIdFlag?: string): SupportedChain {
  const chainFromName = chainFlag === undefined ? undefined : parseChainName(chainFlag);
  const chainFromId = chainIdFlag === undefined ? undefined : parseChainId(chainIdFlag);

  if (chainFromName !== undefined && chainFromId !== undefined && chainFromName !== chainFromId) {
    console.error(`Error: --chain "${chainFromName}" does not match --chain-id "${chainIdFlag}".`);
    console.error(`Supported chain IDs: ${formatSupportedChainIds()}`);
    process.exit(1);
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
    console.error(`Error: unsupported chain "${value}".`);
    console.error(`Supported chains: ${supportedChains.join(', ')}`);
    process.exit(1);
  }
  return value;
}

function parseChainId(value: string): SupportedChain {
  const chainId = Number(value);
  if (!Number.isInteger(chainId)) {
    console.error(`Error: unsupported chain ID "${value}".`);
    console.error(`Supported chain IDs: ${formatSupportedChainIds()}`);
    process.exit(1);
  }

  const match = supportedChains.find((chain) => chainIds[chain] === chainId);
  if (match === undefined) {
    console.error(`Error: unsupported chain ID "${value}".`);
    console.error(`Supported chain IDs: ${formatSupportedChainIds()}`);
    process.exit(1);
  }

  return match;
}

function formatSupportedChainIds(): string {
  return supportedChains.map((chain) => `${chainIds[chain]} (${chain})`).join(', ');
}
