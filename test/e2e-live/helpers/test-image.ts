import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/** Live fixtures only. Download once, then exercise the normal upload paths. */
export async function downloadTestImage({ seed = randomUUID(), width = 1200, height = 1600 }: {
  seed?: string;
  width?: number;
  height?: number;
} = {}): Promise<Buffer> {
  const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}.jpg`;
  const downloaded = await fetchPicsumImage(url);
  const bytes = downloaded ?? await readFile(new URL(`./fixtures/test-image-${width}x${height}.jpg`, import.meta.url));
  // A unique JPEG comment prevents content-addressed uploads from sharing fixtures.
  const comment = Buffer.from(randomUUID());
  const segment = Buffer.from([0xff, 0xfe, 0, comment.length + 2]);
  return Buffer.concat([bytes.subarray(0, -2), segment, comment, bytes.subarray(-2)]);
}

async function fetchPicsumImage(url: string): Promise<Buffer | undefined> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'image/jpeg') return undefined;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 4 || bytes.length > 10 * 1024 * 1024
      || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) return undefined;
    return bytes;
  } catch {
    return undefined;
  }
}
