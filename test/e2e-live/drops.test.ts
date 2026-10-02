import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRareAccountClient, type RareUpload } from '@rareprotocol/rare-sdk';
import { isPrivateKeyString } from '@rareprotocol/rare-sdk/validation';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { parseJsonStdout, runCli, withTempHome, type CliResult } from '../helpers/cli.js';
const required = (name: string): string => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; };
const dropResult = z.object({ id: z.string(), userId: z.string(), startsAt: z.string(), metadata: z.object({ headline: z.string(), description: z.string(), imageObjectKey: z.string(), imageUrl: z.string(), destinationUrl: z.string(), slug: z.string() }) });
const setup = async (temporary: string, privateKey: string, apiUrl: string): Promise<{ run: (args: string[]) => Promise<CliResult> }> => {
  const home = await realpath(temporary); const directory = join(home, '.rare');
  await mkdir(directory, { mode: 0o700 });
  await writeFile(join(directory, 'config.json'), JSON.stringify({ defaultChain: 'sepolia', chains: { sepolia: { privateKey } } }), { mode: 0o600 });
  const env = { RARE_API_URL: apiUrl, RARE_AUTH_STORAGE: 'file', RARE_AUTH_DIRECTORY: join(directory, 'auth') };
  return { run: (args: string[]): Promise<CliResult> => runCli(['--json', ...args], { home, env, timeoutMs: 45_000 }) };
};
describe('drops through the built CLI and deployed services', () => {
  it('creates, reads publicly, updates only supplied fields and rejects another account’s mutations', async () => {
    const url = new URL(required('RARE_ACCOUNT_TEST_API_URL'));
    if (url.protocol !== 'https:' || url.hostname === 'api.superrare.com' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('Use a non-production HTTPS API origin');
    const privateKey = required('RARE_ACCOUNT_TEST_PRIVATE_KEY'); const secondKey = required('RARE_ACCOUNT_TEST_SECOND_PRIVATE_KEY');
    if (!isPrivateKeyString(privateKey) || !isPrivateKeyString(secondKey)) throw new Error('Use dedicated test wallet keys');
    const wallet = privateKeyToAccount(privateKey);
    expect(wallet.address.toLowerCase()).not.toBe(privateKeyToAccount(secondKey).address.toLowerCase());
    // The generic uploader has no CLI command. Seed a real image through the SDK;
    // every announcement action and account login below uses the built CLI.
    const fixtureClient = createRareAccountClient({ apiBaseUrl: url.origin });
    const image = await (async (): Promise<RareUpload> => {
      try {
        await fixtureClient.auth.loginWithWallet({ address: wallet.address, chainId: 11155111, signMessage: message => wallet.signMessage({ message }) });
        return await fixtureClient.uploads.upload(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'), 'drop.gif', { contentType: 'image/gif' });
      } finally { await fixtureClient.auth.logout(); }
    })();
    const startsAt = new Date(Date.now() + 86400000).toISOString();
    const from = new Date(Date.parse(startsAt) - 1000).toISOString(); const to = new Date(Date.parse(startsAt) + 1000).toISOString();
    await withTempHome(async first => withTempHome(async second => {
      const owner = await setup(first, privateKey, url.origin); const other = await setup(second, secondKey, url.origin);
      const args = ['drops', 'create', '--headline', `CLI drop ${Date.now()}`, '--description', 'Dedicated CLI announcement', '--starts-at', startsAt, '--image-url', image.url];
      expect((await owner.run(args)).code).not.toBe(0);
      expect(parseJsonStdout(await owner.run(['auth', 'login', '--wallet', '--chain', 'sepolia']))).toMatchObject({ status: 'authorized' });
      const drop = dropResult.parse(parseJsonStdout(await owner.run(args)));
      try {
        expect(drop.metadata.imageObjectKey).toBe(image.key);
        expect(dropResult.parse(parseJsonStdout(await other.run(['drops', 'get', drop.id]))).id).toBe(drop.id);
        const page = z.object({ data: z.array(dropResult), pagination: z.object({ totalCount: z.number() }) }).parse(parseJsonStdout(await other.run(['drops', 'list', '--from', from, '--to', to, '--address', wallet.address, '--per-page', '100'])));
        expect(page.data.some(row => row.id === drop.id)).toBe(true); expect(page.pagination.totalCount).toBeGreaterThanOrEqual(1);
        expect(JSON.stringify(page).toLowerCase()).not.toContain('email');
        const edited = dropResult.parse(parseJsonStdout(await owner.run(['drops', 'update', drop.id, '--headline', 'Updated through CLI'])));
        expect(edited.metadata.description).toBe(drop.metadata.description); expect(edited.metadata.slug).toBe(drop.metadata.slug); expect(edited.startsAt).toBe(drop.startsAt); expect(edited.metadata.imageUrl).toBe(image.url);
        expect((await owner.run(['drops', 'update', drop.id])).code).not.toBe(0);
        expect(parseJsonStdout(await other.run(['auth', 'login', '--wallet', '--chain', 'sepolia']))).toMatchObject({ status: 'authorized' });
        expect((await other.run(['drops', 'update', drop.id, '--headline', 'Hijacked'])).code).not.toBe(0);
        expect((await other.run(['drops', 'delete', drop.id])).code).not.toBe(0);
        expect((await owner.run(['drops', 'list', '--from', from, '--to', to, '--address', wallet.address, '--username', 'other'])).code).not.toBe(0);
      } finally {
        expect(parseJsonStdout(await owner.run(['drops', 'delete', drop.id]))).toEqual({ deleted: true });
        await Promise.all([owner.run(['auth', 'logout']), other.run(['auth', 'logout'])]);
      }
      expect((await other.run(['drops', 'get', drop.id])).code).not.toBe(0);
    }));
  }, 240_000);
});
