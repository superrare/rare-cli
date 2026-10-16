import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Command, Option } from 'commander';
import { createRareApi } from '@rareprotocol/rare-sdk';
import { DEFAULT_RARE_API_BASE_URL } from '@rareprotocol/rare-sdk/data-access/base-url';
import { accountClient, accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { output } from '../output.js';

type BodyOptions = { body?: string; bodyFile?: string };
const client = (options: AccountCommandOptions): ReturnType<typeof accountClient>['messaging'] => accountClient(storageOptions(options)).messaging;
const print = (value: unknown): void => { output(value, () => { console.log(JSON.stringify(value, null, 2)); }); };
const repeat = (value: string, previous: string[]): string[] => [...previous, value];
const bodyOptions = (command: Command): Command => command.addOption(new Option('--body <text>', 'message text').conflicts('bodyFile')).addOption(new Option('--body-file <path>', 'read message text from a UTF-8 file').conflicts('body'));
const bodyText = async (options: BodyOptions): Promise<string> => {
  if (options.bodyFile !== undefined) return readFile(options.bodyFile, 'utf8');
  return options.body ?? '';
};

export function messagingCommand(): Command {
  const command = new Command('messaging').description('Durable conversations, messages and notification preferences');
  command.addCommand(accountCommand('session').action(async (options: AccountCommandOptions) => { print(await client(options).session()); }));
  command.addCommand(accountCommand('inbox').option('--search <text>').option('--cursor <value>').action(async (options: AccountCommandOptions & { search?: string; cursor?: string }) => { print(await client(options).inbox({ search: options.search, cursor: options.cursor })); }));
  command.addCommand(accountCommand('people').argument('<search>').action(async (search: string, options: AccountCommandOptions) => { print(await client(options).people(search)); }));
  command.addCommand(bodyOptions(accountCommand('direct')).argument('<user-id>', 'recipient account ID').option('--client-message-id <uuid>', 'reuse this ID to retry the same message').action(async (userId: string, options: AccountCommandOptions & BodyOptions & { clientMessageId?: string }) => { print(await client(options).createDirect({ recipientUserId: userId, clientMessageId: options.clientMessageId ?? randomUUID(), body: await bodyText(options) })); }));
  command.addCommand(bodyOptions(accountCommand('group')).requiredOption('--title <text>').option('--description <text>', '', '').option('--guidelines <text>', '', '').option('--invite <user-id>', 'invite an account; repeat for each account', repeat, []).option('--client-operation-id <uuid>', 'reuse for creation retries').option('--client-message-id <uuid>', 'initial message retry ID').action(async (options: AccountCommandOptions & BodyOptions & { title: string; description: string; guidelines: string; invite: string[]; clientOperationId?: string; clientMessageId?: string }) => {
    const body = await bodyText(options);
    print(await client(options).createRoom({ type: 'group', title: options.title, description: options.description, guidelines: options.guidelines, inviteeUserIds: options.invite, clientOperationId: options.clientOperationId ?? randomUUID(), ...(body.length > 0 ? { initialMessage: { clientMessageId: options.clientMessageId ?? randomUUID(), body } } : {}) }));
  }));
  command.addCommand(accountCommand('history').argument('<conversation-id>').option('--before <sequence>').option('--pinned', 'only pinned messages').action(async (id: string, options: AccountCommandOptions & { before?: string; pinned?: boolean }) => { print(await client(options).history(id, { before: options.before, pinned: options.pinned })); }));
  command.addCommand(accountCommand('changes').argument('<conversation-id>').requiredOption('--after <sequence>').action(async (id: string, options: AccountCommandOptions & { after: string }) => { print(await client(options).changes(id, options.after)); }));
  command.addCommand(accountCommand('watch').argument('<conversation-id>').option('--after <sequence>', 'change cursor; defaults to current history').option('--interval <milliseconds>', 'polling interval', '3000').action(async (id: string, options: AccountCommandOptions & { after?: string; interval: string }) => {
    const interval = Number(options.interval);
    if (!Number.isSafeInteger(interval) || interval < 1000) throw new Error('Polling interval must be an integer of at least 1000 milliseconds.');
    const messaging = client(options);
    const state = { cursor: options.after ?? (await messaging.history(id)).changeCursor };
    const controller = new AbortController();
    const stop = (): void => { controller.abort(); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
      while (!controller.signal.aborted) {
        const changes = await messaging.changes(id, state.cursor, { signal: controller.signal });
        print(changes);
        if (changes.resynchronize) {
          const history = await messaging.history(id, { signal: controller.signal });
          print(history);
          // eslint-disable-next-line functional/immutable-data -- The polling shell advances its cursor after each response.
          state.cursor = history.changeCursor;
        } else {
          // eslint-disable-next-line functional/immutable-data -- The polling shell advances its cursor after each response.
          state.cursor = changes.nextCursor;
        }
        if (!changes.hasMore) await delay(interval, undefined, { signal: controller.signal });
      }
    } catch (error) { if (!controller.signal.aborted) throw error; }
    finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
  }));
  command.addCommand(accountCommand('participants').argument('<conversation-id>').option('--after <user-id>').option('--search <text>').action(async (id: string, options: AccountCommandOptions & { after?: string; search?: string }) => { print(await client(options).participants(id, { after: options.after, search: options.search })); }));
  command.addCommand(bodyOptions(accountCommand('send')).argument('<conversation-id>').option('--client-message-id <uuid>', 'reuse this ID to retry the same message').option('--reply-to <message-id>').option('--mention <user-id>', 'repeat for each mentioned account', repeat, []).option('--attachment <attachment-id>', 'repeat for uploaded attachments', repeat, []).addOption(new Option('--post <post-id>').conflicts(['artwork', 'link'])).addOption(new Option('--artwork <universal-token-id>').conflicts(['post', 'link'])).addOption(new Option('--link <url>').conflicts(['post', 'artwork'])).action(async (id: string, options: AccountCommandOptions & BodyOptions & { clientMessageId?: string; replyTo?: string; mention: string[]; attachment: string[]; post?: string; artwork?: string; link?: string }) => { print(await client(options).send(id, {
    clientMessageId: options.clientMessageId ?? randomUUID(), body: await bodyText(options), replyToId: options.replyTo, attachmentIds: options.attachment, mentionUserIds: options.mention, linkPreviewUrl: options.link,
    ...(options.post !== undefined ? { reference: { kind: 'post', id: options.post } } : options.artwork !== undefined ? { reference: { kind: 'artwork', id: options.artwork } } : {}),
  })); }));
  for (const action of ['accept', 'decline', 'reopen', 'leave', 'close', 'pause', 'resume'] as const) command.addCommand(accountCommand(action).argument('<conversation-id>').action(async (id: string, options: AccountCommandOptions) => { print(await client(options).command(id, { action })); }));
  for (const action of ['invite', 'ban', 'unban', 'unbanAndInvite'] as const) command.addCommand(accountCommand(action === 'unbanAndInvite' ? 'unban-and-invite' : action).argument('<conversation-id>').argument('<user-id>').action(async (id: string, userId: string, options: AccountCommandOptions) => { print(await client(options).command(id, { action, userId })); }));
  command.addCommand(accountCommand('read').argument('<conversation-id>').argument('<sequence>').action(async (id: string, sequence: string, options: AccountCommandOptions) => { print(await client(options).command(id, { action: 'read', sequence })); }));
  command.addCommand(accountCommand('preferences').argument('<conversation-id>').addOption(new Option('--notification <mode>').choices(['all', 'mentions', 'muted']).makeOptionMandatory()).action(async (id: string, options: AccountCommandOptions & { notification: 'all' | 'mentions' | 'muted' }) => { print(await client(options).command(id, { action: 'preferences', notification: options.notification })); }));
  command.addCommand(accountCommand('settings').argument('<conversation-id>').option('--title <text>').option('--description <text>').option('--guidelines <text>').option('--expected-updated-at <timestamp>').action(async (id: string, options: AccountCommandOptions & { title?: string; description?: string; guidelines?: string; expectedUpdatedAt?: string }) => { print(await client(options).command(id, { action: 'settings', expectedUpdatedAt: options.expectedUpdatedAt, settings: { title: options.title, description: options.description, guidelines: options.guidelines } })); }));
  command.addCommand(bodyOptions(accountCommand('edit')).argument('<conversation-id>').argument('<message-id>').option('--expected-version <number>', 'reject the edit if this message version changed').option('--remove-preview').action(async (id: string, messageId: string, options: AccountCommandOptions & BodyOptions & { expectedVersion?: string; removePreview?: boolean }) => { print(await client(options).messageCommand(id, messageId, { action: 'edit', body: await bodyText(options), version: options.expectedVersion === undefined ? undefined : Number(options.expectedVersion), removePreview: options.removePreview })); }));
  command.addCommand(accountCommand('delete').argument('<conversation-id>').argument('<message-id>').action(async (id: string, messageId: string, options: AccountCommandOptions) => { print(await client(options).messageCommand(id, messageId, { action: 'delete' })); }));
  command.addCommand(accountCommand('react').argument('<conversation-id>').argument('<message-id>').argument('<emoji>').option('--remove').action(async (id: string, messageId: string, emoji: string, options: AccountCommandOptions & { remove?: boolean }) => { print(await client(options).messageCommand(id, messageId, { action: 'reaction', emoji, active: !options.remove })); }));
  command.addCommand(accountCommand('pin').argument('<conversation-id>').argument('<message-id>').option('--remove').action(async (id: string, messageId: string, options: AccountCommandOptions & { remove?: boolean }) => { print(await client(options).messageCommand(id, messageId, { action: 'pin', pinned: !options.remove })); }));
  command.addCommand(accountCommand('report').argument('<conversation-id>').argument('<message-id>').requiredOption('--reason <text>').option('--keep-visible').action(async (id: string, messageId: string, options: AccountCommandOptions & { reason: string; keepVisible?: boolean }) => { print(await client(options).messageCommand(id, messageId, { action: 'report', reason: options.reason, hide: !options.keepVisible })); }));
  command.addCommand(accountCommand('blocks').action(async (options: AccountCommandOptions) => { print(await client(options).blocks()); }));
  for (const action of ['block', 'unblock'] as const) command.addCommand(accountCommand(action).argument('<user-id>').action(async (userId: string, options: AccountCommandOptions) => { await client(options)[action](userId); print({ userId, blocked: action === 'block' }); }));
  command.addCommand(accountCommand('preview').argument('<conversation-id>').argument('<url>').action(async (id: string, url: string, options: AccountCommandOptions) => { print(await client(options).preview(id, url)); }));
  command.addCommand(accountCommand('upload-image').argument('<conversation-id>').argument('<file>').addOption(new Option('--content-type <type>').choices(['image/jpeg', 'image/png', 'image/webp', 'image/gif']).makeOptionMandatory()).requiredOption('--width <pixels>').requiredOption('--height <pixels>').option('--upload-id <uuid>', 'reuse for upload retries').action(async (id: string, file: string, options: AccountCommandOptions & { contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; width: string; height: string; uploadId?: string }) => { print(await client(options).uploadImage(id, await readFile(file), { contentType: options.contentType, width: Number(options.width), height: Number(options.height), uploadId: options.uploadId })); }));
  command.addCommand(accountCommand('download-image').argument('<attachment-id>').requiredOption('--output <path>').action(async (id: string, options: AccountCommandOptions & { output: string }) => { const blob = await client(options).readImage(id); await writeFile(options.output, Buffer.from(await blob.arrayBuffer())); print({ saved: options.output, contentType: blob.type, size: blob.size }); }));
  const publicCommand = (name: string): Command => new Command(name).addOption(new Option('--api-url <url>', 'Rare API base URL').default(DEFAULT_RARE_API_BASE_URL).env('RARE_API_URL'));
  const publicMessaging = new Command('public').description('Public auction, liquid edition and drop announcement rooms');
  publicMessaging.addCommand(publicCommand('resolve').argument('<type>', 'auction, liquid-edition or drop-announcement').argument('[resource-id]', 'auction or drop announcement ID').option('--chain-id <number>', 'liquid edition chain ID').option('--contract-address <address>', 'liquid edition contract address').action(async (type: string, id: string | undefined, options: { apiUrl: string; chainId?: string; contractAddress?: string }): Promise<void> => {
    const context = publicContext(type, id, options);
    print(await createRareApi({ baseUrl: options.apiUrl }).messaging.resolveRoom(context));
  }));
  publicMessaging.addCommand(publicCommand('history').argument('<room-id>').option('--before <sequence>').option('--after <sequence>').option('--limit <number>', 'messages to return', '50').action(async (id: string, options: { apiUrl: string; before?: string; after?: string; limit: string }): Promise<void> => {
    print(await createRareApi({ baseUrl: options.apiUrl }).messaging.history(id, { before: options.before, after: options.after, limit: Number(options.limit) }));
  }));
  publicMessaging.addCommand(publicCommand('watch').argument('<room-id>').option('--after <sequence>').option('--interval <milliseconds>', 'polling interval', '3000').action(async (id: string, options: { apiUrl: string; after?: string; interval: string }): Promise<void> => {
    const interval = Number(options.interval);
    if (!Number.isSafeInteger(interval) || interval < 1000) throw new Error('Polling interval must be an integer of at least 1000 milliseconds.');
    const messaging = createRareApi({ baseUrl: options.apiUrl }).messaging;
    const initial = await messaging.history(id);
    print(initial);
    const state = { cursor: options.after ?? initial.room.latestSequence };
    const controller = new AbortController();
    const stop = (): void => { controller.abort(); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
      while (!controller.signal.aborted) {
        const page = await messaging.history(id, { after: state.cursor, signal: controller.signal });
        if (page.messages.length > 0) print(page);
        // eslint-disable-next-line functional/immutable-data -- The polling shell advances its cursor after each response.
        state.cursor = page.messages.at(-1)?.sequence ?? state.cursor;
        if (page.nextCursor === null) await delay(interval, undefined, { signal: controller.signal });
      }
    } catch (error) { if (!controller.signal.aborted) throw error; }
    finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
  }));
  publicMessaging.addCommand(bodyOptions(accountCommand('send')).argument('<room-id>').option('--client-message-id <uuid>', 'reuse for retries').option('--reply-to <message-id>').option('--mention <user-id>', 'repeat for mentioned accounts', repeat, []).action(async (id: string, options: AccountCommandOptions & BodyOptions & { clientMessageId?: string; replyTo?: string; mention: string[] }): Promise<void> => {
    print(await client(options).sendPublic(id, { clientMessageId: options.clientMessageId ?? randomUUID(), body: await bodyText(options), replyToId: options.replyTo, mentionUserIds: options.mention }));
  }));
  command.addCommand(publicMessaging);
  return command;
}

type PublicContext = { type: 'auction'; id: string } | { type: 'drop-announcement'; id: string } | { type: 'liquid-edition'; chainId: number; contractAddress: string };
function publicContext(type: string, id: string | undefined, options: { chainId?: string; contractAddress?: string }): PublicContext {
  if (type === 'auction' || type === 'drop-announcement') {
    if (id === undefined || options.chainId !== undefined || options.contractAddress !== undefined) throw new Error('Auction and drop rooms require a resource ID and no chain or contract flags.');
    return type === 'auction' ? { type: 'auction', id } : { type: 'drop-announcement', id };
  }
  if (type === 'liquid-edition') {
    const chainId = Number(options.chainId);
    if (id !== undefined || !Number.isSafeInteger(chainId) || chainId <= 0 || options.contractAddress === undefined) throw new Error('Liquid edition rooms require --chain-id and --contract-address, without a resource ID.');
    return { type, chainId, contractAddress: options.contractAddress };
  }
  throw new Error('Choose auction, liquid-edition or drop-announcement.');
}
