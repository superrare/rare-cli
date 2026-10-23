import { execFile } from 'node:child_process';
import { chmod, link, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createAuthStore, type AuthStorageOptions } from '../../src/auth-storage.js';

const execute = promisify(execFile);
const scope = { authBaseUrl: 'https://auth.example/auth/v2', apiBaseUrl: 'https://api.example', clientId: 'rare-cli' };
const sample = { ...scope, accessToken: 'test-access-secret', refreshToken: 'test-refresh-secret', expiresAt: 500, scope: 'rare:account offline_access' };

async function inDirectory(operation: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'rare-auth-store-'));
  try { await operation(directory); } finally { await rm(directory, { force: true, recursive: true }); }
}

function options(directory: string, extra: Partial<AuthStorageOptions> = {}): AuthStorageOptions {
  return { ...scope, directory, backend: 'file', ...extra };
}

async function recordPath(directory: string): Promise<string> {
  const names = await readdir(directory);
  const name = names.find(item => item.endsWith('.json'));
  if (name === undefined) throw new Error('Expected credential record.');
  return join(directory, name);
}

describe.skipIf(process.platform === 'win32')('auth credential storage filesystem integration', () => {
  it('persists privately, survives a new instance, atomically replaces and clears idempotently', async () => {
    await inDirectory(async directory => {
      const store = createAuthStore(options(directory));
      await store.withLock(async () => {
        expect(await store.get()).toBeUndefined();
        await store.set(sample);
      });
      const file = await recordPath(directory);
      expect((await stat(directory)).mode & 0o777).toBe(0o700);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      const originalInode = (await stat(file)).ino;
      const reopened = createAuthStore(options(directory));
      await reopened.withLock(async () => {
        expect(await reopened.get()).toEqual(sample);
        await reopened.set({ ...sample, refreshToken: 'rotated' });
        expect(await reopened.get()).toEqual({ ...sample, refreshToken: 'rotated' });
        expect((await stat(file)).ino).not.toBe(originalInode);
        await reopened.clear();
        await reopened.clear();
        expect(await reopened.get()).toBeUndefined();
      });
      expect(await readdir(directory)).toEqual([]);
    });
  });

  it('normalizes authority and isolates API environment, client and pending grant records', async () => {
    await inDirectory(async directory => {
      const store = createAuthStore(options(directory));
      await store.withLock(async () => { await store.set(sample); });
      const equivalent = createAuthStore(options(directory, { authBaseUrl: 'https://AUTH.example:443/auth/v2/' }));
      await equivalent.withLock(async () => { expect(await equivalent.get()).toEqual(sample); });
      for (const extra of [{ apiBaseUrl: 'https://other.example' }, { clientId: 'rare-sdk' }, { pendingRequestId: 'request-1' }]) {
        const isolated = createAuthStore(options(directory, extra));
        await isolated.withLock(async () => {
          expect(await isolated.get()).toBeUndefined();
          await isolated.set({ deviceCode: 'pending-secret', interval: 5, nextPollAt: 50, expiresAt: 100 });
        });
      }
      await store.withLock(async () => { expect(await store.get()).toEqual(sample); });
    });
  });

  it('requires the callback lock context and releases locks after callback failure', async () => {
    await inDirectory(async directory => {
      const store = createAuthStore(options(directory));
      await expect(store.get()).rejects.toMatchObject({ code: 'storage_lock_required' });
      await expect(store.set(sample)).rejects.toMatchObject({ code: 'storage_lock_required' });
      await expect(store.clear()).rejects.toMatchObject({ code: 'storage_lock_required' });
      await expect(store.withLock(async () => { throw new Error('operation failed'); })).rejects.toThrow('operation failed');
      await store.withLock(async () => {
        await expect(store.withLock(async () => {})).rejects.toMatchObject({ code: 'storage_lock_required' });
        await store.set(sample);
      });
      expect((await readdir(directory)).some(name => name.endsWith('.lock'))).toBe(false);
    });
  });

  it('rejects symlink directories without touching the target', async () => {
    await inDirectory(async directory => {
      const target = join(directory, 'target');
      await mkdir(target, { mode: 0o700 });
      const alias = join(directory, 'alias');
      await symlink(target, alias);
      const store = createAuthStore(options(alias));
      await expect(store.withLock(async () => { await store.set(sample); })).rejects.toMatchObject({ code: 'storage_unsafe' });
      expect(await readdir(target)).toEqual([]);
    });
  });

  it('rejects symlink and multiply linked credential files on reads, writes and deletion', async () => {
    await inDirectory(async directory => {
      const store = createAuthStore(options(directory));
      await store.withLock(async () => { await store.set(sample); });
      const file = await recordPath(directory);
      const target = join(directory, 'valuable');
      await writeFile(target, 'unchanged', { mode: 0o600 });
      await rm(file);
      for (const makeLink of [symlink, link]) {
        await makeLink(target, file);
        await store.withLock(async () => {
          await expect(store.get()).rejects.toMatchObject({ code: 'storage_unsafe' });
          await expect(store.set(sample)).rejects.toMatchObject({ code: 'storage_unsafe' });
          await expect(store.clear()).rejects.toMatchObject({ code: 'storage_unsafe' });
        });
        expect(await readFile(target, 'utf8')).toBe('unchanged');
        await rm(file);
      }
    });
  });

  it('rejects permissive directories/files and corrupt JSON without exposing contents', async () => {
    await inDirectory(async directory => {
      const store = createAuthStore(options(directory));
      await chmod(directory, 0o755);
      await expect(store.withLock(async () => {})).rejects.toMatchObject({ code: 'storage_unsafe' });
      await chmod(directory, 0o700);
      await store.withLock(async () => { await store.set(sample); });
      const file = await recordPath(directory);
      await chmod(file, 0o644);
      await store.withLock(async () => { await expect(store.get()).rejects.toMatchObject({ code: 'storage_unsafe' }); });
      await chmod(file, 0o600);
      await writeFile(file, 'test-secret-should-never-appear{');
      await store.withLock(async () => {
        try {
          await store.get();
          throw new Error('Expected corrupt JSON rejection');
        } catch (error) {
          expect(error).toMatchObject({ code: 'storage_invalid' });
          expect(error).not.toHaveProperty('cause');
          expect(String(error)).not.toContain('test-secret');
        }
        await store.clear();
      });
    });
  });

  it('serializes read-modify-write across real Node processes', async () => {
    await inDirectory(async directory => {
      const module = resolve('src/auth-storage.ts');
      const script = `
        const { createAuthStore } = await import(process.argv[1]);
        const store = createAuthStore(JSON.parse(process.argv[2]));
        await store.withLock(async () => {
          const previous = await store.get();
          await new Promise(resolve => setTimeout(resolve, 40));
          await store.set((previous ?? 0) + 1);
        });
      `;
      await Promise.all(Array.from({ length: 5 }, async () => execute(process.execPath,
        ['--import', 'tsx', '--input-type=module', '-e', script, module, JSON.stringify(options(directory))])));
      const store = createAuthStore(options(directory));
      await store.withLock(async () => { expect(await store.get()).toBe(5); });
    });
  });

  it('times out on a crashed owner without stealing its lock', async () => {
    await inDirectory(async directory => {
      const script = `
        const { createAuthStore } = await import(process.argv[1]);
        const store = createAuthStore(JSON.parse(process.argv[2]));
        await store.withLock(async () => { process.exit(0); });
      `;
      await execute(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script,
        resolve('src/auth-storage.ts'), JSON.stringify(options(directory))]);
      const store = createAuthStore(options(directory, { lockTimeoutMs: 70 }));
      await expect(store.withLock(async () => {})).rejects.toMatchObject({ code: 'storage_lock_timeout' });
      expect((await readdir(directory)).filter(name => name.endsWith('.lock'))).toHaveLength(1);
    });
  });
});
