import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRareClient } from '@rareprotocol/rare-sdk';
import { isPrivateKeyString } from '@rareprotocol/rare-sdk/validation';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import { parseJsonStdout, runCli, withTempHome, type CliResult } from '../helpers/cli.js';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
describe('user follows through the built CLI and deployed services', () => {
  it('reads all public selectors without signing in, then follows and unfollows using persisted credentials', async () => {
    const url = new URL(required('RARE_ACCOUNT_TEST_API_URL'));
    if (url.protocol !== 'https:' || url.hostname === 'api.superrare.com' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('Use a non-production HTTPS API origin');
    const privateKey = required('RARE_ACCOUNT_TEST_PRIVATE_KEY');
    const secondKey = required('RARE_ACCOUNT_TEST_SECOND_PRIVATE_KEY');
    if (!isPrivateKeyString(privateKey) || !isPrivateKeyString(secondKey)) throw new Error('Use dedicated test wallet keys');
    const owner = privateKeyToAccount(privateKey);
    const target = privateKeyToAccount(secondKey);
    expect(owner.address.toLowerCase()).not.toBe(target.address.toLowerCase());
    const api = createRareClient({ publicClient: createPublicClient({ chain: mainnet, transport: http() }), apiBaseUrl: url.origin }).user;
    const profile = await api.resolve({ address: target.address });
    const own = await api.resolve({ address: owner.address });
    if (profile.userId === undefined || own.userId === undefined) throw new Error('Deploy user selectors and follow routes first');
    const before = await api.followers({ userId: profile.userId }, { perPage: 100 });
    expect(before.data.some(user => user.userId === own.userId)).toBe(false);
    await withTempHome(async temporary => {
      const home = await realpath(temporary);
      const directory = join(home, '.rare');
      await mkdir(directory, { mode: 0o700 });
      await writeFile(join(directory, 'config.json'), JSON.stringify({ defaultChain: 'mainnet', chains: { mainnet: { privateKey } } }), { mode: 0o600 });
      const env = { RARE_API_URL: url.origin, RARE_AUTH_STORAGE: 'file', RARE_AUTH_DIRECTORY: join(directory, 'auth') };
      const run = (args: string[]): Promise<CliResult> => runCli(['--json', ...args], { home, env, timeoutMs: 45_000 });
      for (const selector of [[target.address], ['--username', profile.username], ['--user-id', String(profile.userId)]]) {
        expect(parseJsonStdout(await run(['user', 'get', ...selector]))).toEqual(profile);
        expect(parseJsonStdout(await run(['user', 'followers', ...selector, '--per-page', '100']))).toEqual(before);
      }
      expect((await run(['user', 'follow', '--username', profile.username])).code).not.toBe(0);
      expect(parseJsonStdout(await run(['auth', 'login', '--wallet', '--chain', 'mainnet']))).toMatchObject({ status: 'authorized' });
      try {
        expect(parseJsonStdout(await run(['user', 'follow', '--username', profile.username]))).toEqual({ following: true });
        expect((await api.followers({ address: target.address })).data.some(user => user.userId === own.userId)).toBe(true);
        const following = await run(['user', 'following', '--user-id', String(own.userId)]);
        expect(following.code).toBe(0);
        expect(following.stdout).toContain(profile.username);
        expect((await run(['user', 'follow', '--user-id', String(own.userId)])).code).not.toBe(0);
        expect((await run(['user', 'get', '--username', profile.username, '--user-id', String(profile.userId)])).code).not.toBe(0);
        expect(parseJsonStdout(await run(['user', 'unfollow', '--user-id', String(profile.userId)]))).toEqual({ following: false });
        expect(await api.followers({ address: target.address }, { perPage: 100 })).toEqual(before);
      } finally {
        expect((await run(['user', 'unfollow', '--address', target.address])).code).toBe(0);
        expect((await run(['auth', 'logout'])).code).toBe(0);
      }
    });
  }, 240_000);
});
