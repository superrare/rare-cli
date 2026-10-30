import { randomUUID } from 'node:crypto';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { isPrivateKeyString } from '@rareprotocol/rare-sdk/validation';
import { parseJsonStdout, runCli, withTempHome, type CliResult } from '../helpers/cli.js';
const required = (name: string): string => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; };
const notificationSchema = z.object({ id: z.string(), category: z.string(), notificationId: z.string(), payload: z.record(z.string(), z.unknown()), readAt: z.string().nullable() });
const pageSchema = z.object({ data: z.array(notificationSchema), pagination: z.object({ page: z.number(), perPage: z.number(), totalCount: z.number(), totalPages: z.number() }) });
const setup = async (temporary: string, key: string, apiUrl: string): Promise<(args: string[]) => Promise<CliResult>> => {
  const home = await realpath(temporary); const directory = join(home, '.rare');
  await mkdir(directory, { mode: 0o700 });
  await writeFile(join(directory, 'config.json'), JSON.stringify({ defaultChain: 'mainnet', chains: { mainnet: { privateKey: key } } }), { mode: 0o600 });
  return (args: string[]): Promise<CliResult> => runCli(['--json', ...args], { home, env: { RARE_API_URL: apiUrl, RARE_API_BASE_URL: apiUrl, RARE_AUTH_STORAGE: 'file', RARE_AUTH_DIRECTORY: join(directory, 'auth') }, timeoutMs: 45_000 });
};
const waitForDelivery = async (run: (args: string[]) => Promise<CliResult>, roomId: string, excluded: readonly string[], deadline = Date.now() + 90_000): Promise<z.infer<typeof notificationSchema>> => {
  const result = await run(['notifications', 'list', '--per-page', '50']); expect(result.code).toBe(0);
  const page = pageSchema.parse(parseJsonStdout(result));
  const item = page.data.find(row => row.category === 'messagingActivity' && row.payload.conversationId === roomId && !excluded.includes(row.id));
  if (item !== undefined) return item;
  if (Date.now() >= deadline) throw new Error('The deployed worker did not deliver the CLI message notification within 90 seconds');
  await delay(2000); return waitForDelivery(run, roomId, excluded, deadline);
};
describe('notifications through the built CLI and deployed services', () => {
  it('observes actual delivery, pages the inbox, and marks only owned entries read', async () => {
    const url = new URL(required('RARE_ACCOUNT_TEST_API_URL'));
    if (url.protocol !== 'https:' || url.hostname === 'api.superrare.com' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('Use a non-production HTTPS API origin');
    expect((await fetch(`${url.origin}/v1/me/notifications`)).status, 'Deploy the notification inbox routes before running this suite').toBe(401);
    const key = required('RARE_ACCOUNT_TEST_PRIVATE_KEY'); const otherKey = required('RARE_ACCOUNT_TEST_SECOND_PRIVATE_KEY');
    if (!isPrivateKeyString(key) || !isPrivateKeyString(otherKey) || key === otherKey) throw new Error('Use two distinct existing test wallet keys');
    await withTempHome(async first => withTempHome(async second => {
      const owner = await setup(first, key, url.origin); const recipient = await setup(second, otherKey, url.origin);
      expect((await recipient(['notifications', 'list'])).code).not.toBe(0);
      expect((await owner(['auth', 'login', '--wallet', '--chain', 'mainnet'])).code).toBe(0);
      expect((await recipient(['auth', 'login', '--wallet', '--chain', 'mainnet'])).code).toBe(0);
      const sender = z.object({ user: z.object({ id: z.string() }) }).parse(parseJsonStdout(await owner(['messaging', 'session'])));
      const actor = z.object({ user: z.object({ id: z.string() }) }).parse(parseJsonStdout(await recipient(['messaging', 'session'])));
      const room = z.object({ id: z.string() }).parse(parseJsonStdout(await owner(['messaging', 'group', '--title', `CLI notifications ${randomUUID()}`, '--invite', actor.user.id])));
      try {
        expect((await recipient(['messaging', 'accept', room.id])).code).toBe(0);
        const previous = pageSchema.parse(parseJsonStdout(await recipient(['notifications', 'list', '--per-page', '50']))).data.filter(row => row.payload.conversationId === room.id).map(row => row.id);
        const messageId = randomUUID();
        expect((await owner(['messaging', 'send', room.id, '--body', 'Live CLI notification', '--client-message-id', messageId])).code).toBe(0);
        expect((await owner(['messaging', 'send', room.id, '--body', 'Live CLI notification', '--client-message-id', messageId])).code).toBe(0);
        const sourceHistory = z.object({ messages: z.array(z.object({ id: z.string(), clientMessageId: z.string(), body: z.string(), author: z.object({ id: z.string() }) })) }).parse(parseJsonStdout(await recipient(['messaging', 'history', room.id])));
        expect(sourceHistory.messages.filter(row => row.clientMessageId === messageId)).toHaveLength(1);
        expect(sourceHistory.messages.find(row => row.clientMessageId === messageId)).toMatchObject({ body: 'Live CLI notification', author: { id: sender.user.id } });
        const delivered = await waitForDelivery(recipient, room.id, previous); expect(delivered.readAt).toBeNull(); expect(delivered.notificationId).toMatch(/^messaging:/);
        expect((await owner(['messaging', 'send', room.id, '--body', 'Second CLI notification'])).code).toBe(0);
        const secondDelivery = await waitForDelivery(recipient, room.id, [...previous, delivered.id]);
        const page = pageSchema.parse(parseJsonStdout(await recipient(['notifications', 'list', '--per-page', '1']))); expect(page.data).toHaveLength(1); expect(page.pagination.totalPages).toBeGreaterThan(1);
        const next = pageSchema.parse(parseJsonStdout(await recipient(['notifications', 'list', '--per-page', '1', '--page', '2']))); expect(next.data[0]?.id).not.toBe(page.data[0]?.id);
        expect((await owner(['notifications', 'read', delivered.id])).code).not.toBe(0);
        const before = z.object({ unreadCount: z.number() }).parse(parseJsonStdout(await recipient(['notifications', 'unread-count'])));
        const read = notificationSchema.parse(parseJsonStdout(await recipient(['notifications', 'read', delivered.id]))); expect(read.readAt).not.toBeNull();
        expect(notificationSchema.parse(parseJsonStdout(await recipient(['notifications', 'read', delivered.id]))).readAt).toBe(read.readAt);
        expect(z.object({ unreadCount: z.number() }).parse(parseJsonStdout(await recipient(['notifications', 'unread-count']))).unreadCount).toBe(before.unreadCount - 1);
        const after = pageSchema.parse(parseJsonStdout(await recipient(['notifications', 'list', '--per-page', '50']))); expect(after.data.find(row => row.id === delivered.id)?.readAt).toBe(read.readAt); expect(after.data.find(row => row.id === secondDelivery.id)?.readAt).toBeNull();
        expect((await recipient(['notifications', 'list', '--per-page', '51'])).code).not.toBe(0);
        expect((await recipient(['notifications', 'list', '--user-id', '1'])).code).not.toBe(0);
        expect((await recipient(['notifications', 'read', secondDelivery.id])).code).toBe(0);
        expect(pageSchema.parse(parseJsonStdout(await recipient(['notifications', 'list', '--per-page', '50']))).data.find(row => row.id === secondDelivery.id)?.readAt).not.toBeNull();
        const state = z.object({ conversation: z.object({ notification: z.string() }), messages: z.array(z.object({ id: z.string(), body: z.string(), sequence: z.string(), author: z.object({ id: z.string() }) })) });
        expect((await recipient(['messaging', 'preferences', room.id, '--notification', 'muted'])).code).toBe(0);
        expect(state.parse(parseJsonStdout(await recipient(['messaging', 'history', room.id]))).conversation.notification).toBe('muted');
        const beforeMuted = pageSchema.parse(parseJsonStdout(await recipient(['notifications', 'list', '--per-page', '50']))).data.filter(row => row.payload.conversationId === room.id).map(row => row.id).sort();
        const mutedBody = `Muted CLI message ${randomUUID()}`;
        const muted = z.object({ id: z.string(), sequence: z.string() }).parse(parseJsonStdout(await owner(['messaging', 'send', room.id, '--body', mutedBody])));
        expect(state.parse(parseJsonStdout(await recipient(['messaging', 'history', room.id]))).messages.find(row => row.id === muted.id)).toMatchObject({ body: mutedBody, author: { id: sender.user.id } });
        const control = z.object({ id: z.string() }).parse(parseJsonStdout(await owner(['messaging', 'group', '--title', `CLI notification control ${randomUUID()}`, '--invite', actor.user.id])));
        try {
          expect((await recipient(['messaging', 'accept', control.id])).code).toBe(0);
          const controlBefore = pageSchema.parse(parseJsonStdout(await recipient(['notifications', 'list', '--per-page', '50']))).data.filter(row => row.payload.conversationId === control.id).map(row => row.id);
          expect((await owner(['messaging', 'send', control.id, '--body', 'Unmuted CLI worker control'])).code).toBe(0);
          await waitForDelivery(recipient, control.id, controlBefore);
          // Observe the muted room after proving real worker delivery in the control.
          for (const waitMilliseconds of Array.from({ length: 15 }, () => 2000)) {
            await delay(waitMilliseconds);
            expect(pageSchema.parse(parseJsonStdout(await recipient(['notifications', 'list', '--per-page', '50']))).data.filter(row => row.payload.conversationId === room.id).map(row => row.id).sort()).toEqual(beforeMuted);
          }
        } finally { expect((await owner(['messaging', 'close', control.id])).code).toBe(0); }
        expect((await recipient(['messaging', 'read', room.id, muted.sequence])).code).toBe(0);
        expect((await recipient(['messaging', 'preferences', room.id, '--notification', 'all'])).code).toBe(0);
        expect(state.parse(parseJsonStdout(await recipient(['messaging', 'history', room.id]))).conversation.notification).toBe('all');
        const resumedBody = `Resumed CLI message ${randomUUID()}`;
        const resumed = z.object({ id: z.string() }).parse(parseJsonStdout(await owner(['messaging', 'send', room.id, '--body', resumedBody])));
        expect(state.parse(parseJsonStdout(await recipient(['messaging', 'history', room.id]))).messages.find(row => row.id === resumed.id)).toMatchObject({ body: resumedBody, author: { id: sender.user.id } });
        const resumedNotification = await waitForDelivery(recipient, room.id, beforeMuted);
        expect(pageSchema.parse(parseJsonStdout(await recipient(['notifications', 'list', '--per-page', '50']))).data.filter(row => row.payload.conversationId === room.id).map(row => row.id).sort()).toEqual([...beforeMuted, resumedNotification.id].sort());
        expect((await recipient(['notifications', 'read', resumedNotification.id])).code).toBe(0);
      } finally { expect((await owner(['messaging', 'close', room.id])).code).toBe(0); }
      expect((await owner(['auth', 'logout'])).code).toBe(0); expect((await recipient(['auth', 'logout'])).code).toBe(0);
    }));
  }, 420_000);
});
