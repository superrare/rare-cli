import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { Command, Option } from 'commander';
import { accountClient, accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { output } from '../output.js';

export function uploadsCommand(): Command {
  const command = new Command('uploads').description('Upload application files to shared storage');
  command.addCommand(accountCommand('upload').argument('<file>')
    .addOption(new Option('--access <access>', 'public URL or private feature attachment').choices(['public', 'private']).default('public'))
    .option('--content-type <type>', 'MIME type, defaults to application/octet-stream')
    .action(async (file: string, options: AccountCommandOptions & { access: 'public' | 'private'; contentType?: string }): Promise<void> => {
      const result = await accountClient(storageOptions(options)).uploads.upload(await readFile(file), basename(file), { access: options.access, contentType: options.contentType });
      output(result, () => { console.log(JSON.stringify(result, null, 2)); });
    }));
  return command;
}
