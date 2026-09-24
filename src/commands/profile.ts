import { Command } from 'commander';
import { accountClient, accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { output } from '../output.js';
import { parseProfileInput } from './auth-core.js';

export function profileCommand(): Command {
  const profile = new Command('profile').description('Read or update the authenticated account profile');
  profile.addCommand(accountCommand('get').action(async (opts: AccountCommandOptions): Promise<void> => {
    const result = await accountClient(storageOptions(opts)).profile.get();
    output(result, () => { console.log(JSON.stringify(result, null, 2)); });
  }));
  profile.addCommand(accountCommand('update').description('Read a profile patch from stdin; null clears profile fields, omission preserves them')
    .requiredOption('--stdin', 'read one JSON profile patch from standard input')
    .action(async (opts: AccountCommandOptions): Promise<void> => {
      const config = storageOptions(opts);
      const value = await readProfileInput();
      const patch = parseProfileInput(value);
      if (!patch.ok) throw new Error(patch.message);
      const result = await accountClient(config).profile.update(patch.value);
      output(result, () => { console.log(JSON.stringify(result, null, 2)); });
    }));
  return profile;
}

async function readProfileInput(): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    const buffer: unknown = chunk;
    if (!Buffer.isBuffer(buffer)) throw new Error('Profile input must be UTF-8 JSON.');
    // This is an I/O accumulator; no domain state is mutated.
    // eslint-disable-next-line functional/immutable-data
    chunks.push(buffer);
    if (chunks.reduce((size, entry) => size + entry.length, 0) > 65536) throw new Error('Profile input exceeds 64 KiB.');
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed;
  } catch { throw new Error('Profile input must be valid JSON.'); }
}
