import { randomUUID } from 'node:crypto';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { isPrivateKeyString } from '@rareprotocol/rare-sdk/validation';
import { parseJsonStdout, runCli, withTempHome, type CliResult } from '../helpers/cli.js';

const required = (name: string): string => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; };
const setup = async (temporary: string, key: string, apiUrl: string): Promise<(args: string[]) => Promise<CliResult>> => {
  const home = await realpath(temporary);
  const directory = join(home, '.rare');
  await mkdir(directory, { mode: 0o700 });
  await writeFile(join(directory, 'config.json'), JSON.stringify({ defaultChain: 'mainnet', chains: { mainnet: { privateKey: key } } }), { mode: 0o600 });
  return (args: string[]): Promise<CliResult> => runCli(['--json', ...args], { home, env: { RARE_API_URL: apiUrl, RARE_AUTH_STORAGE: 'file', RARE_AUTH_DIRECTORY: join(directory, 'auth') }, timeoutMs: 45_000 });
};
const conversation = z.object({ id: z.string().uuid() });
const message = z.object({ id: z.string().uuid(), clientMessageId: z.string().uuid(), body: z.string(), version: z.number(), sequence: z.string() });
const history = z.object({ messages: z.array(message), changeCursor: z.string() });

describe('durable messaging through the built CLI and deployed services', () => {
  it('protects private history and supports retries, replies, edits, reactions and notification preferences', async () => {
    const url = new URL(required('RARE_ACCOUNT_TEST_API_URL'));
    if (url.protocol !== 'https:' || url.hostname === 'api.superrare.com' || url.pathname !== '/' || url.search || url.hash) throw new Error('Use a non-production HTTPS API origin');
    const key = required('RARE_ACCOUNT_TEST_PRIVATE_KEY');
    const secondKey = required('RARE_ACCOUNT_TEST_SECOND_PRIVATE_KEY');
    if (!isPrivateKeyString(key) || !isPrivateKeyString(secondKey) || key === secondKey) throw new Error('Use two distinct existing test wallet keys');
    await withTempHome(async first => withTempHome(async second => {
      const owner = await setup(first, key, url.origin);
      const outsider = await setup(second, secondKey, url.origin);
      expect((await owner(['messaging', 'inbox'])).code).not.toBe(0);
      expect((await owner(['auth', 'login', '--wallet', '--chain', 'mainnet'])).code).toBe(0);
      expect((await outsider(['auth', 'login', '--wallet', '--chain', 'mainnet'])).code).toBe(0);
      const otherSession = z.object({ user: z.object({ id: z.string() }) }).parse(parseJsonStdout(await outsider(['messaging', 'session'])));
      const operationId = randomUUID();
      const args = ['messaging', 'group', '--title', `CLI messaging ${operationId}`, '--client-operation-id', operationId];
      const room = conversation.parse(parseJsonStdout(await owner(args)));
      try {
        expect(conversation.parse(parseJsonStdout(await owner(args))).id).toBe(room.id);
        expect((await outsider(['messaging', 'history', room.id])).code).not.toBe(0);
        expect((await outsider(['messaging', 'send', room.id, '--body', 'Unauthorized'])).code).not.toBe(0);
        const clientId = randomUUID();
        const sent = message.parse(parseJsonStdout(await owner(['messaging', 'send', room.id, '--body', 'First message', '--client-message-id', clientId])));
        const retried = message.parse(parseJsonStdout(await owner(['messaging', 'send', room.id, '--body', 'First message', '--client-message-id', clientId])));
        expect(retried.id).toBe(sent.id);
        const reply = message.parse(parseJsonStdout(await owner(['messaging', 'send', room.id, '--body', 'Reply', '--reply-to', sent.id])));
        const page = history.parse(parseJsonStdout(await owner(['messaging', 'history', room.id])));
        expect(page.messages.filter(row => row.clientMessageId === clientId)).toHaveLength(1);
        expect(page.messages.some(row => row.id === reply.id)).toBe(true);
        const edited = message.parse(parseJsonStdout(await owner(['messaging', 'edit', room.id, sent.id, '--body', 'Edited message', '--expected-version', String(sent.version)])));
        expect(edited.body).toBe('Edited message');
        expect((await outsider(['messaging', 'edit', room.id, sent.id, '--body', 'Unauthorized edit', '--expected-version', String(edited.version)])).code).not.toBe(0);
        expect((await owner(['messaging', 'invite', room.id, otherSession.user.id])).code).toBe(0);
        expect((await outsider(['messaging', 'accept', room.id])).code).toBe(0);
        const memberReply = message.parse(parseJsonStdout(await outsider(['messaging', 'send', room.id, '--body', 'Member reply', '--reply-to', sent.id])));
        expect(history.parse(parseJsonStdout(await owner(['messaging', 'history', room.id]))).messages.some(row => row.id === memberReply.id)).toBe(true);
        expect((await outsider(['messaging', 'delete', room.id, sent.id])).code).not.toBe(0);
        expect((await outsider(['messaging', 'delete', room.id, memberReply.id])).code).toBe(0);
        expect((await outsider(['messaging', 'leave', room.id])).code).toBe(0);
        expect((await owner(['messaging', 'react', room.id, sent.id, '👍'])).code).toBe(0);
        expect((await owner(['messaging', 'react', room.id, sent.id, '👍', '--remove'])).code).toBe(0);
        expect((await owner(['messaging', 'pin', room.id, sent.id])).code).toBe(0);
        expect((await owner(['messaging', 'pin', room.id, sent.id, '--remove'])).code).toBe(0);
        for (const notification of ['muted', 'mentions', 'all']) expect((await owner(['messaging', 'preferences', room.id, '--notification', notification])).code).toBe(0);
        expect((await owner(['messaging', 'read', room.id, reply.sequence])).code).toBe(0);
        expect((await owner(['messaging', 'changes', room.id, '--after', page.changeCursor])).code).toBe(0);
        expect(history.parse(parseJsonStdout(await owner(['messaging', 'history', room.id]))).messages.some(row => row.body === 'Edited message')).toBe(true);
        expect((await owner(['messaging', 'delete', room.id, reply.id])).code).toBe(0);
        expect((await owner(['messaging', 'delete', room.id, sent.id])).code).toBe(0);
      } finally {
        expect((await owner(['messaging', 'close', room.id])).code).toBe(0);
        expect((await owner(['auth', 'logout'])).code).toBe(0);
        expect((await outsider(['auth', 'logout'])).code).toBe(0);
      }
    }));
  }, 300_000);
});

const publicRoom = z.object({ id: z.string().uuid() });
const publicMessages = z.object({ messages: z.array(z.object({ id: z.string().uuid(), kind: z.enum(['user', 'system']) })) });

describe('public contextual chats through the built CLI', () => {
  it.each([
    { type: 'auction', env: 'RARE_MESSAGING_TEST_AUCTION_ID' },
    { type: 'drop-announcement', env: 'RARE_MESSAGING_TEST_DROP_ID' },
    { type: 'liquid-edition', env: 'RARE_MESSAGING_TEST_EDITION_ADDRESS' },
  ])('resolves $type anonymously and round-trips an authenticated user message', async ({ type, env }) => {
    const url = new URL(required('RARE_ACCOUNT_TEST_API_URL'));
    if (url.protocol !== 'https:' || url.hostname === 'api.superrare.com' || url.pathname !== '/') throw new Error('Use a non-production HTTPS API origin');
    const key = required('RARE_ACCOUNT_TEST_PRIVATE_KEY');
    if (!isPrivateKeyString(key)) throw new Error('Use an existing dedicated test wallet');
    const resolveArgs = type === 'liquid-edition' ? ['--chain-id', required('RARE_MESSAGING_TEST_EDITION_CHAIN_ID'), '--contract-address', required(env)] : [required(env)];
    await withTempHome(async temporary => {
      const run = await setup(temporary, key, url.origin);
      const room = publicRoom.parse(parseJsonStdout(await run(['messaging', 'public', 'resolve', type, ...resolveArgs])));
      expect((await run(['messaging', 'public', 'history', room.id])).code).toBe(0);
      expect((await run(['messaging', 'public', 'send', room.id, '--body', 'Unauthorized'])).code).not.toBe(0);
      expect((await run(['auth', 'login', '--wallet', '--chain', 'mainnet'])).code).toBe(0);
      const clientId = randomUUID();
      const args = ['messaging', 'public', 'send', room.id, '--body', `CLI public chat ${clientId}`, '--client-message-id', clientId];
      const sent = z.object({ id: z.string().uuid(), kind: z.literal('user') }).parse(parseJsonStdout(await run(args)));
      try {
        expect(z.object({ id: z.string() }).parse(parseJsonStdout(await run(args))).id).toBe(sent.id);
        const page = publicMessages.parse(parseJsonStdout(await run(['messaging', 'public', 'history', room.id])));
        expect(page.messages.filter(row => row.id === sent.id)).toHaveLength(1);
        expect((await run(['messaging', 'preferences', room.id, '--notification', 'muted'])).code).toBe(0);
      } finally {
        expect((await run(['messaging', 'delete', room.id, sent.id])).code).toBe(0);
        expect((await run(['messaging', 'leave', room.id])).code).toBe(0);
        expect((await run(['auth', 'logout'])).code).toBe(0);
      }
    });
  }, 180_000);
});
