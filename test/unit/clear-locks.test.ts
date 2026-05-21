import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import { clearRareCliLocks } from '../../scripts/clear-locks.mjs';

describe('clearRareCliLocks', () => {
  it('removes lowercase and checksummed rare-cli lock directories only', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'rare-cli-clear-locks-test-'));
    const logger = { log: () => undefined };

    try {
      await mkdir(join(tempDir, 'rare-cli-live-e2e-0xabc123.lock'));
      await mkdir(join(tempDir, 'rare-cli-live-e2e-0xDeF456.lock'));
      await mkdir(join(tempDir, 'rare-cli-live-e2e-wallet-11155111-0xA1b2C3.lock'));
      await mkdir(join(tempDir, 'rare-cli-live-e2e-home-abc123'));
      await writeFile(join(tempDir, 'rare-cli-live-e2e-0x789abc.lock'), '');

      const clearedCount = await clearRareCliLocks({ tempDir, logger });

      assert.equal(clearedCount, 3);
      await assert.rejects(stat(join(tempDir, 'rare-cli-live-e2e-0xabc123.lock')));
      await assert.rejects(stat(join(tempDir, 'rare-cli-live-e2e-0xDeF456.lock')));
      await assert.rejects(stat(join(tempDir, 'rare-cli-live-e2e-wallet-11155111-0xA1b2C3.lock')));
      await assert.doesNotReject(stat(join(tempDir, 'rare-cli-live-e2e-home-abc123')));
      await assert.doesNotReject(stat(join(tempDir, 'rare-cli-live-e2e-0x789abc.lock')));
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
