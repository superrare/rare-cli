import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const requiredLiveEnv = [
  'TEST_RPC_URL',
];

export function loadDotEnv(file = '.env') {
  const envPath = resolve(process.cwd(), file);
  if (!existsSync(envPath)) return {};

  const parsed = {};
  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;

    const [, key, rawValue] = match;
    const value = parseDotEnvValue(rawValue);
    parsed[key] = value;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return parsed;
}

export function missingLiveEnv(env = process.env) {
  return [
    ...requiredLiveEnv.filter((name) => !env[name]),
    ...(hasLiveWalletEnv('seller', env) ? [] : ['E2E_SELLER_PRIVATE_KEYS']),
    ...(hasLiveWalletEnv('buyer', env) ? [] : ['E2E_BUYER_PRIVATE_KEYS']),
  ];
}

export function hasLiveWalletEnv(role, env = process.env) {
  const plural = role === 'seller' ? 'E2E_SELLER_PRIVATE_KEYS' : 'E2E_BUYER_PRIVATE_KEYS';
  return Boolean(env[plural]);
}

function parseDotEnvValue(rawValue) {
  const value = rawValue.trim();
  if (!value) return '';

  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    const unquoted = value.slice(1, -1);
    if (quote === '"') {
      return unquoted
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
    return unquoted;
  }

  const hashIndex = value.indexOf(' #');
  return (hashIndex === -1 ? value : value.slice(0, hashIndex)).trim();
}
