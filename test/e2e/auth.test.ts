import { access, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
import { setTimeout as delay } from 'node:timers/promises';
import { privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import { verifyMessage } from 'viem';
import { describe, expect, it } from 'vitest';
import { createAuthStore } from '../../src/auth-storage.js';
import { runCli, parseJsonStdout, withTempHome, type CliResult } from '../helpers/cli.js';

const key = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const wallet = privateKeyToAccount(key);
const deviceSecret = 'device-secret-do-not-print';
const accessSecret = 'access-secret-do-not-print';
const refreshSecret = 'refresh-secret-do-not-print';
const profile = { accountId: '123', address: wallet.address, username: 'tester', email: null, profile: { displayName: null, bio: null, avatarUrl: null } };

class AuthService {
  base = '';
  polls = 0;
  refreshes = 0;
  challenges = 0;
  revocations = 0;
  approved = true;
  slowDown = false;
  deny = false;
  revokeFails = false;
  lastPatch: unknown;
  signatureVerified = false;

  configure(options: { base?: string; revokeFails?: boolean; slowDown?: boolean; deny?: boolean }): void {
    this.base = options.base ?? this.base;
    this.revokeFails = options.revokeFails ?? this.revokeFails;
    this.slowDown = options.slowDown ?? this.slowDown;
    this.deny = options.deny ?? this.deny;
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const send = (value: unknown, status = 200): void => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(value));
    };
    const tokens = (): void => { send({ access_token: accessSecret, refresh_token: refreshSecret, token_type: 'Bearer', expires_in: 300, scope: 'rare:account offline_access' }); };
    if (request.url === '/auth/v2/device/authorization') {
      send({ device_code: deviceSecret, user_code: 'USER-CODE', verification_uri: `${this.base}/device`, expires_in: 600, interval: 1 });
    } else if (request.url === '/auth/v2/token') {
      const body = new URLSearchParams(await text(request));
      expect(body.get('client_id')).toBe('rare-cli');
      const grant = body.get('grant_type');
      if (grant === 'refresh_token') {
        this.refreshes += 1;
        expect(body.get('refresh_token')).toBe(refreshSecret);
        tokens();
      } else if (grant === 'urn:superrare:params:oauth:grant-type:siwe') {
        const signature = body.get('signature');
        if (signature === null || !signature.startsWith('0x')) throw new Error('Missing signature');
        // Structural check avoids assertions in the runtime implementation; this is controlled fixture data.
        this.signatureVerified = await verifyMessage({ address: wallet.address, message: body.get('message') ?? '', signature: `0x${signature.slice(2)}` });
        tokens();
      } else {
        this.polls += 1;
        expect(body.get('device_code')).toBe(deviceSecret);
        if (this.deny) send({ error: 'access_denied', error_description: deviceSecret }, 400);
        else if (this.slowDown) send({ error: 'slow_down' }, 400);
        else if (this.approved) tokens();
        else send({ error: 'authorization_pending' }, 400);
      }
    } else if (request.url === '/auth/v2/wallet/challenge') {
      this.challenges += 1;
      send({ challenge_id: 'challenge-id', expires_in: 300, message: createSiweMessage({
        address: wallet.address, chainId: 11155111, domain: new URL(this.base).host,
        uri: `${this.base}/auth/v2`, version: '1', nonce: 'testnonce12345678',
        issuedAt: new Date(), expirationTime: new Date(Date.now() + 300000),
      }) });
    } else if (request.url === '/auth/v2/revoke') {
      this.revocations += 1;
      if (this.revokeFails) send({ error: 'temporarily_unavailable', error_description: refreshSecret }, 503);
      else { response.writeHead(200); response.end(); }
    } else if (request.url === '/v1/me') {
      expect(request.headers.authorization).toBe(`Bearer ${accessSecret}`);
      if (request.method === 'PATCH') this.lastPatch = JSON.parse(await text(request));
      send({ data: profile });
    } else send({ error: 'not_found' }, 404);
  }
}

async function fixture(operation: (service: AuthService, home: string, run: (args: string[], input?: string) => Promise<CliResult>) => Promise<void>): Promise<void> {
  await withTempHome(async temporary => {
    const home = await realpath(temporary);
    const service = new AuthService();
    const failures: unknown[] = [];
    const server = createServer((request, response) => {
      void service.handle(request, response).catch((error: unknown) => {
        // eslint-disable-next-line functional/immutable-data
        failures.push(error);
        response.writeHead(500); response.end();
      });
    });
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('No fixture address');
    service.configure({ base: `http://127.0.0.1:${address.port}` });
    const run = async (args: string[], input?: string): Promise<CliResult> => {
      const result = await runCli(['--json', ...args], { home, input, env: {
        RARE_API_URL: service.base, RARE_AUTH_STORAGE: 'file', RARE_AUTH_DIRECTORY: join(home, '.rare/auth'),
      } });
      for (const secret of [deviceSecret, accessSecret, refreshSecret, key]) {
        expect(result.stdout + result.stderr).not.toContain(secret);
      }
      return result;
    };
    try { await operation(service, home, run); expect(failures).toEqual([]); }
    finally { await new Promise<void>((resolve, reject) => { server.close(error => { if (error) reject(error); else resolve(); }); }); }
  });
}

async function start(run: (args: string[]) => Promise<CliResult>): Promise<string> {
  const result = parseJsonStdout<{ requestId: string; status: string; userCode: string }>(await run(['auth', 'login', '--no-wait']));
  expect(result.status).toBe('pending');
  expect(result.userCode).toBe('USER-CODE');
  return result.requestId;
}

describe.skipIf(process.platform === 'win32')('built CLI account authentication', () => {
  it('defaults to the production API without a separate auth URL and keeps endpoint overrides isolated', async () => {
    await withTempHome(async temporary => {
      const home = await realpath(temporary);
      const directory = join(home, 'production-auth');
      const scope = { apiBaseUrl: 'https://api.superrare.com', authBaseUrl: 'https://api.superrare.com/auth/v2', clientId: 'rare-cli' };
      const store = createAuthStore({ ...scope, backend: 'file', directory });
      await store.withLock(async () => { await store.set({ ...scope, revision: 'test-production', accessToken: accessSecret,
        refreshToken: refreshSecret, expiresAt: Date.now() + 300000, scope: 'rare:account offline_access' }); });
      const env = { RARE_API_URL: undefined, RARE_AUTH_URL: 'https://obsolete-auth.example/auth/v2',
        RARE_AUTH_STORAGE: 'file', RARE_AUTH_DIRECTORY: directory };
      const result = await runCli(['--json', 'auth', 'status'], { home, env });
      expect(parseJsonStdout(result)).toMatchObject({ status: 'present', verified: false });
      expect(result.stdout + result.stderr).not.toContain(accessSecret);
      expect(result.stdout + result.stderr).not.toContain(refreshSecret);
      expect(parseJsonStdout(await runCli(['--json', 'auth', 'status', '--api-url', 'https://other-api.example'], { home, env })))
        .toMatchObject({ status: 'signed_out' });
      const help = await runCli(['auth', 'login', '--help'], { home, env });
      expect(help.stdout).toContain('--api-url');
      expect(help.stdout).not.toContain('--auth-url');
      expect((await runCli(['auth', 'status', '--auth-url', 'https://obsolete-auth.example'], { home, env })).code).toBe(1);
    });
  });

  it('uses a normalized API flag over the environment for both device and profile routes', async () => {
    await fixture(async (service, home) => {
      const directory = join(home, 'one-api');
      const env = { RARE_API_URL: 'https://unused-api.example', RARE_AUTH_STORAGE: 'file', RARE_AUTH_DIRECTORY: directory };
      const run = async (args: string[]): Promise<CliResult> => runCli(['--json', ...args, '--api-url', `${service.base}/`], { home, env });
      const requestId = await start(run);
      const pending = createAuthStore({ apiBaseUrl: service.base, authBaseUrl: `${service.base}/auth/v2`, clientId: 'rare-cli', backend: 'file', directory, pendingRequestId: requestId });
      await pending.withLock(async () => { expect(await pending.get()).toMatchObject({ apiBaseUrl: service.base, authBaseUrl: `${service.base}/auth/v2` }); });
      expect(parseJsonStdout(await run(['auth', 'login', '--resume', requestId]))).toMatchObject({ status: 'authorized' });
      expect(parseJsonStdout(await run(['profile', 'get']))).toEqual(profile);
    });
  });

  it('does not load or migrate sessions and pending grants from a direct auth-service scope', async () => {
    await fixture(async (service, home, run) => {
      const scope = { apiBaseUrl: service.base, authBaseUrl: 'https://previous-auth.example/auth/v2', clientId: 'rare-cli' };
      const storage = { ...scope, backend: 'file' as const, directory: join(home, '.rare/auth') };
      const legacy = createAuthStore(storage);
      const session = { ...scope, revision: 'legacy', accessToken: accessSecret, refreshToken: refreshSecret,
        expiresAt: Date.now() + 300000, scope: 'rare:account offline_access' };
      await legacy.withLock(async () => { await legacy.set(session); });
      const pending = createAuthStore({ ...storage, pendingRequestId: 'legacy-request' });
      await pending.withLock(async () => { await pending.set({ ...scope, deviceCode: deviceSecret }); });
      expect(parseJsonStdout(await run(['auth', 'status']))).toMatchObject({ status: 'signed_out' });
      expect((await run(['auth', 'login', '--poll', 'legacy-request'])).stderr).toContain('missing or invalid');
      expect(service.polls + service.refreshes).toBe(0);
      await legacy.withLock(async () => { expect(await legacy.get()).toEqual(session); });
    });
  });

  it('isolates auth records through directory flag and environment without changing wallet configuration', async () => {
    await fixture(async (service, home) => {
      const directory = join(home, 'isolated-auth');
      const env = { RARE_API_URL: service.base,
        RARE_AUTH_STORAGE: 'file', RARE_AUTH_DIRECTORY: directory };
      const started = parseJsonStdout<{ requestId: string }>(await runCli(['--json', 'auth', 'login', '--no-wait'], { home, env }));
      expect((await readdir(directory)).some(name => name.startsWith('device-'))).toBe(true);
      await expect(access(join(home, '.rare'))).rejects.toMatchObject({ code: 'ENOENT' });
      const resumed = await runCli(['--json', 'auth', 'login', '--resume', started.requestId,
        '--auth-directory', directory], { home, env: { ...env, RARE_AUTH_DIRECTORY: join(home, 'unused') } });
      expect(parseJsonStdout(resumed)).toMatchObject({ status: 'authorized' });
      await expect(access(join(home, 'unused'))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(access(join(home, '.rare'))).rejects.toMatchObject({ code: 'ENOENT' });
      for (const secret of [deviceSecret, accessSecret, refreshSecret]) expect(resumed.stdout + resumed.stderr).not.toContain(secret);
    });
  });

  it('runs machine-readable device login, status, refresh, profile and revocation across processes', async () => {
    await fixture(async (service, home, run) => {
      expect(parseJsonStdout(await run(['auth', 'status']))).toEqual({ status: 'signed_out', verified: false });
      const requestId = await start(run);
      expect(parseJsonStdout(await run(['auth', 'login', '--resume', requestId]))).toMatchObject({ status: 'authorized' });
      expect(parseJsonStdout(await run(['auth', 'status']))).toMatchObject({ status: 'present', verified: false });
      expect(parseJsonStdout(await run(['auth', 'status', '--verify']))).toMatchObject({ status: 'authenticated', accountId: '123' });
      const store = createAuthStore({ authBaseUrl: `${service.base}/auth/v2`, apiBaseUrl: service.base, clientId: 'rare-cli', backend: 'file', directory: join(home, '.rare/auth') });
      await store.withLock(async () => {
        const session = await store.get();
        if (typeof session !== 'object' || session === null) throw new Error('Missing saved session');
        await store.set({ ...session, expiresAt: 1 });
      });
      expect(parseJsonStdout(await run(['profile', 'get']))).toEqual(profile);
      expect(service.refreshes).toBe(1);
      const patch = { profile: { bio: null } };
      expect(parseJsonStdout(await run(['profile', 'update', '--stdin'], JSON.stringify(patch)))).toEqual(profile);
      expect(service.lastPatch).toEqual(patch);
      service.configure({ revokeFails: true });
      expect((await run(['auth', 'logout'])).code).toBe(1);
      expect(parseJsonStdout(await run(['auth', 'status']))).toMatchObject({ status: 'present' });
      service.configure({ revokeFails: false });
      expect(parseJsonStdout(await run(['auth', 'logout']))).toMatchObject({ status: 'signed_out' });
      expect(parseJsonStdout(await run(['auth', 'status']))).toEqual({ status: 'signed_out', verified: false });
      expect((await run(['profile', 'get'])).code).toBe(1);
      await store.withLock(async () => { expect(await store.get()).toMatchObject({ loggedOut: true }); });
    });
  });

  it('persists slowdown cadence and does not poll early from a new process', async () => {
    await fixture(async (service, _home, run) => {
      service.configure({ slowDown: true });
      const requestId = await start(run);
      await delay(1050);
      expect(parseJsonStdout(await run(['auth', 'login', '--poll', requestId]))).toMatchObject({ status: 'slow_down', interval: 6 });
      const polls = service.polls;
      expect(parseJsonStdout(await run(['auth', 'login', '--poll', requestId]))).toMatchObject({ status: 'pending', interval: 6 });
      expect(service.polls).toBe(polls);
    });
  });

  it('wallet login requires existing configuration and signs without changing wallet data', async () => {
    await fixture(async (service, home, run) => {
      expect((await run(['auth', 'login', '--wallet'])).code).toBe(1);
      expect(service.challenges).toBe(0);
      await mkdir(join(home, '.rare'), { mode: 0o700 });
      const config = JSON.stringify({ chains: { sepolia: { privateKey: key } } });
      await writeFile(join(home, '.rare/config.json'), config, { mode: 0o600 });
      expect(parseJsonStdout(await run(['auth', 'login', '--wallet']))).toMatchObject({ status: 'authorized' });
      expect(service.signatureVerified).toBe(true);
      await run(['auth', 'logout', '--local-only']);
      expect(service.revocations).toBe(0);
      expect(await readFile(join(home, '.rare/config.json'), 'utf8')).toBe(config);
    });
  });

  it('fails invalid option combinations and profile input before authentication I/O', async () => {
    await fixture(async (service, _home, run) => {
      for (const args of [['auth', 'login'], ['auth', 'login', '--wallet', '--device'], ['auth', 'login', '--poll', '../secret'], ['auth', 'login', '--no-wait', '--chain', 'sepolia']]) {
        const result = await run(args);
        expect(result.code).toBe(1);
        expect(result.stdout).toBe('');
      }
      expect((await run(['profile', 'update', '--stdin'], '{secret')).code).toBe(1);
      expect((await run(['profile', 'update', '--stdin'], '{"accountId":"456"}')).code).toBe(1);
      expect(service.challenges + service.polls + service.refreshes).toBe(0);
    });
  });

  it('denial removes pending secrets and a logout fences an older device request', async () => {
    await fixture(async (service, _home, run) => {
      service.configure({ deny: true });
      const denied = await start(run);
      expect((await run(['auth', 'login', '--resume', denied])).code).toBe(1);
      expect((await run(['auth', 'login', '--poll', denied])).stderr).toContain('missing or invalid');
      service.configure({ deny: false });
      const superseded = await start(run);
      await run(['auth', 'logout', '--local-only']);
      const completion = await run(['auth', 'login', '--resume', superseded]);
      expect(completion.code).toBe(1);
      expect(completion.stderr).toContain('session_superseded');
      expect((await run(['auth', 'login', '--poll', superseded])).stderr).toContain('missing or invalid');
      expect(parseJsonStdout(await run(['auth', 'status']))).toMatchObject({ status: 'signed_out' });
    });
  });
});
