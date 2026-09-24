import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createAuthStore } from '../../src/auth-storage.js';
import { withTempHome } from '../helpers/cli.js';

/** Explicit opt-in: this writes a disposable item to the real OS credential store. */
describe.skipIf(process.env.RARE_TEST_KEYCHAIN !== '1' || process.platform === 'win32')('native auth keychain', () => {
  it('round trips and deletes a uniquely scoped secret through the native subprocess', async () => {
    await withTempHome(async temporary => {
      const store = createAuthStore({
        authBaseUrl: `https://keychain-test.example/${randomUUID()}`,
        apiBaseUrl: 'https://keychain-test.example/api', clientId: 'rare-cli',
        directory: await realpath(temporary), backend: 'keychain',
      });
      await store.withLock(async () => {
        try {
          expect(await store.get()).toBeUndefined();
          await store.set({ secret: 'disposable-keychain-test-value' });
          expect(await store.get()).toEqual({ secret: 'disposable-keychain-test-value' });
          await store.clear();
          expect(await store.get()).toBeUndefined();
        } finally { await store.clear(); }
      });
    });
  });
});
