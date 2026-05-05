import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../../dist/index.js', import.meta.url));
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export type CliResult = {
  command: string;
  code: number | null;
  stdout: string;
  stderr: string;
};

export async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), 'rare-cli-test-home-'));
  try {
    return await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

export function runCli(args: string[], opts: {
  home?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
} = {}): Promise<CliResult> {
  const command = `rare ${redactArgs(args).join(' ')}`;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOME: opts.home ?? process.env.HOME,
        USERPROFILE: opts.home ?? process.env.USERPROFILE,
        ...opts.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`CLI timed out after ${opts.timeoutMs ?? 30_000}ms: ${command}`));
    }, opts.timeoutMs ?? 30_000);

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ command, code, stdout, stderr });
    });
  });
}

export function parseJsonStdout<T = Record<string, unknown>>(result: CliResult): T {
  if (result.code !== 0) {
    throw new Error(formatCliFailure(result, `expected exit code 0, received ${result.code}`));
  }
  if (result.stderr !== '') {
    throw new Error(formatCliFailure(result, 'expected stderr to be empty'));
  }

  try {
    return JSON.parse(result.stdout) as T;
  } catch (error) {
    throw new Error(formatCliFailure(result, `failed to parse stdout as JSON: ${(error as Error).message}`));
  }
}

function redactArgs(args: string[]): string[] {
  return args.map((arg, index) => {
    const previous = args[index - 1];
    if (previous === '--private-key' || previous === '--rpc-url') return '[redacted]';
    return arg;
  });
}

function formatCliFailure(result: CliResult, reason: string): string {
  return [
    `${result.command} failed: ${reason}`,
    `stdout:\n${result.stdout || '<empty>'}`,
    `stderr:\n${result.stderr || '<empty>'}`,
  ].join('\n\n');
}
