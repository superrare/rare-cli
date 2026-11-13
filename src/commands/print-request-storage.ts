import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, realpath, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { PrintRecoveryStore } from '@rareprotocol/rare-sdk';

export async function savePrintRequest<Input, Request>(
  inputPath: string,
  operation: string,
  input: Input,
  resolveRequest: (input: Input) => Request,
  parseRequest: (value: unknown) => Request,
): Promise<Request> {
  const path = await realpath(inputPath);
  const digest = createHash('sha256').update(JSON.stringify([basename(path), operation, input])).digest('hex');
  const directory = join(dirname(path), '.rare-print-requests');
  const saved = join(directory, `${operation}-${digest}.json`);
  const readSaved = async (): Promise<Request> => {
    const value: unknown = JSON.parse(await readFile(saved, 'utf8'));
    return parseRequest(value);
  };
  try {
    return await readSaved();
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }

  const request = resolveRequest(input);
  if (JSON.stringify(input) === JSON.stringify(request)) return request;

  await writeCheckpoint(directory, saved, JSON.stringify(request));
  return await readSaved();
}

export function printRecoveryStore(directory: string, scope: string): PrintRecoveryStore {
  const pathFor = (key: string): string =>
    join(directory, `recovery-${createHash('sha256').update(JSON.stringify([scope, key])).digest('hex')}.json`);
  const read = async (key: string): Promise<string | undefined> => {
    try {
      return await readFile(pathFor(key), 'utf8');
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
      throw error;
    }
  };
  return {
    read,
    async save(key, value): Promise<void> {
      await writeCheckpoint(directory, pathFor(key), value);
      if (await read(key) !== value)
        throw new Error('Another invocation saved this print operation. Rerun the command to resume it.');
    },
  };
}

async function writeCheckpoint(directory: string, saved: string, value: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `${randomUUID()}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  try {
    try {
      await handle.writeFile(value, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    // Publish the complete request once so concurrent invocations reuse its identifiers.
    try {
      await link(temporary, saved);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    }
    const directoryHandle = await open(directory, 'r');
    try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
  } finally {
    await rm(temporary, { force: true });
  }
}
