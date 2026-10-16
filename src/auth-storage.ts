import { AsyncLocalStorage } from 'node:async_hooks';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { lstat, mkdir, open, rename, rmdir, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { validateStorageScope, type AuthStorageScope } from './auth-storage-core.js';

/** Structurally compatible with RareAccountSessionStore; SDK validates loaded sessions. */
export type AuthCredentialStore = {
  get: () => Promise<unknown>;
  set: (value: unknown) => Promise<void>;
  clear: () => Promise<void>;
  withLock: <T>(operation: () => Promise<T>) => Promise<T>;
};

export type AuthStorageOptions = AuthStorageScope & {
  /** Explicit opt-in to plaintext protected by POSIX permissions. */
  backend?: 'file' | 'keychain';
  directory?: string;
  lockTimeoutMs?: number;
  signal?: AbortSignal;
  /** A separate lock and secret record for each device request. */
  pendingRequestId?: string;
};

export class AuthStorageError extends Error {
  constructor(readonly code: 'storage_unavailable' | 'storage_unsafe' | 'storage_invalid' | 'storage_lock_timeout' | 'storage_lock_required', message: string) {
    super(message);
    this.name = 'AuthStorageError';
  }
}

class LockLease {
  active = true;
  close(): void { this.active = false; }
}

/** Never copy raw filesystem/JSON/native errors into cause chains: they may contain secrets. */
function storageFailure(): AuthStorageError {
  return new AuthStorageError('storage_unavailable', 'Unable to access auth storage. Check directory ownership, permissions and available disk space.');
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

async function safeIo<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AuthStorageError) throw error;
    throw storageFailure();
  }
}

function assertPrivate(info: Stats, directory: boolean): void {
  if ((directory ? !info.isDirectory() : !info.isFile()) ||
      info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0 ||
      (!directory && info.nlink !== 1)) {
    throw new AuthStorageError('storage_unsafe', 'Auth storage must be owned by the current user, private, and free of symlinks or multiply linked files.');
  }
}

/** Reject symlinks in every component, including existing ancestors. */
async function ensureDirectory(directory: string): Promise<void> {
  const root = parse(directory).root;
  const parts = directory.slice(root.length).split('/').filter(Boolean);
  for (const [index] of parts.entries()) {
    const component = join(root, ...parts.slice(0, index + 1));
    try {
      await mkdir(component, { mode: 0o700 });
    } catch (error) {
      if (!hasCode(error, 'EEXIST')) throw error;
    }
    const info = await lstat(component);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new AuthStorageError('storage_unsafe', 'Auth storage paths must not contain symlinks or non-directory components.');
    }
    if ((info.mode & 0o022) !== 0 && (info.mode & 0o1000) === 0) {
      throw new AuthStorageError('storage_unsafe', 'Auth storage ancestors must not be writable by other users unless protected by the sticky bit.');
    }
    if (component === directory) assertPrivate(info, true);
  }
}

async function inspectFile(file: string): Promise<Stats | undefined> {
  try {
    const info = await lstat(file);
    assertPrivate(info, false);
    return info;
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return undefined;
    throw error;
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { await handle.sync(); } finally { await handle.close(); }
}

async function readSecret(file: string): Promise<unknown> {
  if (await inspectFile(file) === undefined) return undefined;
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    assertPrivate(info, false);
    if (info.size > 1024 * 1024) {
      throw new AuthStorageError('storage_invalid', 'Auth storage record exceeds the size limit.');
    }
    const contents = await handle.readFile('utf8');
    try {
      const value: unknown = JSON.parse(contents);
      return value;
    } catch {
      throw new AuthStorageError('storage_invalid', 'Auth storage contains invalid JSON. Restore the record or explicitly clear it before logging in again.');
    }
  } finally { await handle.close(); }
}

function encodeSecret(value: unknown): string {
  try {
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
      throw new AuthStorageError('storage_invalid', 'Auth storage value is missing.');
    }
    const encoded = JSON.stringify(value);
    if (Buffer.byteLength(encoded) > 1024 * 1024) {
      throw new AuthStorageError('storage_invalid', 'Auth storage value is missing or exceeds the size limit.');
    }
    return encoded;
  } catch {
    throw new AuthStorageError('storage_invalid', 'Auth storage value must be serializable JSON within the size limit.');
  }
}

async function replaceSecret(file: string, contents: string): Promise<void> {
  await inspectFile(file);
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    try {
      await handle.writeFile(contents, 'utf8');
      await handle.sync();
    } finally { await handle.close(); }
    await inspectFile(file);
    await rename(temporary, file);
    await syncDirectory(dirname(file));
  } finally {
    try { await unlink(temporary); } catch (error) {
      if (!hasCode(error, 'ENOENT')) throw error;
    }
  }
}

async function acquireLock(path: string, deadline: number, signal?: AbortSignal): Promise<Stats> {
  for (;;) {
    signal?.throwIfAborted();
    try {
      await mkdir(path, { mode: 0o700 });
      const info = await lstat(path);
      assertPrivate(info, true);
      return info;
    } catch (error) {
      if (!hasCode(error, 'EEXIST')) throw error;
    }
    try { assertPrivate(await lstat(path), true); } catch (error) {
      if (hasCode(error, 'ENOENT')) continue;
      throw error;
    }
    if (Date.now() >= deadline) {
      throw new AuthStorageError('storage_lock_timeout',
        `Timed out waiting for auth storage lock at ${path}. Another process may be refreshing credentials. If a process crashed, stop all CLI auth processes before manually removing this empty lock directory. Locks are never stolen based on age.`);
    }
    await delay(Math.min(40, Math.max(1, deadline - Date.now())), undefined, { signal });
  }
}

export function createAuthStore(options: AuthStorageOptions): AuthCredentialStore {
  if (process.platform === 'win32') {
    throw new AuthStorageError('storage_unavailable', 'CLI auth storage requires POSIX ownership and permissions for its interprocess lock. Windows storage is unavailable until ACL validation is supported.');
  }
  const scope = parseScope(options);
  const directory = options.directory ?? join(homedir(), '.rare', 'auth');
  if (!isAbsolute(directory) || resolve(directory) !== directory || directory === parse(directory).root) {
    throw new AuthStorageError('storage_invalid', 'Auth storage directory must be a normalized absolute path below the filesystem root.');
  }
  const timeout = options.lockTimeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 120_000) {
    throw new AuthStorageError('storage_invalid', 'Auth storage lock timeout must be an integer from 1 to 120000 milliseconds.');
  }
  if (options.pendingRequestId !== undefined && !/^[a-zA-Z0-9_-]{1,128}$/u.test(options.pendingRequestId)) {
    throw new AuthStorageError('storage_invalid', 'Invalid pending device request ID.');
  }
  const key = createHash('sha256').update(JSON.stringify([scope.authBaseUrl, scope.apiBaseUrl, scope.clientId, options.pendingRequestId ?? null])).digest('hex');
  // Different lock directories must never address the same native credential.
  const keychainKey = createHash('sha256').update(JSON.stringify([directory, key])).digest('hex');
  const file = join(directory, `${options.pendingRequestId === undefined ? 'session' : 'device'}-${key}.json`);
  const lock = `${file}.lock`;
  const context = new AsyncLocalStorage<LockLease>();
  const requireLock = (): void => {
    if (context.getStore()?.active !== true) {
      throw new AuthStorageError('storage_lock_required', 'Auth storage access requires withLock.');
    }
  };
  return {
    async get(): Promise<unknown> {
      requireLock();
      if (options.backend !== 'file') return keychainOperation(keychainKey, 'get');
      return safeIo(async () => { await ensureDirectory(directory); return readSecret(file); });
    },
    async set(value): Promise<void> {
      requireLock();
      const encoded = encodeSecret(value);
      if (options.backend !== 'file') {
        await keychainOperation(keychainKey, 'set', encoded);
        return;
      }
      await safeIo(async () => { await ensureDirectory(directory); await replaceSecret(file, encoded); });
    },
    async clear(): Promise<void> {
      requireLock();
      if (options.backend !== 'file') {
        await keychainOperation(keychainKey, 'clear');
        return;
      }
      await safeIo(async () => {
        await ensureDirectory(directory);
        if (await inspectFile(file) === undefined) return;
        await unlink(file);
        await syncDirectory(directory);
      });
    },
    async withLock<T>(operation: () => Promise<T>): Promise<T> {
      if (context.getStore()?.active === true) {
        throw new AuthStorageError('storage_lock_required', 'Nested auth storage locks are unsupported.');
      }
      const owner = await safeIo(async () => {
        await ensureDirectory(directory);
        return acquireLock(lock, Date.now() + timeout, options.signal);
      });
      const lease = new LockLease();
      try {
        return await context.run(lease, operation);
      } finally {
        lease.close();
        await safeIo(async () => {
          const current = await lstat(lock);
          assertPrivate(current, true);
          if (current.ino !== owner.ino || current.dev !== owner.dev) {
            throw new AuthStorageError('storage_unsafe', 'Auth storage lock ownership changed. Stop concurrent auth operations and inspect the storage directory.');
          }
          await rmdir(lock);
        });
      }
    },
  };
}

/** Isolate native calls so a locked/unavailable desktop store cannot hang the CLI.
 * Secrets travel only over stdin/stdout pipes, never process arguments or errors.
 * Linux explicitly requires Secret Service rather than falling back to keyutils.
 */
const keychainScript = `
const { Entry } = require(process.argv[1]);
const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  try {
    const { key, operation, value } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const entry = new Entry('rare-cli.account-auth.v1', key, { linux: { store: 'secret-service' } });
    if (operation === 'get') {
      const secret = entry.getPassword();
      process.stdout.write(JSON.stringify(secret == null ? { found: false } : { found: true, value: JSON.parse(secret) }));
    } else if (operation === 'set') {
      entry.setPassword(value);
      process.stdout.write('{}');
    } else {
      entry.deletePassword();
      process.stdout.write('{}');
    }
  } catch { process.exitCode = 1; }
});
`;

async function keychainOperation(key: string, operation: 'get' | 'set' | 'clear', value?: string): Promise<unknown> {
  try {
    const modulePath = import.meta.resolve('@napi-rs/keyring');
    const result = await new Promise<string>((resolveResult, reject) => {
      const child = execFile(process.execPath, ['-e', keychainScript, fileURLToPath(modulePath)], {
        timeout: 10_000,
        killSignal: 'SIGKILL',
        maxBuffer: 2 * 1024 * 1024,
        encoding: 'utf8',
      }, (error, stdout) => {
        if (error !== null) reject(new Error('Keychain operation failed.'));
        else resolveResult(stdout);
      });
      child.stdin?.on('error', () => { reject(new Error('Keychain input failed.')); });
      child.stdin?.end(JSON.stringify({ key, operation, value }));
    });
    const parsed: unknown = JSON.parse(result);
    return typeof parsed === 'object' && parsed !== null && 'found' in parsed && parsed.found === true && 'value' in parsed
      ? parsed.value : undefined;
  } catch {
    throw new AuthStorageError('storage_unavailable', 'OS credential store is unavailable, locked, or failed. Unlock it in your desktop session, or explicitly select protected-file storage on a POSIX host. No file fallback was performed.');
  }
}

function parseScope(options: AuthStorageScope): AuthStorageScope {
  const url = URL.parse(options.authBaseUrl);
  const apiUrl = URL.parse(options.apiBaseUrl);
  if (url === null || apiUrl === null) throw new AuthStorageError('storage_invalid', 'Auth storage authority or API URL is invalid.');
  const result = validateStorageScope(url, apiUrl, options.clientId);
  if (!result.ok) throw new AuthStorageError('storage_invalid', result.message);
  return result.scope;
}
