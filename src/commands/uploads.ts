import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { Command, Option } from 'commander';
import { accountClient, accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { output } from '../output.js';
import { resolveUploadContentType } from './upload-input-core.js';

export function uploadsCommand(): Command {
  const command = new Command('uploads').description('Upload application files to shared storage');
  command.addCommand(accountCommand('upload').argument('<file>')
    .addOption(new Option('--access <access>', 'public URL or private feature attachment').choices(['public', 'private']).default('public'))
    .option('--content-type <type>', 'override file content type; PNG and JPEG are inferred from the extension')
    .action(async (file: string, options: AccountCommandOptions & { access: 'public' | 'private'; contentType?: string }): Promise<void> => {
      const result = await accountClient(storageOptions(options)).upload(await readFile(file), basename(file), {
        access: options.access, contentType: resolveUploadContentType(file, options.contentType),
      });
      output(result, () => { console.log(JSON.stringify(result, null, 2)); });
    }));
  return command;
}
