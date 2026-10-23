import { z } from 'zod';
import type { RareAccountProfilePatch, RareDeviceAuthorization } from '@rareprotocol/rare-sdk';

export type LoginOptions = {
  wallet?: boolean;
  device?: boolean;
  noWait?: boolean;
  poll?: string;
  resume?: string;
  browser?: boolean;
  chain?: string;
  chainId?: string;
};
export type LoginPlan =
  | { mode: 'wallet' }
  | { mode: 'start'; wait: boolean; openBrowser: boolean }
  | { mode: 'continue'; requestId: string; wait: boolean };
type Result<T> = { ok: true; value: T } | { ok: false; message: string };

export function planLogin(options: LoginOptions, json: boolean, interactive: boolean): Result<LoginPlan> {
  const selections = [options.wallet === true, options.device === true, options.poll !== undefined, options.resume !== undefined].filter(Boolean).length;
  if (selections > 1) return { ok: false, message: 'Choose only one of --wallet, --device, --poll or --resume.' };
  if (options.wallet === true) {
    if (options.noWait === true || options.browser === false) return { ok: false, message: 'Browser and device waiting options cannot be used with --wallet.' };
    return { ok: true, value: { mode: 'wallet' } };
  }
  if (options.chain !== undefined || options.chainId !== undefined) return { ok: false, message: 'Chain options are only used with --wallet.' };
  const requestId = options.poll ?? options.resume;
  if (requestId !== undefined) {
    if (options.noWait === true || options.browser === false || !/^[a-zA-Z0-9_-]{1,128}$/u.test(requestId)) {
      return { ok: false, message: 'Use a valid local request ID with --poll or --resume, without browser or --no-wait options.' };
    }
    return { ok: true, value: { mode: 'continue', requestId, wait: options.resume !== undefined } };
  }
  if ((json || !interactive) && options.noWait !== true) {
    return { ok: false, message: 'JSON or noninteractive device login requires --no-wait; continue with --poll or --resume and the returned request ID.' };
  }
  return { ok: true, value: { mode: 'start', wait: options.noWait !== true, openBrowser: interactive && !json && options.browser !== false } };
}

const pendingSchema = z.object({
  authBaseUrl: z.string(), apiBaseUrl: z.string(), clientId: z.string(),
  sessionRevision: z.string().nullable(),
  deviceCode: z.string().min(1), userCode: z.string().min(1), verificationUri: z.string(),
  verificationUriComplete: z.string().optional(),
  expiresAt: z.number().finite().positive(), interval: z.number().finite().positive(), nextPollAt: z.number().finite().positive(),
}).strict();

export function parsePendingAuthorization(value: unknown): Result<RareDeviceAuthorization> {
  const result = pendingSchema.safeParse(value);
  return result.success ? { ok: true, value: result.data } : { ok: false, message: 'Pending device request is missing or invalid. Start a new device login.' };
}

const profilePatchSchema = z.object({
  username: z.string().optional(),
  email: z.string().optional(),
  profile: z.object({
    fullName: z.string().optional(), bio: z.string().optional(), avatar: z.string().optional(),
    website: z.string().optional(), twitterlink: z.string().optional(), discordlink: z.string().optional(),
    instagramlink: z.string().optional(), youtubelink: z.string().optional(), masthead_universal_token_id: z.string().optional(),
  }).strict().optional(),
}).strict();

/** Structural narrowing at the input boundary; domain validation remains in the SDK. */
export function parseProfileInput(value: unknown): Result<RareAccountProfilePatch> {
  const result = profilePatchSchema.safeParse(value);
  return result.success ? { ok: true, value: result.data } : { ok: false, message: 'Profile input contains unsupported fields or non-string values.' };
}

export type ProfileUpdateOptions = {
  stdin?: boolean; file?: string; username?: string; email?: string; fullName?: string; bio?: string;
  avatar?: string; website?: string; twitter?: string; discord?: string; instagram?: string; youtube?: string;
  masthead?: string; clearAvatar?: boolean; clearMasthead?: boolean;
};
type ProfileInputPlan = { source: 'stdin' } | { source: 'file'; path: string } | { source: 'flags'; patch: RareAccountProfilePatch };

export function planProfileUpdate(options: ProfileUpdateOptions): Result<ProfileInputPlan> {
  const fields: [string, string | undefined][] = [
    ['fullName', options.fullName], ['bio', options.bio], ['website', options.website],
    ['twitterlink', options.twitter], ['discordlink', options.discord], ['instagramlink', options.instagram],
    ['youtubelink', options.youtube],
    ['avatar', options.clearAvatar === true ? '' : options.avatar],
    ['masthead_universal_token_id', options.clearMasthead === true ? '' : options.masthead],
  ];
  const profile: Record<string, string | undefined> = Object.fromEntries(fields.filter(([, value]) => value !== undefined));
  const hasFlags = options.username !== undefined || options.email !== undefined || Object.keys(profile).length > 0;
  if ([options.stdin === true, options.file !== undefined, hasFlags].filter(Boolean).length !== 1) {
    return { ok: false, message: 'Choose profile flags, --stdin, or --file; do not combine input sources.' };
  }
  if ((options.avatar !== undefined && options.clearAvatar === true) || (options.masthead !== undefined && options.clearMasthead === true)) {
    return { ok: false, message: 'Do not combine a field value with its clear flag.' };
  }
  if (options.stdin === true) return { ok: true, value: { source: 'stdin' } };
  if (options.file !== undefined) return { ok: true, value: { source: 'file', path: options.file } };
  const parsed = parseProfileInput({
    ...(options.username !== undefined ? { username: options.username } : {}),
    ...(options.email !== undefined ? { email: options.email } : {}),
    ...(Object.keys(profile).length > 0 ? { profile } : {}),
  });
  return parsed.ok ? { ok: true, value: { source: 'flags', patch: parsed.value } } : parsed;
}
