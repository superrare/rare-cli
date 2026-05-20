import { readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const lockPatterns = [
  /^rare-cli-live-e2e-(?:wallet-\d+-)?0x[0-9a-f]+\.lock$/u,
];

const tempDir = tmpdir();
const entries = await readdir(tempDir, { withFileTypes: true });
const lockEntries = entries.filter((entry) =>
  entry.isDirectory() && lockPatterns.some((pattern) => pattern.test(entry.name)),
);

await Promise.all(lockEntries.map((entry) => rm(join(tempDir, entry.name), { recursive: true, force: true })));

if (lockEntries.length === 0) {
  console.log('No rare-cli locks found.');
} else {
  console.log(`Cleared ${lockEntries.length} rare-cli lock${lockEntries.length === 1 ? '' : 's'}.`);
}
