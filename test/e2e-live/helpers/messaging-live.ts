import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { isPrivateKeyString } from '@rareprotocol/rare-sdk/validation';
import { parseJsonStdout, runCli, withTempHome, type CliResult } from '../../helpers/cli.js';

export const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
export const messagingOrigin = (): string => {
  const url = new URL(required('RARE_ACCOUNT_TEST_API_URL'));
  if (url.protocol !== 'https:' || url.hostname === 'api.superrare.com' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('Use a non-production HTTPS API origin');
  return url.origin;
};
export const conversation = z.object({ id: z.string().uuid(), title: z.string(), lifecycle: z.enum(['open', 'paused', 'closed']), notification: z.enum(['all', 'mentions', 'muted']), capabilities: z.object({ state: z.string(), send: z.boolean(), accept: z.boolean(), reopen: z.boolean() }) });
export const message = z.object({ id: z.string().uuid(), clientMessageId: z.string().uuid(), body: z.string(), deleted: z.boolean(), author: z.object({ id: z.string() }), attachments: z.array(z.object({ id: z.string().uuid() })) });
export const history = z.object({ conversation, messages: z.array(message) });
export const participants = z.object({ participants: z.array(z.object({ user: z.object({ id: z.string() }), state: z.string() })) });

export type MessagingActor = { run: (args: string[]) => Promise<CliResult>; json: (args: string[]) => Promise<unknown>; user: { id: string; username: string }; directory: string };
const actor = async (temporary: string, name: string): Promise<MessagingActor> => {
  const key = required(name);
  if (!isPrivateKeyString(key)) throw new Error(`Invalid ${name}`);
  const home = await realpath(temporary);
  const directory = join(home, '.rare');
  await mkdir(directory, { mode: 0o700 });
  await writeFile(join(directory, 'config.json'), JSON.stringify({ defaultChain: 'mainnet', chains: { mainnet: { privateKey: key }, sepolia: { privateKey: key } } }), { mode: 0o600 });
  const api = messagingOrigin();
  const run = (args: string[]): Promise<CliResult> => runCli(['--json', ...args], { home, env: { RARE_API_URL: api, RARE_API_BASE_URL: api, RARE_AUTH_STORAGE: 'file', RARE_AUTH_DIRECTORY: join(directory, 'auth') }, timeoutMs: 45_000 });
  const json = async (args: string[]): Promise<unknown> => parseJsonStdout(await run(args));
  await json(['auth', 'login', '--wallet', '--chain', 'mainnet']);
  try {
    const session = z.object({ user: z.object({ id: z.string(), username: z.string() }) }).parse(await json(['messaging', 'session']));
    return { run, json, user: session.user, directory };
  } catch (error) {
    await json(['auth', 'logout']);
    throw error;
  }
};
export const withMessagingActors = async (operation: (owner: MessagingActor, member: MessagingActor, outsider: MessagingActor) => Promise<void>): Promise<void> =>
  withTempHome(async first => withTempHome(async second => withTempHome(async third => {
    const owner = await actor(first, 'RARE_ACCOUNT_TEST_PRIVATE_KEY');
    try {
      const member = await actor(second, 'RARE_ACCOUNT_TEST_SECOND_PRIVATE_KEY');
      try {
        const outsider = await actor(third, 'RARE_ACCOUNT_TEST_THIRD_PRIVATE_KEY');
        try {
          if (new Set([owner.user.id, member.user.id, outsider.user.id]).size !== 3) throw new Error('Use three distinct existing test accounts');
          await operation(owner, member, outsider);
        } finally { await outsider.json(['auth', 'logout']); }
      } finally { await member.json(['auth', 'logout']); }
    } finally { await owner.json(['auth', 'logout']); }
  })));
