import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { conversation, history, participants, messagingOrigin, required, withMessagingActors } from './helpers/messaging-live.js';
const created = z.object({ id: z.string().uuid() });

describe('messaging authorization through the built CLI and deployed services', () => {
  it('persists invitation decisions and enforces owner-only settings, bans and room lifecycle', async () => {
    await withMessagingActors(async (owner, member, outsider) => {
      const room = created.parse(await owner.json(['messaging', 'group', '--title', `CLI authorization ${randomUUID()}`]));
      try {
        const sent = created.parse(await owner.json(['messaging', 'send', room.id, '--body', 'Private owner message']));
        expect((await outsider.run(['messaging', 'history', room.id])).code).not.toBe(0);
        await owner.json(['messaging', 'invite', room.id, member.user.id]);
        expect(history.parse(await member.json(['messaging', 'history', room.id])).messages).toEqual([]);
        expect((await member.run(['messaging', 'send', room.id, '--body', 'Before acceptance'])).code).not.toBe(0);
        await member.json(['messaging', 'decline', room.id]);
        expect(participants.parse(await owner.json(['messaging', 'participants', room.id])).participants.find(row => row.user.id === member.user.id)?.state).toBe('left');
        await owner.json(['messaging', 'invite', room.id, member.user.id]);
        await member.json(['messaging', 'accept', room.id]);
        expect(history.parse(await member.json(['messaging', 'history', room.id])).messages.find(row => row.id === sent.id)).toMatchObject({ body: 'Private owner message', author: { id: owner.user.id } });
        for (const args of [['settings', room.id, '--title', 'Hijacked'], ['ban', room.id, owner.user.id], ['pause', room.id], ['close', room.id]]) expect((await member.run(['messaging', ...args])).code).not.toBe(0);
        const initial = history.parse(await owner.json(['messaging', 'history', room.id]));
        expect(initial.conversation.lifecycle).toBe('open');
        expect(initial.conversation.title).not.toBe('Hijacked');
        await owner.json(['messaging', 'settings', room.id, '--title', 'Updated by CLI owner']);
        expect(history.parse(await member.json(['messaging', 'history', room.id])).conversation.title).toBe('Updated by CLI owner');
        await owner.json(['messaging', 'ban', room.id, member.user.id]);
        expect(participants.parse(await owner.json(['messaging', 'participants', room.id])).participants.find(row => row.user.id === member.user.id)?.state).toBe('removed');
        expect(history.parse(await member.json(['messaging', 'history', room.id])).messages).toEqual([]);
        expect((await member.run(['messaging', 'send', room.id, '--body', 'Banned write'])).code).not.toBe(0);
        await owner.json(['messaging', 'unban', room.id, member.user.id]);
        expect((await member.run(['messaging', 'send', room.id, '--body', 'Not reinvited'])).code).not.toBe(0);
        await owner.json(['messaging', 'invite', room.id, member.user.id]);
        await member.json(['messaging', 'accept', room.id]);
        await owner.json(['messaging', 'pause', room.id]);
        expect(history.parse(await member.json(['messaging', 'history', room.id])).conversation.lifecycle).toBe('paused');
        expect((await member.run(['messaging', 'send', room.id, '--body', 'Paused write'])).code).not.toBe(0);
        await owner.json(['messaging', 'resume', room.id]);
        const resumed = created.parse(await member.json(['messaging', 'send', room.id, '--body', 'Resumed CLI member']));
        const saved = history.parse(await owner.json(['messaging', 'history', room.id]));
        expect(saved.messages.find(row => row.id === resumed.id)).toMatchObject({ body: 'Resumed CLI member', author: { id: member.user.id } });
        for (const body of ['Before acceptance', 'Banned write', 'Not reinvited', 'Paused write']) expect(saved.messages.some(row => row.body === body)).toBe(false);
      } finally {
        await owner.json(['messaging', 'close', room.id]);
        expect(history.parse(await owner.json(['messaging', 'history', room.id])).conversation.lifecycle).toBe('closed');
      }
    });
  }, 300_000);

  it('keeps declined requests read-only and verifies blocks and unblocks through independent reads', async () => {
    await withMessagingActors(async (owner, recipient, peer) => {
      const requestId = '24047114-59b7-42e4-a933-e0f6e263159e';
      const request = conversation.parse(await owner.json(['messaging', 'direct', recipient.user.id, '--client-message-id', requestId, '--body', 'CLI repeatable request fixture']));
      expect(request.capabilities.state, 'Keep this dedicated account pair declined rather than accepted').toBe('request');
      expect(history.parse(await owner.json(['messaging', 'history', request.id])).messages.find(row => row.clientMessageId === requestId)?.body).toBe('CLI repeatable request fixture');
      expect((await owner.run(['messaging', 'send', request.id, '--body', 'Cannot bypass request'])).code).not.toBe(0);
      await recipient.json(['messaging', 'decline', request.id]);
      expect(history.parse(await recipient.json(['messaging', 'history', request.id])).messages).toEqual([]);
      expect((await owner.run(['messaging', 'reopen', request.id])).code).not.toBe(0);
      const blocks = z.array(z.object({ id: z.string() }));
      const before = blocks.parse(await owner.json(['messaging', 'blocks']));
      expect(before.some(row => row.id === peer.user.id)).toBe(false);
      expect(blocks.parse(await peer.json(['messaging', 'blocks'])).some(row => row.id === owner.user.id)).toBe(false);
      const direct = conversation.parse(await owner.json(['messaging', 'direct', peer.user.id, '--client-message-id', '6b54529f-7258-4a0e-872f-aa7a14adb05c', '--body', 'CLI accepted direct fixture']));
      const peerState = history.parse(await peer.json(['messaging', 'history', direct.id])).conversation;
      if (peerState.capabilities.accept) await peer.json(['messaging', 'accept', direct.id]);
      else if (peerState.capabilities.reopen) await peer.json(['messaging', 'reopen', direct.id]);
      expect(history.parse(await peer.json(['messaging', 'history', direct.id])).conversation.capabilities.send).toBe(true);
      const body = `CLI direct ${randomUUID()}`;
      const message = created.parse(await owner.json(['messaging', 'send', direct.id, '--body', body]));
      try {
        expect(history.parse(await peer.json(['messaging', 'history', direct.id])).messages.find(row => row.id === message.id)).toMatchObject({ body, author: { id: owner.user.id } });
        await owner.json(['messaging', 'block', peer.user.id]);
        expect(blocks.parse(await owner.json(['messaging', 'blocks'])).map(row => row.id)).toContain(peer.user.id);
        for (const actor of [owner, peer]) {
          expect(history.parse(await actor.json(['messaging', 'history', direct.id])).conversation.capabilities.send).toBe(false);
          expect((await actor.run(['messaging', 'send', direct.id, '--body', 'Blocked write'])).code).not.toBe(0);
        }
        expect((await peer.run(['messaging', 'direct', owner.user.id, '--body', 'Blocked first contact'])).code).not.toBe(0);
        const saved = history.parse(await peer.json(['messaging', 'history', direct.id]));
        for (const body of ['Blocked write', 'Blocked first contact']) expect(saved.messages.some(row => row.body === body)).toBe(false);
      } finally { await owner.json(['messaging', 'unblock', peer.user.id]); }
      expect(blocks.parse(await owner.json(['messaging', 'blocks']))).toEqual(before);
      const reply = created.parse(await peer.json(['messaging', 'send', direct.id, '--body', 'Unblocked CLI reply']));
      expect(history.parse(await owner.json(['messaging', 'history', direct.id])).messages.find(row => row.id === reply.id)?.body).toBe('Unblocked CLI reply');
      await owner.json(['messaging', 'delete', direct.id, message.id]);
      await peer.json(['messaging', 'delete', direct.id, reply.id]);
      expect(history.parse(await owner.json(['messaging', 'history', direct.id])).messages.find(row => row.id === reply.id)).toMatchObject({ deleted: true, body: '' });
    });
  }, 300_000);

  it('verifies uploaded image bytes and denies attachment reuse, outsiders and revoked members', async () => {
    const bucket = required('RARE_MESSAGING_TEST_PRIVATE_BUCKET');
    if (bucket.includes('prod') || !/^[a-z0-9-]+$/.test(bucket)) throw new Error('Use the non-production messaging bucket');
    execFileSync('gcloud', ['--project=superrare-dev', 'storage', 'buckets', 'describe', `gs://${bucket}`, '--format=value(name)'], { stdio: 'pipe' });
    await withMessagingActors(async (owner, member, outsider) => {
      const room = created.parse(await owner.json(['messaging', 'group', '--title', `CLI images ${randomUUID()}`]));
      const otherRoom = created.parse(await owner.json(['messaging', 'group', '--title', `CLI other images ${randomUUID()}`]));
      const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9uQAAAAASUVORK5CYII=', 'base64');
      const file = join(owner.directory, 'private.png');
      await writeFile(file, bytes);
      const uploadId = randomUUID();
      const object = `gs://${bucket}/messaging/${room.id}/${uploadId}/${createHash('sha256').update(bytes).digest('hex')}`;
      const download = async (actor: typeof owner, id: string): Promise<Buffer> => {
        const output = join(actor.directory, `download-${randomUUID()}.png`);
        await actor.json(['messaging', 'download-image', id, '--output', output]);
        return readFile(output);
      };
      try {
        await owner.json(['messaging', 'invite', room.id, member.user.id]);
        await member.json(['messaging', 'accept', room.id]);
        const image = created.parse(await owner.json(['messaging', 'upload-image', room.id, file, '--content-type', 'image/png', '--width', '1', '--height', '1', '--upload-id', uploadId]));
        expect(await download(owner, image.id)).toEqual(bytes);
        expect((await member.run(['messaging', 'download-image', image.id, '--output', join(member.directory, 'denied.png')])).code).not.toBe(0);
        await expect(readFile(join(member.directory, 'denied.png'))).rejects.toMatchObject({ code: 'ENOENT' });
        expect((await owner.run(['messaging', 'send', otherRoom.id, '--body', 'Cross room', '--attachment', image.id])).code).not.toBe(0);
        expect(history.parse(await owner.json(['messaging', 'history', otherRoom.id])).messages).toEqual([]);
        const sent = created.parse(await owner.json(['messaging', 'send', room.id, '--body', 'Private CLI image', '--attachment', image.id]));
        expect(history.parse(await member.json(['messaging', 'history', room.id])).messages.find(row => row.id === sent.id)?.attachments).toContainEqual({ id: image.id });
        expect(await download(member, image.id)).toEqual(bytes);
        expect((await outsider.run(['messaging', 'download-image', image.id, '--output', join(outsider.directory, 'denied.png')])).code).not.toBe(0);
        await expect(readFile(join(outsider.directory, 'denied.png'))).rejects.toMatchObject({ code: 'ENOENT' });
        expect((await fetch(`${messagingOrigin()}/v1/messaging/attachments/${image.id}`)).status).toBe(401);
        await owner.json(['messaging', 'ban', room.id, member.user.id]);
        expect((await member.run(['messaging', 'download-image', image.id, '--output', join(member.directory, 'revoked.png')])).code).not.toBe(0);
        await expect(readFile(join(member.directory, 'revoked.png'))).rejects.toMatchObject({ code: 'ENOENT' });
        await owner.json(['messaging', 'delete', room.id, sent.id]);
        expect(history.parse(await owner.json(['messaging', 'history', room.id])).messages.find(row => row.id === sent.id)).toMatchObject({ deleted: true, attachments: [] });
        expect((await owner.run(['messaging', 'download-image', image.id, '--output', join(owner.directory, 'deleted.png')])).code).not.toBe(0);
        await expect(readFile(join(owner.directory, 'deleted.png'))).rejects.toMatchObject({ code: 'ENOENT' });
      } finally {
        await owner.json(['messaging', 'close', room.id]);
        await owner.json(['messaging', 'close', otherRoom.id]);
        try { execFileSync('gcloud', ['--project=superrare-dev', 'storage', 'rm', object], { stdio: 'pipe' }); }
        catch (error) {
          const stderr = error !== null && typeof error === 'object' && 'stderr' in error && error.stderr instanceof Uint8Array ? Buffer.from(error.stderr).toString('utf8') : '';
          if (!/No URLs matched|URLs matched no objects or files|HTTPError 404|does not exist/.test(stderr)) throw error;
        }
      }
    });
  }, 300_000);
});
