import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseJsonStdout, runCli } from '../helpers/cli.js';
import { cleanupLiveFixture, createCartLiveFixture, jsonCommand } from './helpers/live-harness.js';
import { downloadTestImage } from './helpers/test-image.js';

type PrintPreview = {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: { url: string; widthPx: number; heightPx: number };
};

describe('owned print files and provider previews through the built CLI', () => {
  it('uploads a private master, validates it, and retrieves a useful completed preview', async () => {
    const fixture = await createCartLiveFixture();
    try {
      const image = join(fixture.tempDir, 'preview-master.jpg');
      await writeFile(image, await downloadTestImage({ width: 2400, height: 3600 }));
      const master = await jsonCommand<{ access: string; key: string; url?: string }>(fixture.sellerHome,
        ['uploads', 'upload', image, '--access', 'private', '--content-type', 'image/jpeg']);
      expect(master.access).toBe('private');
      expect(master.url).toBeUndefined();
      const options = ['--production-upload-key', master.key, '--specification-id', 'GLOBAL-FAP-8X12'];
      const validation = await readyFileCommand<{ valid: boolean; status: string; issues: { code: string; severity: string; message: string }[] }>(fixture.sellerHome,
        ['prints', 'files', 'validate', ...options]);
      expect(validation.valid).toBe(true);
      expect(['valid', 'warning']).toContain(validation.status);
      expect(validation.issues.every(issue => issue.severity === 'warning')).toBe(true);
      const created = await readyFileCommand<PrintPreview>(fixture.sellerHome, ['prints', 'mockups', 'create', ...options]);
      expect(created.id).toMatch(/^[0-9a-f-]{36}$/u);
      const deadline = Date.now() + 120_000;
      let preview = created;
      while (preview.status === 'pending' || preview.status === 'processing') {
        if (Date.now() >= deadline) throw new Error(`Print preview ${preview.id} did not complete within two minutes.`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        preview = await jsonCommand<PrintPreview>(fixture.sellerHome, ['prints', 'mockups', 'get', '--id', preview.id]);
      }
      expect(preview.status).toBe('completed');
      const result = preview.result;
      if (result === undefined) throw new Error('Completed preview returned no image.');
      expect(result.widthPx).toBeGreaterThan(0);
      expect(result.heightPx).toBeGreaterThan(0);
      expect(new URL(result.url).protocol).toBe('https:');
      const response = await fetch(result.url, { signal: AbortSignal.timeout(30_000) });
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toMatch(/^image\//u);
      expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(100);
    } finally {
      await cleanupLiveFixture(fixture);
    }
  }, 420_000);
});

/** Retry only the API's explicit processing/creation lease response, never other conflicts or provider failures. */
async function readyFileCommand<T>(home: string, args: string[]): Promise<T> {
  const deadline = Date.now() + 120_000;
  while (true) {
    const result = await runCli(['--json', ...args], { home, timeoutMs: 60_000, env: {
      RARE_API_URL: process.env.RARE_API_BASE_URL,
      RARE_AUTH_STORAGE: 'file',
      RARE_AUTH_DIRECTORY: join(home, 'auth'),
    } });
    if (result.code === 0) return parseJsonStdout<T>(result);
    const error = parseError(result.stderr);
    const retry = z.object({ status: z.literal(409), code: z.literal('idempotency_in_progress') }).safeParse(error);
    if (!retry.success || Date.now() >= deadline) return parseJsonStdout<T>(result);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}

function parseError(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}
