import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { Command, Option } from 'commander';
import { createRareAccountClient, RareAuthError, type RareAccountClient, type RareDeviceAuthorization, type RareAccountSession } from '@rareprotocol/rare-sdk';
import { DEFAULT_RARE_API_BASE_URL } from '@rareprotocol/rare-sdk/data-access/base-url';
import { AuthStorageError, createAuthStore, type AuthStorageOptions } from './auth-storage.js';
import { deriveAccountStorageScope } from './auth-storage-core.js';
import { parsePendingAuthorization } from './commands/auth-core.js';
import { output } from './output.js';

export type AccountCommandOptions = {
  apiUrl?: string;
  authDirectory?: string;
  storage: 'file' | 'keychain';
};

export function accountCommand(name: string): Command {
  return new Command(name)
    .addOption(new Option('--api-url <url>', 'Rare API base URL; authentication uses its /auth/v2 route').default(DEFAULT_RARE_API_BASE_URL).env('RARE_API_URL'))
    .addOption(new Option('--auth-directory <path>', 'private absolute directory for auth records and locks').env('RARE_AUTH_DIRECTORY'))
    .addOption(new Option('--storage <backend>', 'credential backend; file explicitly opts into plaintext with private POSIX permissions').choices(['keychain', 'file']).default('keychain').env('RARE_AUTH_STORAGE'));
}

export function storageOptions(options: AccountCommandOptions): AuthStorageOptions {
  const apiUrl = URL.parse(options.apiUrl ?? DEFAULT_RARE_API_BASE_URL);
  if (apiUrl === null) throw new AuthStorageError('storage_invalid', 'Rare API base URL is invalid.');
  const result = deriveAccountStorageScope(apiUrl, 'rare-cli');
  if (!result.ok) throw new AuthStorageError('storage_invalid', result.message);
  return { ...result.scope, backend: options.storage,
    ...(options.authDirectory === undefined ? {} : { directory: options.authDirectory }) };
}

export function accountClient(options: AuthStorageOptions): RareAccountClient {
  const sessionStore = createAuthStore(options);
  return createRareAccountClient({ apiBaseUrl: options.apiBaseUrl, clientId: 'rare-cli', sessionStore });
}

/** Verify writes using a disposable record before issuing durable server credentials. */
export async function preflightStorage(options: AuthStorageOptions): Promise<void> {
  const probe = createAuthStore({ ...options, pendingRequestId: `probe-${randomUUID()}` });
  await probe.withLock(async () => { await probe.set({ probe: true }); await probe.clear(); });
}

export function safeSession(session: RareAccountSession): { expiresAt: number; scope: string } {
  return { expiresAt: session.expiresAt, scope: session.scope };
}

export function printAuthorized(session: RareAccountSession): void {
  output({ status: 'authorized', ...safeSession(session) }, () => { console.log('Logged in. Credentials saved.'); });
}

export function printDeviceRequest(requestId: string, authorization: RareDeviceAuthorization): void {
  output({ status: 'pending', requestId, verificationUri: authorization.verificationUri,
    userCode: authorization.userCode, expiresAt: authorization.expiresAt, interval: authorization.interval, nextPollAt: authorization.nextPollAt }, () => {
    console.log(`Open ${authorization.verificationUri} and enter code ${authorization.userCode}.`);
    console.log(`Request: ${requestId}. This login grants full account access.`);
  });
}

export async function continueDeviceLogin(client: RareAccountClient, options: AuthStorageOptions, requestId: string, wait: boolean, signal: AbortSignal): Promise<void> {
  const pending = createAuthStore({ ...options, pendingRequestId: requestId, signal });
  await pending.withLock(async () => {
    for (;;) {
      const parsed = parsePendingAuthorization(await pending.get());
      if (!parsed.ok) throw new Error(parsed.message);
      const authorization = parsed.value;
      if (wait) {
        await delay(Math.max(0, Math.min(authorization.nextPollAt, authorization.expiresAt) - Date.now()), undefined, { signal });
      }
      try {
        const result = await client.auth.pollDeviceAuthorization(authorization, { signal });
        if (result.status === 'authorized') {
          try { await pending.clear(); } catch {
            throw new AuthStorageError('storage_unavailable', 'Login credentials were saved, but pending device request cleanup failed. Check auth status before starting another login.');
          }
          printAuthorized(result.session);
          return;
        }
        await pending.set(result.authorization);
        if (!wait) {
          output({ status: result.status, requestId, expiresAt: result.authorization.expiresAt,
            interval: result.authorization.interval, nextPollAt: result.authorization.nextPollAt }, () => { console.log(`Device authorization ${result.status}. Request: ${requestId}`); });
          return;
        }
      } catch (error) {
        if (error instanceof RareAuthError && ['access_denied', 'expired_token', 'session_superseded'].includes(error.code)) await pending.clear();
        throw error;
      }
    }
  });
}

export async function withCancellation(operation: (signal: AbortSignal) => Promise<void>): Promise<void> {
  const controller = new AbortController();
  const abort = (): void => { controller.abort(); };
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  try { await operation(controller.signal); } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
}

export async function openVerificationUrl(url: string): Promise<void> {
  const executable = process.platform === 'darwin' ? 'open' : 'xdg-open';
  try { await promisify(execFile)(executable, [url], { timeout: 5000, maxBuffer: 1024 }); } catch {
    console.error('Could not open a browser. Use the verification URL shown above.');
  }
}
