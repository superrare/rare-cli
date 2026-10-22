import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import { isPrivateKeyString } from '@rareprotocol/rare-sdk/validation';
import { describe, expect, it } from 'vitest';
import { parseJsonStdout, runCli, withTempHome } from '../helpers/cli.js';

const apiUrl = process.env.RARE_ACCOUNT_TEST_API_URL;
const privateKey = process.env.RARE_ACCOUNT_TEST_PRIVATE_KEY;

describe.skipIf(!apiUrl || !privateKey)('deployed unified client', () => {
  it('uses one persistent account session for profile and messaging without an RPC configuration', async () => {
    if (!apiUrl || !privateKey || !isPrivateKeyString(privateKey)) throw new Error('Supply a deployed API URL and existing test wallet key');
    const origin = new URL(apiUrl);
    if (origin.protocol !== 'https:' || origin.hostname === 'api.superrare.com') throw new Error('Use a non-production HTTPS deployment');
    const wallet = privateKeyToAccount(privateKey);
    await withTempHome(async temporary => {
      const home = await realpath(temporary);
      const directory = join(home, '.rare');
      await mkdir(directory, { mode: 0o700 });
      await writeFile(join(directory, 'config.json'), JSON.stringify({ defaultChain: 'mainnet', chains: { mainnet: { privateKey } } }), { mode: 0o600 });
      const run = (args: string[]): ReturnType<typeof runCli> => runCli(['--json', ...args], {
        home, env: { RARE_API_URL: apiUrl, RARE_AUTH_STORAGE: 'file', RARE_AUTH_DIRECTORY: join(directory, 'auth') }, timeoutMs: 45_000,
      });
      try {
        expect(parseJsonStdout(await run(['auth', 'login', '--wallet', '--chain', 'mainnet']))).toMatchObject({ status: 'authorized' });
        const status = parseJsonStdout<{ accountId: string; address: string }>(await run(['auth', 'status', '--verify']));
        expect(status.address.toLowerCase()).toBe(wallet.address.toLowerCase());
        expect(parseJsonStdout(await run(['profile', 'get']))).toMatchObject({ accountId: status.accountId });
        expect(parseJsonStdout(await run(['messaging', 'session']))).toMatchObject({ user: { id: status.accountId } });
        expect(parseJsonStdout(await run(['auth', 'logout']))).toMatchObject({ status: 'signed_out' });
        expect(parseJsonStdout(await run(['auth', 'status']))).toMatchObject({ status: 'signed_out' });
        expect((await run(['profile', 'get'])).code).not.toBe(0);
        expect((await run(['messaging', 'session'])).code).not.toBe(0);
      } finally {
        const logout = await run(['auth', 'logout']);
        expect(logout.code).toBe(0);
      }
    });
  }, 180_000);
});
