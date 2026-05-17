import { describe, expect, it } from 'vitest';
import { isLiveE2EArg } from '../../vitest.config.js';

describe('live E2E argv detection', () => {
  it('detects POSIX and Windows-style live E2E paths', () => {
    expect(isLiveE2EArg('test/e2e-live/foo.test.ts')).toBe(true);
    expect(isLiveE2EArg('test\\e2e-live\\foo.test.ts')).toBe(true);
  });

  it('ignores non-live E2E paths', () => {
    expect(isLiveE2EArg('test/e2e/foo.test.ts')).toBe(false);
    expect(isLiveE2EArg('test\\e2e\\foo.test.ts')).toBe(false);
  });
});
