import { parseJsonStdout } from '../helpers/cli.js';
import { retryPublicSend } from './helpers/messaging-live.js';
import { appendSystemFixture } from './helpers/messaging-system-fixture.js';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { privateKeyToAccount } from 'viem/accounts';
import { createRareClient } from '@rareprotocol/rare-sdk';
import { isPrivateKeyString } from '@rareprotocol/rare-sdk/validation';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { messagingOrigin, required, withMessagingActors, type MessagingActor } from './helpers/messaging-live.js';

const created = z.object({ id: z.string().uuid() });
const publicThread = z.object({ room: z.object({ latestSequence: z.string(), context: z.record(z.string(), z.unknown()) }), messages: z.array(z.object({ id: z.string().uuid(), type: z.enum(['user', 'system']), body: z.string(), author: z.object({ id: z.string() }).nullable(), system: z.object({ sourceId: z.string(), type: z.string(), summary: z.string(), payload: z.record(z.string(), z.unknown()), occurredAt: z.string() }).optional() })) });
const notice = z.object({ id: z.string(), category: z.string(), payload: z.record(z.string(), z.unknown()), readAt: z.string().nullable() });
const noticePage = z.object({ data: z.array(notice), pagination: z.object({ page: z.number(), perPage: z.number(), totalCount: z.number(), totalPages: z.number() }) });
const notices = async (actor: MessagingActor, room: string, pageNumber = 1): Promise<z.infer<typeof notice>[]> => {
  if (pageNumber > 100) throw new Error('Notification traversal exceeded 100 pages');
  const page = noticePage.parse(await actor.json(['notifications', 'list', '--per-page', '50', '--page', String(pageNumber)]));
  const matches = page.data.filter(row => row.category === 'messagingActivity' && row.payload.conversationId === room);
  return page.pagination.page >= page.pagination.totalPages ? matches : [...matches, ...await notices(actor, room, pageNumber + 1)];
};
const delivered = async (actor: MessagingActor, room: string, excluded: readonly string[], deadline = Date.now() + 90_000): Promise<z.infer<typeof notice>> => {
  const match = (await notices(actor, room)).find(row => !excluded.includes(row.id));
  if (match) return match;
  if (Date.now() >= deadline) throw new Error('Public chat notification did not reach the CLI inbox within 90 seconds');
  await delay(2000);
  return delivered(actor, room, excluded, deadline);
};
const stableNotices = async (actor: MessagingActor, room: string, ids: readonly string[]): Promise<void> => {
  for (const milliseconds of Array.from({ length: 15 }, () => 2000)) {
    await delay(milliseconds);
    expect((await notices(actor, room)).map(row => row.id).sort()).toEqual([...ids].sort());
  }
};

describe('public room delivery and system-message protection through the built CLI', () => {
  it.each(['auction', 'liquid-edition', 'drop-announcement'])('observes %s subscriptions, saved messages and delivered notifications', async type => {
    await withMessagingActors(async (owner, recipient) => {
      const key = required('RARE_ACCOUNT_TEST_PRIVATE_KEY');
      if (!isPrivateKeyString(key)) throw new Error('Invalid fixture wallet');
      const wallet = privateKeyToAccount(key);
      const fixture = createRareClient({ apiBaseUrl: messagingOrigin() });
      try {
        // SDK use here only prepares the shared image and an ordinary user token.
        // All chat actions and all result verification below use the built CLI.
        const drop = type === 'drop-announcement' ? await (async (): Promise<{ id: string }> => {
          await fixture.auth.loginWithWallet({ address: wallet.address, chainId: 11155111, signMessage: message => wallet.signMessage({ message }) });
          const image = await fixture.upload(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'), 'cli-public-delivery.gif', { contentType: 'image/gif' });
          await owner.json(['auth', 'login', '--wallet', '--chain', 'sepolia']);
          return z.object({ id: z.string() }).parse(await owner.json(['drops', 'create', '--headline', `CLI public delivery ${randomUUID()}`, '--description', 'Temporary live delivery fixture', '--starts-at', new Date(Date.now() + 86400000).toISOString(), '--image-url', image.url]));
        })() : null;
        try {
          const context = type === 'auction' ? [required('RARE_MESSAGING_TEST_AUCTION_ID')] : type === 'liquid-edition' ? ['--chain-id', required('RARE_MESSAGING_TEST_EDITION_CHAIN_ID'), '--contract-address', required('RARE_MESSAGING_TEST_EDITION_ADDRESS')] : [drop?.id ?? required('RARE_MESSAGING_TEST_DROP_ID')];
          const room = created.parse(await owner.json(['messaging', 'public', 'resolve', type, ...context]));
          const sent: { actor: MessagingActor; id: string }[] = [];
          const thread = async (): Promise<z.infer<typeof publicThread>> => publicThread.parse(await recipient.json(['messaging', 'public', 'history', room.id]));
          const send = async (actor: MessagingActor, body: string, mentions: string[] = []): Promise<{ message: { id: string }; args: string[]; body: string }> => {
            const clientId = randomUUID();
            const args = ['messaging', 'public', 'send', room.id, '--body', body, '--client-message-id', clientId, ...mentions.flatMap(id => ['--mention', id])];
            const message = created.parse(parseJsonStdout(await retryPublicSend(actor.run, args)));
            // eslint-disable-next-line functional/immutable-data
            sent.push({ actor, id: message.id });
            expect((await thread()).messages.find(row => row.id === message.id)).toMatchObject({ type: 'user', body, author: { id: actor.user.id } });
            return { message, args, body };
          };
          const preference = async (): Promise<string | undefined> => z.object({ conversations: z.array(z.object({ id: z.string(), notification: z.string() })) }).parse(await recipient.json(['messaging', 'inbox'])).conversations.find(row => row.id === room.id)?.notification;
          try {
            await send(owner, 'CLI sender joins public room');
            await send(recipient, 'CLI recipient subscribes by sending');
            // Existing auction/edition fixtures preserve their previous preferences.
            // The newly created drop room exercises the initial default.
            if (type !== 'drop-announcement') await recipient.json(['messaging', 'preferences', room.id, '--notification', 'all']);
            expect(await preference()).toBe('all');
            // Rejoining keeps the previous cursor; exclude delayed setup messages.
            await recipient.json(['messaging', 'read', room.id, (await thread()).room.latestSequence]);
            const before = (await notices(recipient, room.id)).map(row => row.id);
            const ordinary = await send(owner, `CLI public notification ${randomUUID()}`);
            parseJsonStdout(await retryPublicSend(owner.run, ordinary.args));
            const notification = await delivered(recipient, room.id, before);
            expect(notification.readAt).toBeNull();
            expect((await notices(recipient, room.id)).filter(row => !before.includes(row.id))).toHaveLength(1);
            expect((await thread()).messages.filter(row => row.body === ordinary.body)).toHaveLength(1);
            await recipient.json(['notifications', 'read', notification.id]);
            expect((await notices(recipient, room.id)).find(row => row.id === notification.id)?.readAt).not.toBeNull();
            if (type === 'drop-announcement') {
              await recipient.json(['messaging', 'preferences', room.id, '--notification', 'mentions']);
              expect(await preference()).toBe('mentions');
              const mentionsBefore = (await notices(recipient, room.id)).map(row => row.id);
              await send(owner, 'An ordinary unmentioned CLI message');
              await send(owner, 'A CLI mention notification', [recipient.user.id]);
              const mention = await delivered(recipient, room.id, mentionsBefore);
              await stableNotices(recipient, room.id, [...mentionsBefore, mention.id]);
              await recipient.json(['messaging', 'preferences', room.id, '--notification', 'muted']);
              expect(await preference()).toBe('muted');
              const mutedBefore = (await notices(recipient, room.id)).map(row => row.id);
              await send(owner, 'Muted CLI mention', [recipient.user.id]);
              const control = created.parse(await owner.json(['messaging', 'group', '--title', `CLI live worker control ${randomUUID()}`, '--invite', recipient.user.id]));
              try {
                await recipient.json(['messaging', 'accept', control.id]);
                const previous = (await notices(recipient, control.id)).map(row => row.id);
                const body = `Unmuted CLI worker control ${randomUUID()}`;
                const message = created.parse(await owner.json(['messaging', 'send', control.id, '--body', body]));
                const history = z.object({ messages: z.array(z.object({ id: z.string(), body: z.string() })) }).parse(await recipient.json(['messaging', 'history', control.id]));
                expect(history.messages.find(row => row.id === message.id)?.body).toBe(body);
                await delivered(recipient, control.id, previous);
                await stableNotices(recipient, room.id, mutedBefore);
              } finally { await owner.json(['messaging', 'close', control.id]); }
              await recipient.json(['messaging', 'preferences', room.id, '--notification', 'all']);
              expect(await preference()).toBe('all');
              const systemBefore = (await notices(recipient, room.id)).map(row => row.id);
              const system = { sourceId: `integration:${randomUUID()}`, type: 'integration.notice', summary: 'Live CLI system notification fixture', payload: { fixture: true, values: [1, 2] }, occurredAt: new Date().toISOString() };
              const append = (token?: string, body: unknown = system): Promise<Response> => fetch(`${messagingOrigin()}/v1/messaging/internal/public/rooms/${room.id}/system`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Messaging-Request': '1', ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }) }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
              const session = await fixture.auth.getSession();
              if (!session) throw new Error('Missing ordinary fixture session');
              for (const token of [undefined, 'forged']) expect([401, 404]).toContain((await append(token)).status);
              expect((await append(session.accessToken)).status).toBe(404);
              expect((await thread()).messages.some(row => row.system?.sourceId === system.sourceId)).toBe(false);
              // Set up through the real Pipelines writer; the CLI independently
              // verifies persisted history and notification delivery afterward.
              const stored = await appendSystemFixture((await thread()).room.context, system);
              expect((await appendSystemFixture((await thread()).room.context, system)).id).toBe(stored.id);
              await expect(appendSystemFixture((await thread()).room.context, { ...system, summary: 'Conflicting system fixture' })).rejects.toThrow('reused');
              const saved = await thread();
              expect(saved.messages.filter(row => row.id === stored.id)).toHaveLength(1);
              expect(saved.messages.find(row => row.id === stored.id)).toMatchObject({ type: 'system', author: null, body: system.summary, system });
              const systemNotification = await delivered(recipient, room.id, systemBefore);
              await stableNotices(recipient, room.id, [...systemBefore, systemNotification.id]);
              expect((await owner.run(['messaging', 'edit', room.id, stored.id, '--body', 'Forged edit'])).code).not.toBe(0);
              expect((await owner.run(['messaging', 'delete', room.id, stored.id])).code).not.toBe(0);
              expect((await thread()).messages.find(row => row.id === stored.id)).toMatchObject({ type: 'system', body: system.summary, system });
            }
          } finally {
            for (const message of sent) await message.actor.json(['messaging', 'delete', room.id, message.id]);
            const after = await thread();
            for (const message of sent) expect(after.messages.some(row => row.id === message.id)).toBe(false);
            for (const actor of [owner, recipient]) {
              await actor.json(['messaging', 'leave', room.id]);
              const inbox = z.object({ conversations: z.array(z.object({ id: z.string() })) }).parse(await actor.json(['messaging', 'inbox']));
              expect(inbox.conversations.some(row => row.id === room.id)).toBe(false);
            }
          }
        } finally {
          if (drop) await owner.json(['drops', 'delete', drop.id]);
        }
      } finally { await fixture.auth.logout(); }
    });
  }, 600_000);
});
