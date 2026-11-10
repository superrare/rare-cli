import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, realpath, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

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

  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `${randomUUID()}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  try {
    try {
      await handle.writeFile(JSON.stringify(request), 'utf8');
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
    return await readSaved();
  } finally {
    await rm(temporary, { force: true });
  }
}
