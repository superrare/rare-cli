import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isPrivateKeyString } from '@rareprotocol/rare-sdk/validation';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseJsonStdout, runCli, withTempHome, type CliResult } from '../helpers/cli.js';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const deployedOrigin = (name: string, productionHost: string): string => {
  const value = required(name);
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash ||
      url.username || url.password || url.hostname === productionHost) {
    throw new Error(`${name} must be a non-production HTTPS origin`);
  }
  return url.origin;
};

async function approveThroughConnect(connect: string, code: string, wallet: ReturnType<typeof privateKeyToAccount>, decision: 'approve' | 'deny' = 'approve'): Promise<void> {
  const cookies = new Map<string, string>();
  const remember = (response: Response): void => {
    for (const setCookie of response.headers.getSetCookie()) {
      const [pair] = setCookie.split(';', 1);
      const separator = pair?.indexOf('=') ?? -1;
      if (pair !== undefined && separator > 0) {
        // The cookie jar represents the browser's HTTP state during this live flow.
        // eslint-disable-next-line functional/immutable-data
        cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
    }
  };
  const bootstrap = await fetch(`${connect}/api/device`, { signal: AbortSignal.timeout(15_000) });
  expect(bootstrap.status).toBe(200);
  remember(bootstrap);
  const bootstrapBody: unknown = await bootstrap.json();
  const { csrf } = z.object({ csrf: z.string() }).parse(bootstrapBody);
  expect(csrf).toMatch(/^[a-f0-9]{64}$/u);
  const request = async <T>(body: object, schema: z.ZodType<T>): Promise<T> => {
    const response = await fetch(`${connect}/api/device`, {
      method: 'POST',
      headers: { origin: connect, 'content-type': 'application/json', 'x-device-csrf': csrf,
        cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
    });
    expect(response.status).toBe(200);
    remember(response);
    const responseBody: unknown = await response.json();
    return schema.parse(responseBody);
  };
  const review = await request({ action: 'review', userCode: code }, z.object({ client_id: z.string(), user_code: z.string() }));
  expect(review).toMatchObject({ client_id: 'rare-cli', user_code: code });
  if (decision === 'deny') {
    expect(await request({ action: 'deny' }, z.object({ status: z.string() }))).toMatchObject({ status: 'denied' });
    return;
  }
  // Attack the deployed browser boundary before the legitimate approval.
  const attackHeaders: Record<string, string>[] = [
    { origin: 'https://attacker.example', 'x-device-csrf': csrf },
    { origin: connect, 'x-device-csrf': 'invalid' },
    { origin: connect },
  ];
  for (const overrides of attackHeaders) {
    const rejected = await fetch(`${connect}/api/device`, {
      method: 'POST', headers: { 'content-type': 'application/json',
        cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '), ...overrides },
      body: JSON.stringify({ action: 'deny' }), signal: AbortSignal.timeout(20_000),
    });
    expect(rejected.status).toBe(403);
  }
  const identity = { address: wallet.address, chainId: 1 };
  const challenge = await request({ action: 'challenge', ...identity }, z.object({ message: z.string() }));
  expect(challenge.message).toContain(wallet.address);
  const approved = await request({
    action: 'approve', ...identity, signature: await wallet.signMessage({ message: challenge.message }),
  }, z.object({ status: z.string() }));
  expect(approved.status).toBe('approved');
}

describe('built CLI against deployed account services', () => {
  it('logs in a fresh wallet without creating a profile', async () => {
    const api = deployedOrigin('RARE_ACCOUNT_TEST_API_URL', 'api.superrare.com');
    const privateKey = generatePrivateKey();
    await withTempHome(async temporary => {
      const home = await realpath(temporary);
      const directory = join(home, '.rare');
      await mkdir(directory, { mode: 0o700 });
      await writeFile(join(directory, 'config.json'), JSON.stringify({
        defaultChain: 'mainnet', chains: { mainnet: { privateKey } },
      }), { mode: 0o600 });
      const env = { RARE_API_URL: api, RARE_AUTH_STORAGE: 'file', RARE_AUTH_DIRECTORY: join(directory, 'auth') };
      const run = (args: string[]): Promise<CliResult> => runCli(['--json', ...args], { home, env, timeoutMs: 45_000 });
      try {
        expect(parseJsonStdout(await run(['auth', 'login', '--wallet', '--chain', 'mainnet']))).toMatchObject({ status: 'authorized' });
        for (const args of [['profile', 'get'], ['profile', 'update', '--bio', 'No automatic signup']]) {
          const response = await run(args);
          expect(response.code).not.toBe(0);
          expect(`${response.stdout}${response.stderr}`).toContain('account_required');
        }
      } finally {
        expect((await run(['auth', 'logout'])).code).toBe(0);
      }
    });
  }, 120_000);
  it('logs in by wallet and device, updates the profile, and revokes both sessions', async () => {
    const api = deployedOrigin('RARE_ACCOUNT_TEST_API_URL', 'api.superrare.com');
    const connect = deployedOrigin('RARE_ACCOUNT_TEST_CONNECT_URL', 'connect.superrare.com');
    const privateKey = required('RARE_ACCOUNT_TEST_PRIVATE_KEY');
    if (!isPrivateKeyString(privateKey)) throw new Error('Invalid dedicated test wallet key');
    const wallet = privateKeyToAccount(privateKey);
    await withTempHome(async temporary => {
      const home = await realpath(temporary);
      const directory = join(home, '.rare');
      const authDirectory = join(directory, 'auth');
      await mkdir(directory, { mode: 0o700 });
      await writeFile(join(directory, 'config.json'), JSON.stringify({
        defaultChain: 'mainnet', chains: { mainnet: { privateKey } },
      }), { mode: 0o600 });
      const env = { RARE_API_URL: api, RARE_AUTH_STORAGE: 'file', RARE_AUTH_DIRECTORY: authDirectory };
      const run = (args: string[], input?: string): Promise<CliResult> => runCli(['--json', ...args], { home, env, input, timeoutMs: 45_000 });
      try {
        expect(parseJsonStdout(await run(['auth', 'status']))).toMatchObject({ status: 'signed_out' });
        const denied = parseJsonStdout<{ requestId: string; userCode: string }>(await run(
          ['auth', 'login', '--device', '--no-browser', '--no-wait'],
        ));
        await approveThroughConnect(connect, denied.userCode, wallet, 'deny');
        const resumed = await run(['auth', 'login', '--resume', denied.requestId]);
        expect(resumed.code).not.toBe(0);
        expect(`${resumed.stdout}${resumed.stderr}`).toContain('access_denied');
        expect(parseJsonStdout(await run(['auth', 'status']))).toMatchObject({ status: 'signed_out' });
        expect((await run(['profile', 'get'])).code).not.toBe(0);
        expect(parseJsonStdout(await run(['auth', 'login', '--wallet', '--chain', 'mainnet']))).toMatchObject({ status: 'authorized' });
        const walletStatus = parseJsonStdout<{ accountId: string; address: string }>(await run(['auth', 'status', '--verify']));
        expect(walletStatus.address.toLowerCase()).toBe(wallet.address.toLowerCase());
        const updated = parseJsonStdout<{ profile: { bio: string } }>(await run(
          ['profile', 'update', '--bio', 'Rare CLI deployed E2E'],
        ));
        expect(updated.profile.bio).toBe('Rare CLI deployed E2E');
        for (const args of [
          ['profile', 'update', '--bio', 'x'.repeat(181)],
          ['profile', 'update', '--avatar', 'https://example.com/a.png', '--clear-avatar'],
          ['profile', 'update', '--stdin', '--bio', 'conflicting'],
          ['profile', 'update', '--email', 'not-an-email'],
        ]) expect((await run(args)).code).not.toBe(0);
        expect((await run(['profile', 'update', '--stdin'], JSON.stringify({ accountId: '999', profile: { bio: 'unauthorized' } }))).code).not.toBe(0);
        const email = `cli-${wallet.address.slice(2, 10)}@example.com`;
        const socials = parseJsonStdout<{ email: string; profile: { website: string; twitterlink: string } }>(await run([
          'profile', 'update', '--email', email, '--website', 'https://example.com', '--twitter', 'https://x.com/rareprotocol',
        ]));
        expect(socials.email).toBe(email);
        expect(socials.profile.website).toBe('https://example.com');
        expect(socials.profile.twitterlink).toBe('https://x.com/rareprotocol');
        const own = parseJsonStdout<{ username: string }>(await run(['profile', 'get']));
        const publicProfile = parseJsonStdout(await run(['user', 'resolve', '--username', own.username]));
        expect(publicProfile.username).toBe(own.username);
        expect(JSON.stringify(publicProfile)).not.toContain(email);
        const avatarFile = join(directory, 'avatar.png');
        await writeFile(avatarFile, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9uQAAAAASUVORK5CYII=', 'base64'));
        const avatar = parseJsonStdout<{ profile: { avatar: string } }>(await run(['profile', 'avatar', 'upload', '--file', avatarFile]));
        expect(avatar.profile.avatar).toMatch(/^https:\/\//u);
        await writeFile(join(directory, 'invalid.png'), 'not an image');
        expect((await run(['profile', 'avatar', 'upload', '--file', join(directory, 'invalid.png')])).code).not.toBe(0);

        const patchFile = join(directory, 'profile-patch.json');
        await writeFile(patchFile, JSON.stringify({ profile: { fullName: 'CLI profile fixture' } }));
        expect(parseJsonStdout(await run(['profile', 'update', '--file', patchFile]))).toMatchObject({
          email, profile: { fullName: 'CLI profile fixture', bio: 'Rare CLI deployed E2E' },
        });
        expect(parseJsonStdout(await run(['profile', 'update', '--clear-avatar', '--clear-masthead']))).toMatchObject({
          profile: { avatar: '', masthead_universal_token_id: '' },
        });

        expect(parseJsonStdout(await run(['profile', 'get']))).toMatchObject({ accountId: walletStatus.accountId });
        expect(parseJsonStdout(await run(['auth', 'logout']))).toMatchObject({ status: 'signed_out' });

        const pending = parseJsonStdout<{ status: string; requestId: string; userCode: string }>(await run(
          ['auth', 'login', '--device', '--no-browser', '--no-wait'],
        ));
        expect(pending.status).toBe('pending');
        await approveThroughConnect(connect, pending.userCode, wallet);
        expect(parseJsonStdout(await run(['auth', 'login', '--resume', pending.requestId]))).toMatchObject({ status: 'authorized' });
        expect(parseJsonStdout(await run(['auth', 'status', '--verify']))).toMatchObject({
          accountId: walletStatus.accountId, verified: true,
        });
        expect(parseJsonStdout(await run(['profile', 'get']))).toMatchObject({
          profile: { bio: 'Rare CLI deployed E2E' },
        });
        expect(parseJsonStdout(await run(['auth', 'logout']))).toMatchObject({ status: 'signed_out' });
        expect(parseJsonStdout(await run(['auth', 'status']))).toMatchObject({ status: 'signed_out' });
      } finally {
        await run(['auth', 'logout']).catch(() => undefined);
      }
    });
  }, 180_000);
});
