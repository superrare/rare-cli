import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { Command, Option } from 'commander';
import { accountClient, accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { output } from '../output.js';

export function uploadsCommand(): Command {
<<<<<<< HEAD
  const command = new Command('uploads').description('Upload application files to shared storage');
  command.addCommand(accountCommand('upload').argument('<file>')
    .addOption(new Option('--access <access>', 'public URL or private feature attachment').choices(['public', 'private']).default('public'))
    .option('--content-type <type>', 'MIME type, defaults to application/octet-stream')
    .action(async (file: string, options: AccountCommandOptions & { access: 'public' | 'private'; contentType?: string }): Promise<void> => {
      const result = await accountClient(storageOptions(options)).upload(await readFile(file), basename(file), { access: options.access, contentType: options.contentType });
=======
  const command = new Command('uploads').description('Upload public media or private production files');
  command.addCommand(accountCommand('upload')
    .requiredOption('--file <path>', 'file to upload')
    .addOption(new Option('--access <access>', 'public media or private production master').choices(['public', 'private']).default('private'))
    .option('--content-type <mime>', 'explicit file content type')
    .action(async (options: AccountCommandOptions & { file: string; access: 'private' | 'public'; contentType?: string }): Promise<void> => {
      const client = accountClient(storageOptions(options));
      const result = await client.uploads.upload(await readFile(options.file), basename(options.file), {
        access: options.access, ...(options.contentType === undefined ? {} : { contentType: options.contentType }),
      });
>>>>>>> 4b39a0b (Add SDK-backed print tooling and shipping commands)
      output(result, () => { console.log(JSON.stringify(result, null, 2)); });
    }));
  return command;
}
