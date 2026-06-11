import { describe, expect, it } from 'vitest';
import config, { isLiveE2EArg, shouldRunLiveE2E, shouldUseFileParallelism } from '../../vitest.config.js';

describe('live E2E argv detection', () => {
  it('detects POSIX and Windows-style live E2E paths', () => {
    expect(isLiveE2EArg('test/e2e-live/foo.test.ts')).toBe(true);
    expect(isLiveE2EArg('test\\e2e-live\\foo.test.ts')).toBe(true);
  });

  it('ignores non-live E2E paths', () => {
    expect(isLiveE2EArg('test/e2e/foo.test.ts')).toBe(false);
    expect(isLiveE2EArg('test\\e2e\\foo.test.ts')).toBe(false);
  });

  it('derives live E2E mode from argv', () => {
    expect(shouldRunLiveE2E(['vitest', 'test/e2e-live/foo.test.ts'])).toBe(true);
    expect(shouldRunLiveE2E(['vitest', 'test/e2e/foo.test.ts'])).toBe(false);
  });

  it('disables file parallelism for live E2E runs only', () => {
    expect(shouldUseFileParallelism(['vitest', 'test/e2e-live/foo.test.ts'])).toBe(false);
    expect(shouldUseFileParallelism(['vitest', 'test/e2e/foo.test.ts'])).toBe(true);
  });

  it('keeps regular test files parallel by default', () => {
    expect(config.test?.fileParallelism).toBe(true);
  });
});
