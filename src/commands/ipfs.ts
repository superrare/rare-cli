import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { text } from 'node:stream/consumers';
import { Command } from 'commander';
import { createRareApi, type IpfsUploadResult } from '../sdk/api.js';
import { output, log, isJsonMode } from '../output.js';

type IpfsPinFileOptions = {
  file: string;
  filename?: string;
  uriOnly?: boolean;
};

type IpfsPinJsonOptions = {
  data?: string;
  stdin?: boolean;
  filename?: string;
  uriOnly?: boolean;
};

export function ipfsCommand(): Command {
  const cmd = new Command('ipfs');
  cmd.description('IPFS upload and pinning utilities');

  cmd.addCommand(pinFileCommand());
  cmd.addCommand(pinJsonCommand());

  return cmd;
}

function pinFileCommand(): Command {
  return new Command('pin-file')
    .description('Upload and pin an arbitrary file to IPFS')
    .requiredOption('--file <path>', 'file to upload and pin')
    .option('--filename <name>', 'stored filename (defaults to the local basename)')
    .option('--uri-only', 'print only the ipfs:// URI')
    .action(async (opts: IpfsPinFileOptions): Promise<void> => {
      assertUriOnlyOutputMode('rare ipfs pin-file', opts.uriOnly);

      const buffer = await readPinFile(opts.file);
      const filename = opts.filename ?? basename(opts.file);
      logUpload(opts.uriOnly, `Uploading file: ${filename} (${buffer.byteLength.toString()} bytes)`);

      printPinResult(await createRareApi().pinFile(new Uint8Array(buffer), filename), opts.uriOnly);
    });
}

function pinJsonCommand(): Command {
  return new Command('pin-json')
    .description('Upload and pin JSON to IPFS')
    .option('--data <json>', 'inline JSON string to upload and pin')
    .option('--stdin', 'read JSON from stdin')
    .option('--filename <name>', 'stored filename', 'metadata.json')
    .option('--uri-only', 'print only the ipfs:// URI')
    .action(async (opts: IpfsPinJsonOptions): Promise<void> => {
      assertUriOnlyOutputMode('rare ipfs pin-json', opts.uriOnly);

      const source = await readJsonSource(opts);
      const value = parseJson(source.input, source.label);
      logUpload(opts.uriOnly, `Uploading JSON: ${opts.filename ?? 'metadata.json'} (${source.input.length.toString()} chars)`);

      printPinResult(await createRareApi().pinJson(value, opts.filename), opts.uriOnly);
    });
}

function assertUriOnlyOutputMode(command: string, uriOnly?: boolean): void {
  if (uriOnly === true && isJsonMode()) {
    throw new Error(`${command} --uri-only cannot be combined with --json.`);
  }
}

function logUpload(uriOnly: boolean | undefined, message: string): void {
  if (uriOnly !== true) {
    log(message);
  }
}

function printPinResult(result: IpfsUploadResult, uriOnly?: boolean): void {
  if (uriOnly === true) {
    console.log(result.ipfsUrl);
    return;
  }

  output(result, () => {
    console.log('\nPinned to IPFS.');
    console.log(`  CID:      ${result.cid}`);
    console.log(`  IPFS:     ${result.ipfsUrl}`);
    console.log(`  Gateway:  ${result.gatewayUrl}`);
  });
}

async function readPinFile(path: string): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch (error) {
    throw new Error(`Could not read IPFS upload file: ${path}`, { cause: error });
  }
}

async function readJsonSource(opts: IpfsPinJsonOptions): Promise<{ input: string; label: string }> {
  const sources = [
    opts.data === undefined ? undefined : 'data',
    opts.stdin === true ? 'stdin' : undefined,
  ].filter((source): source is string => source !== undefined);

  if (sources.length !== 1) {
    throw new Error('rare ipfs pin-json requires exactly one of --data or --stdin.');
  }

  if (opts.data !== undefined) {
    return { input: opts.data, label: '--data' };
  }

  return { input: await text(process.stdin), label: 'stdin' };
}

function parseJson(input: string, label: string): unknown {
  try {
    return JSON.parse(input) as unknown;
  } catch (error) {
    throw new Error(`Could not parse IPFS JSON from ${label}.`, { cause: error });
  }
}
