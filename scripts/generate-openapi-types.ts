import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEFAULT_RARE_API_BASE_URL = 'https://api.superrare.com';
const ENV_FILE = '.env';
const SCHEMA_OUTPUT = 'src/data-access/schema.d.ts';

export function readRareApiBaseUrlFromEnvFile(content: string): string | undefined {
  return content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(parseEnvLine)
    .find((entry) => entry?.key === 'RARE_API_BASE_URL')
    ?.value;
}

export function resolveRareApiBaseUrlForTypeGeneration(params: {
  envFileContent?: string;
  processEnvValue?: string;
}): string {
  return normalizeBaseUrlCandidate(
    params.envFileContent === undefined
      ? undefined
      : readRareApiBaseUrlFromEnvFile(params.envFileContent),
  ) ??
    normalizeBaseUrlCandidate(params.processEnvValue) ??
    DEFAULT_RARE_API_BASE_URL;
}

function parseEnvLine(line: string): { key: string; value: string } | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith('#')) {
    return undefined;
  }

  const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
  if (match === null) {
    return undefined;
  }

  const key = match[1];
  const rawValue = match[2] ?? '';
  if (key === undefined) {
    return undefined;
  }

  return {
    key,
    value: unquoteEnvValue(rawValue.trim()),
  };
}

function unquoteEnvValue(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value.split(/\s+#/, 1)[0]?.trim() ?? '';
}

function normalizeBaseUrlCandidate(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed.replace(/\/+$/, '');
}

function readEnvFileIfPresent(): string | undefined {
  return existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : undefined;
}

function main(): void {
  const baseUrl = resolveRareApiBaseUrlForTypeGeneration({
    envFileContent: readEnvFileIfPresent(),
    processEnvValue: process.env.RARE_API_BASE_URL,
  });
  const result = spawnSync(
    'openapi-typescript',
    [`${baseUrl}/doc`, '-o', SCHEMA_OUTPUT],
    { stdio: 'inherit' },
  );

  if (result.error !== undefined) {
    throw result.error;
  }
  process.exit(result.status ?? 1);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
