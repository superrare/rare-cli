import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRareAccountClient } from '@rareprotocol/rare-sdk';
import { isPrivateKeyString } from '@rareprotocol/rare-sdk/validation';
import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import { parseJsonStdout, runCli, withTempHome, type CliResult } from '../helpers/cli.js';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
describe('authenticated artwork favorites through the built CLI and deployed services', () => {
  it('reads a public count before login and manages only its own favorites with persisted credentials', async () => {
    const url = new URL(required('RARE_ACCOUNT_TEST_API_URL'));
    if (url.protocol !== 'https:' || url.hostname === 'api.superrare.com' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('Use a non-production HTTPS API origin');
    const id = required('RARE_ACCOUNT_TEST_ARTWORK_ID');
    const [chainId, contract, tokenId] = id.split('-');
    if (chainId !== '1' || contract === undefined || tokenId === undefined) throw new Error('Use a dedicated Ethereum mainnet test artwork');
    const key = required('RARE_ACCOUNT_TEST_PRIVATE_KEY');
    if (!isPrivateKeyString(key)) throw new Error('Use a dedicated test wallet key');
    const owner = privateKeyToAccount(key);
    const account = createRareAccountClient({ apiBaseUrl: url.origin });
    await withTempHome(async temporary => {
      const home = await realpath(temporary);
      const directory = join(home, '.rare');
      await mkdir(directory, { mode: 0o700 });
      await writeFile(join(directory, 'config.json'), JSON.stringify({ defaultChain: 'mainnet', chains: { mainnet: { privateKey: key } } }), { mode: 0o600 });
      const env = { RARE_API_URL: url.origin, RARE_AUTH_STORAGE: 'file', RARE_AUTH_DIRECTORY: join(directory, 'auth') };
      const run = (args: string[]): Promise<CliResult> => runCli(['--json', ...args], { home, env, timeoutMs: 45_000 });
      const countArgs = ['nft', 'favorite-count', '--contract', contract, '--token-id', tokenId, '--chain', 'mainnet'];
      const publicCount = parseJsonStdout(await run(countArgs));
      expect(publicCount).toHaveProperty('count');
      for (const args of [['favorites', 'list'], ['favorites', 'status', id], ['favorites', 'add', id], ['favorites', 'remove', id]]) expect((await run(args)).code).not.toBe(0);
      expect(parseJsonStdout(await run(['auth', 'login', '--wallet', '--chain', 'mainnet']))).toMatchObject({ status: 'authorized' });
      await account.auth.loginWithWallet({ address: owner.address, chainId: 1, signMessage: message => owner.signMessage({ message }) });
      try {
        expect(await account.favorites.has(id)).toBe(false);
        const before = await account.favorites.list();
        try {
          expect(parseJsonStdout(await run(['favorites', 'add', id]))).toEqual({ favorited: true });
          expect(parseJsonStdout(await run(['favorites', 'add', id]))).toEqual({ favorited: true });
          expect(await account.favorites.has(id)).toBe(true);
          expect(parseJsonStdout(await run(['favorites', 'status', id]))).toEqual({ favorited: true });
          const list = await run(['favorites', 'list', '--per-page', '1']);
          expect(list.code).toBe(0);
          expect(list.stdout).toContain(id);
          const visible = await account.favorites.list({ perPage: 100 });
          expect(parseJsonStdout(await run(['favorites', 'list', '--per-page', '100']))).toEqual(visible);
          const beyond = parseJsonStdout(await run(['favorites', 'list', '--page', String(visible.pagination.totalPages + 1), '--per-page', '100']));
          expect(beyond).toMatchObject({ data: [], pagination: { totalCount: visible.pagination.totalCount } });
          expect((await run(['favorites', 'list', '--user-id', '123'])).code).not.toBe(0);
          expect((await run(['favorites', 'list', '--per-page', '101'])).code).not.toBe(0);
          expect(parseJsonStdout(await run(['favorites', 'remove', id]))).toEqual({ favorited: false });
          expect(parseJsonStdout(await run(['favorites', 'status', id]))).toEqual({ favorited: false });
          expect(await account.favorites.list()).toEqual(before);
          expect(parseJsonStdout(await run(countArgs))).toEqual(publicCount);
        } finally {
          expect((await run(['favorites', 'remove', id])).code).toBe(0);
        }
      } finally {
        expect((await run(['auth', 'logout'])).code).toBe(0);
        await account.auth.logout();
      }
    });
  }, 240_000);
});
