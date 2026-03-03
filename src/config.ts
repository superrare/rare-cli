import fs from 'fs';
import path from 'path';
import os from 'os';
import type { SupportedChain } from './contracts/addresses.js';

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

export function getActiveChain(chainFlag?: string): SupportedChain {
  if (chainFlag) {
    if (chainFlag !== 'sepolia' && chainFlag !== 'mainnet') {
      console.error(`Error: unsupported chain "${chainFlag}". Use "sepolia" or "mainnet".`);
      process.exit(1);
    }
    return chainFlag as SupportedChain;
  }
  const config = readConfig();
  return config.defaultChain ?? 'sepolia';
}

export function getChainConfig(chain: SupportedChain): ChainConfig {
  const config = readConfig();
  return config.chains[chain] ?? {};
}
