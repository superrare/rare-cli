import { describe, expect, it } from 'vitest';
import { parseProfileInput, planProfileUpdate } from '../../src/commands/auth-core.js';

describe('profile input planning', () => {
  it('maps friendly flags to existing profile fields without supplying omitted values', () => {
    expect(planProfileUpdate({ bio: 'hackin', twitter: 'https://x.com/name', email: 'me@example.com' })).toEqual({
      ok: true, value: { source: 'flags', patch: { email: 'me@example.com', profile: { bio: 'hackin', twitterlink: 'https://x.com/name' } } },
    });
    expect(planProfileUpdate({ clearAvatar: true, clearMasthead: true })).toEqual({
      ok: true, value: { source: 'flags', patch: { profile: { avatar: '', masthead_universal_token_id: '' } } },
    });
  });

  it('rejects conflicting sources and ambiguous set/clear operations', () => {
    for (const options of [
      {}, { stdin: true, bio: 'x' }, { stdin: true, file: 'patch.json' },
      { file: 'patch.json', email: 'me@example.com' }, { avatar: '', clearAvatar: true }, { masthead: '1', clearMasthead: true },
    ]) expect(planProfileUpdate(options).ok).toBe(false);
    expect(planProfileUpdate({ stdin: true })).toEqual({ ok: true, value: { source: 'stdin' } });
    expect(planProfileUpdate({ file: 'patch.json' })).toEqual({ ok: true, value: { source: 'file', path: 'patch.json' } });
  });

  it('rejects arbitrary account targeting and non-string values at the JSON boundary', () => {
    expect(parseProfileInput({ accountId: 'someone-else', profile: { bio: 'x' } }).ok).toBe(false);
    expect(parseProfileInput({ profile: { bio: null } }).ok).toBe(false);
    expect(parseProfileInput({ profile: { owner: 'someone-else' } }).ok).toBe(false);
  });
});
