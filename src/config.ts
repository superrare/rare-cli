import fs from 'fs';
import path from 'path';
import os from 'os';
import { supportedChains, isSupportedChain, type SupportedChain } from './contracts/addresses.js';

export interface ChainConfig {
  privateKey?: string;
  rpcUrl?: string;
}

export interface PreservationConfig {
  serviceUrl?: string;
  defaultPaymentChain?: SupportedChain;
  gatewayUrl?: string;
  maxBytes?: number;
}

export interface Config {
  defaultChain?: SupportedChain;
  chains: Partial<Record<SupportedChain, ChainConfig>>;
  preservation?: PreservationConfig;
}

const CONFIG_DIR = path.join(os.homedir(), '.rare');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function readConfig(): Config {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as Config;
  } catch {
    return { chains: {}, preservation: {} };
  }
}

export function writeConfig(config: Config): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
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

export function getPreservationConfig(): PreservationConfig {
  const config = readConfig();
  return config.preservation ?? {};
}
