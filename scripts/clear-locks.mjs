import { readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const lockPatterns = [
  /^rare-cli-live-e2e-(?:wallet-\d+-)?0x[0-9a-fA-F]+\.lock$/u,
];

export async function clearRareCliLocks({ tempDir = tmpdir(), logger = console } = {}) {
  const entries = await readdir(tempDir, { withFileTypes: true });
  const lockEntries = entries.filter((entry) =>
    entry.isDirectory() && lockPatterns.some((pattern) => pattern.test(entry.name)),
  );

  await Promise.all(lockEntries.map((entry) => rm(join(tempDir, entry.name), { recursive: true, force: true })));

  if (lockEntries.length === 0) {
    logger.log('No rare-cli locks found.');
  } else {
    logger.log(`Cleared ${lockEntries.length} rare-cli lock${lockEntries.length === 1 ? '' : 's'}.`);
  }

  return lockEntries.length;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await clearRareCliLocks();
}
