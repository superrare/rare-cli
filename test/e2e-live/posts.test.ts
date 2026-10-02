import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isPrivateKeyString } from '@rareprotocol/rare-sdk/validation';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { parseJsonStdout, runCli, withTempHome, type CliResult } from '../helpers/cli.js';

const required = (name: string): string => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; };
const postResult = z.object({ id: z.string(), creatorUserId: z.string(), title: z.string(), body: z.string(), imageUrls: z.array(z.string()), likeCount: z.number() });
const commentResult = z.object({ id: z.string(), postId: z.string(), authorUserId: z.string(), body: z.string() });
const setup = async (temporary: string, privateKey: string, apiUrl: string): Promise<{ home: string; run: (args: string[]) => Promise<CliResult> }> => {
  const home = await realpath(temporary);
  const directory = join(home, '.rare');
  await mkdir(directory, { mode: 0o700 });
  await writeFile(join(directory, 'config.json'), JSON.stringify({ defaultChain: 'mainnet', chains: { mainnet: { privateKey } } }), { mode: 0o600 });
  const env = { RARE_API_URL: apiUrl, RARE_AUTH_STORAGE: 'file', RARE_AUTH_DIRECTORY: join(directory, 'auth') };
  return { home, run: (args: string[]): Promise<CliResult> => runCli(['--json', ...args], { home, env, timeoutMs: 45_000 }) };
};

describe('creator posts through the built CLI and deployed services', () => {
  it('supports public reads, cross-account comments, private favorites and ownership-safe deletion', async () => {
    const url = new URL(required('RARE_ACCOUNT_TEST_API_URL'));
    if (url.protocol !== 'https:' || url.hostname === 'api.superrare.com' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('Use a non-production HTTPS API origin');
    const privateKey = required('RARE_ACCOUNT_TEST_PRIVATE_KEY');
    const secondKey = required('RARE_ACCOUNT_TEST_SECOND_PRIVATE_KEY');
    if (!isPrivateKeyString(privateKey) || !isPrivateKeyString(secondKey)) throw new Error('Use dedicated wallet keys');
    const address = privateKeyToAccount(privateKey).address;
    expect(address.toLowerCase()).not.toBe(privateKeyToAccount(secondKey).address.toLowerCase());
    await withTempHome(async first => withTempHome(async second => {
      const owner = await setup(first, privateKey, url.origin);
      const other = await setup(second, secondKey, url.origin);
      expect((await owner.run(['posts', 'create', '--title', 'Unauthorized', '--body', 'Body'])).code).not.toBe(0);
      expect((await owner.run(['posts', 'favorites', 'list'])).code).not.toBe(0);
      expect(parseJsonStdout(await owner.run(['auth', 'login', '--wallet', '--chain', 'mainnet']))).toMatchObject({ status: 'authorized' });
      const bodyFile = join(owner.home, 'post.md');
      await writeFile(bodyFile, '**Markdown** from a file', 'utf8');
      const post = postResult.parse(parseJsonStdout(await owner.run(['posts', 'create', '--title', `CLI integration ${Date.now()}`, '--body-file', bodyFile])));
      try {
        expect(post.body).toBe('**Markdown** from a file');
        expect(post.imageUrls).toEqual([]);
        expect(postResult.parse(parseJsonStdout(await other.run(['posts', 'get', post.id]))).id).toBe(post.id);
        const page = z.object({ data: z.array(postResult) }).parse(parseJsonStdout(await other.run(['posts', 'list', '--address', address, '--per-page', '100'])));
        expect(page.data.some(row => row.id === post.id)).toBe(true);
        // Public reads above run before this account signs in.
        expect(parseJsonStdout(await other.run(['auth', 'login', '--wallet', '--chain', 'mainnet']))).toMatchObject({ status: 'authorized' });
        const commentFile = join(other.home, 'comment.md');
        await writeFile(commentFile, 'Comment from another account', 'utf8');
        const comment = commentResult.parse(parseJsonStdout(await other.run(['posts', 'comment', post.id, '--body-file', commentFile])));
        const comments = z.object({ data: z.array(commentResult) }).parse(parseJsonStdout(await owner.run(['posts', 'comments', post.id])));
        expect(comments.data.some(row => row.id === comment.id)).toBe(true);
        expect((await other.run(['posts', 'delete', post.id])).code).not.toBe(0);
        expect((await owner.run(['posts', 'delete-comment', post.id, comment.id])).code).not.toBe(0);
        expect(parseJsonStdout(await other.run(['posts', 'favorites', 'add', post.id]))).toEqual({ favorited: true });
        expect(parseJsonStdout(await other.run(['posts', 'favorites', 'add', post.id]))).toEqual({ favorited: true });
        expect(parseJsonStdout(await other.run(['posts', 'favorites', 'status', post.id]))).toEqual({ favorited: true });
        expect(parseJsonStdout(await owner.run(['posts', 'favorites', 'status', post.id]))).toEqual({ favorited: false });
        expect(postResult.parse(parseJsonStdout(await owner.run(['posts', 'get', post.id]))).likeCount).toBe(1);
        const favorites = z.object({ data: z.array(postResult) }).parse(parseJsonStdout(await other.run(['posts', 'favorites', 'list'])));
        expect(favorites.data.some(row => row.id === post.id)).toBe(true);
        expect(parseJsonStdout(await other.run(['posts', 'favorites', 'remove', post.id]))).toEqual({ favorited: false });
        expect(parseJsonStdout(await other.run(['posts', 'delete-comment', post.id, comment.id]))).toEqual({ deleted: true });
        expect(parseJsonStdout(await owner.run(['posts', 'comments', post.id]))).toMatchObject({ data: [] });
        expect((await owner.run(['posts', 'create', '--title', 'Invalid', '--body', 'a', '--body-file', bodyFile])).code).not.toBe(0);
        expect((await owner.run(['posts', 'list', '--address', address, '--user-id', '1'])).code).not.toBe(0);
      } finally {
        expect(parseJsonStdout(await owner.run(['posts', 'delete', post.id]))).toEqual({ deleted: true });
        expect((await owner.run(['posts', 'get', post.id])).code).not.toBe(0);
        expect((await owner.run(['posts', 'comments', post.id])).code).not.toBe(0);
        expect((await owner.run(['auth', 'logout'])).code).toBe(0);
        expect((await other.run(['auth', 'logout'])).code).toBe(0);
      }
    }));
  }, 300_000);
});
