import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isPrivateKeyString } from '@rareprotocol/rare-sdk/validation';
import { privateKeyToAccount } from 'viem/accounts';
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

async function approveThroughConnect(connect: string, code: string, wallet: ReturnType<typeof privateKeyToAccount>): Promise<void> {
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
  const identity = { address: wallet.address, chainId: 1 };
  const challenge = await request({ action: 'challenge', ...identity }, z.object({ message: z.string() }));
  expect(challenge.message).toContain(wallet.address);
  const approved = await request({
    action: 'approve', ...identity, signature: await wallet.signMessage({ message: challenge.message }),
  }, z.object({ status: z.string() }));
  expect(approved.status).toBe('approved');
}

describe('built CLI against deployed account services', () => {
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
        expect(parseJsonStdout(await run(['auth', 'login', '--wallet', '--chain', 'mainnet']))).toMatchObject({ status: 'authorized' });
        const walletStatus = parseJsonStdout<{ accountId: string; address: string }>(await run(['auth', 'status', '--verify']));
        expect(walletStatus.address.toLowerCase()).toBe(wallet.address.toLowerCase());
        const updated = parseJsonStdout<{ profile: { bio: string } }>(await run(
          ['profile', 'update', '--stdin'], JSON.stringify({ profile: { bio: 'Rare CLI deployed E2E' } }),
        ));
        expect(updated.profile.bio).toBe('Rare CLI deployed E2E');
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
