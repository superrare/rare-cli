import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
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

export async function runCli(args: string[], opts: {
  home?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  timeoutMs?: number;
} = {}): Promise<CliResult> {
  const command = `rare ${redactArgs(args).join(' ')}`;
  const child = spawn(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: opts.home ?? process.env.HOME,
      USERPROFILE: opts.home ?? process.env.USERPROFILE,
      ...opts.env,
    },
    stdio: [opts.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  });
  if (opts.input !== undefined) {
    child.stdin?.end(opts.input);
  }
  const stdout = text(child.stdout!);
  const stderr = text(child.stderr!);
  const code = await waitForClose(child, opts.timeoutMs ?? 30_000, command);
  return { command, code, stdout: await stdout, stderr: await stderr };
}

function waitForClose(
  child: ReturnType<typeof spawn>,
  timeoutMs: number,
  command: string,
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`CLI timed out after ${timeoutMs}ms: ${command}`));
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

export function parseJsonStdout<T = Record<string, unknown>>(result: CliResult): T;
export function parseJsonStdout(result: CliResult): unknown {
  if (result.code !== 0) {
    throw new Error(formatCliFailure(result, `expected exit code 0, received ${result.code}`));
  }
  if (result.stderr !== '') {
    throw new Error(formatCliFailure(result, 'expected stderr to be empty'));
  }

  try {
    const parsed: unknown = JSON.parse(result.stdout);
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(formatCliFailure(result, `failed to parse stdout as JSON: ${message}`));
  }
}

function redactArgs(args: string[]): string[] {
  return args.map((arg, index) => {
    const previous = args[index - 1];
    if (previous === '--private-key' || previous === '--private-key-ref' || previous === '--rpc-url') {
      return '[redacted]';
    }
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
