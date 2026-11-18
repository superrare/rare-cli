import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { Command } from 'commander';
import { accountClient, accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { output } from '../output.js';
import { parseProfileInput, planProfileUpdate, type ProfileUpdateOptions } from './auth-core.js';

export function profileCommand(): Command {
  const profile = new Command('profile').description('Read or update the authenticated account profile');
  profile.addCommand(accountCommand('get').action(async (opts: AccountCommandOptions): Promise<void> => {
    const result = await accountClient(storageOptions(opts)).profile.get();
    output(result, () => { console.log(JSON.stringify(result, null, 2)); });
  }));
  profile.addCommand(accountCommand('update').description('Update supplied profile fields; omitted fields are unchanged')
    .option('--stdin', 'read one JSON profile patch from standard input')
    .option('--file <path>', 'read a JSON profile patch from a file')
    .option('--username <value>', 'username')
    .option('--email <value>', 'private account email')
    .option('--full-name <value>', 'display name')
    .option('--bio <value>', 'biography (up to 180 characters)')
    .option('--avatar <url>', 'avatar URL')
    .option('--website <url>', 'website URL')
    .option('--twitter <url>', 'Twitter/X URL')
    .option('--discord <url>', 'Discord URL')
    .option('--instagram <url>', 'Instagram URL')
    .option('--youtube <url>', 'YouTube URL')
    .option('--masthead <universal-id>', 'pinned artwork universal token ID')
    .option('--clear-avatar', 'remove the avatar')
    .option('--clear-masthead', 'unpin the masthead artwork')
    .action(async (opts: AccountCommandOptions & ProfileUpdateOptions): Promise<void> => {
      const plan = planProfileUpdate(opts);
      if (!plan.ok) throw new Error(plan.message);
      const config = storageOptions(opts);
      const value: unknown = plan.value.source === 'flags' ? plan.value.patch
        : plan.value.source === 'stdin' ? await readProfileInput()
          : parseProfileJson(await readFile(plan.value.path, 'utf8'));
      const patch = parseProfileInput(value);
      if (!patch.ok) throw new Error(patch.message);
      const result = await accountClient(config).profile.update(patch.value);
      output(result, () => { console.log(JSON.stringify(result, null, 2)); });
    }));
  const avatar = new Command('avatar').description('Manage your profile avatar');
  avatar.addCommand(accountCommand('upload').requiredOption('--file <path>', 'image file to upload')
    .action(async (opts: AccountCommandOptions & { file: string }): Promise<void> => {
      const result = await accountClient(storageOptions(opts)).profile.uploadAvatar(await readFile(opts.file), basename(opts.file));
      output(result, () => { console.log(JSON.stringify(result, null, 2)); });
    }));
  profile.addCommand(avatar);
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
  return parseProfileJson(Buffer.concat(chunks).toString('utf8'));
}

function parseProfileJson(value: string): unknown {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed;
  } catch { throw new Error('Profile input must be valid JSON.'); }
}
