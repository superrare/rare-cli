import { createServer } from 'node:http';
import { text } from 'node:stream/consumers';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAuthStore } from '../../src/auth-storage.js';
import { parseJsonStdout, runCli, withTempHome } from '../helpers/cli.js';

describe('built print and shipping CLI', () => {
  it('exposes creator print, private upload and address-book commands', async () => {
    await withTempHome(async home => {
      for (const path of [
        ['prints', 'products', 'list'], ['prints', 'products', 'get'], ['prints', 'get'], ['prints', 'activity'], ['prints', 'releases'],
        ['prints', 'drops', 'create'], ['prints', 'drops', 'list'], ['prints', 'drops', 'get'],
        ['prints', 'drops', 'archive'], ['prints', 'drops', 'configure'], ['prints', 'drops', 'update'],
        ['prints', 'listing', 'prepare'], ['prints', 'listing', 'publish'],
        ['shipping', 'list'], ['shipping', 'save'], ['shipping', 'delete'], ['uploads', 'upload'], ['cart', 'card'],
        ['cart', 'orders', 'list'], ['cart', 'orders', 'get'],
      ]) {
        const result = await runCli([...path, '--help'], { home });
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('--api-url');
        expect(result.stdout).toContain('--storage');
      }
      expect((await runCli(['orders', 'list'], { home })).code).not.toBe(0);
      const upload = await runCli(['uploads', 'upload', '--help'], { home });
      expect(upload.stdout).toContain('default: "public"');
    });
  });

  it('lists and gets public products in human and JSON output without signing in', async () => {
    const product = { id: 'GLOBAL-FAP-8X12', description: 'Enhanced matte art print', paper: 'Enhanced matte art paper · 200gsm',
      size: '8 × 12 in', widthInches: 8, heightInches: 12, sizeCategory: 'small', format: 'rectangular', automaticOrientation: true,
      printAreas: [{ name: 'default', required: true, recommendedWidthPixels: 2400, recommendedHeightPixels: 3600 }],
      fileRequirements: { acceptedContentTypes: ['image/jpeg', 'image/png'], maximumBytes: 250 * 1024 * 1024 } };
    const requests: { path?: string; authorization?: string }[] = [];
    const server = createServer((request, response) => {
      // eslint-disable-next-line functional/immutable-data -- Record real built CLI HTTP requests.
      requests.push({ path: request.url, authorization: request.headers.authorization });
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/v1/prints/products') response.end(JSON.stringify({ data: [product] }));
      else if (request.url === `/v1/prints/products/${product.id}`) response.end(JSON.stringify({ data: product }));
      else { response.writeHead(404); response.end(JSON.stringify({ error: 'not_found', message: 'Unsupported print product' })); }
    });
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Missing fixture address');
    try {
      await withTempHome(async home => {
        const options = ['--api-url', `http://127.0.0.1:${address.port}`, '--chain', 'sepolia'];
        for (const command of [['list'], ['get', '--id', product.id]]) {
          const args = ['prints', 'products', ...command, ...options];
          const human = await runCli(args, { home });
          expect(human.code).toBe(0);
          expect(human.stdout).toContain('Paper: Enhanced matte art paper');
          expect(human.stdout).toContain('Recommended width pixels: 2400');
          expect(human.stdout).toContain('Maximum bytes: 262144000');
          expect(human.stdout).not.toContain('"paper"');
          expect(parseJsonStdout(await runCli(['--json', ...args], { home }))).toEqual(command[0] === 'list' ? [product] : product);
        }
        const missing = await runCli(['--json', 'prints', 'products', 'get', '--id', 'unsupported', ...options], { home });
        expect(missing.code).toBe(1);
        expect(missing.stderr).toContain('404');
        const old = await runCli(['prints', 'specifications'], { home });
        expect(old.code).not.toBe(0);
        expect(requests.map(request => request.path)).toEqual([
          '/v1/prints/products', '/v1/prints/products', `/v1/prints/products/${product.id}`, `/v1/prints/products/${product.id}`, '/v1/prints/products/unsupported',
        ]);
        expect(requests.every(request => request.authorization === undefined)).toBe(true);
      });
    } finally { await new Promise<void>((resolve, reject) => { server.close(error => { if (error) reject(error); else resolve(); }); }); }
  });

  it('configures a print through the scalar operation object without changing its HTTP body', async () => {
    const dropId = '00000000-0000-4000-8000-000000000001';
    const received: { path?: string; authorization?: string; body: unknown }[] = [];
    const server = createServer((request, response) => {
      void text(request).then(body => {
        // eslint-disable-next-line functional/immutable-data -- Capture real HTTP input for the built-command assertion.
        received.push({ path: request.url, authorization: request.headers.authorization, body: JSON.parse(body) });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ data: { id: 'configured-option' } }));
      });
    });
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Missing fixture address');
    try {
      await withTempHome(async temporary => {
        const home = await realpath(temporary);
        const apiBaseUrl = `http://127.0.0.1:${address.port}`;
        const directory = join(home, 'auth');
        const scope = { apiBaseUrl, authBaseUrl: `${apiBaseUrl}/auth/v2`, clientId: 'rare-sdk' };
        const store = createAuthStore({ ...scope, backend: 'file', directory });
        await store.withLock(async () => { await store.set({ ...scope, revision: 'print-options-session',
          accessToken: 'print-options-access', refreshToken: 'print-options-refresh',
          expiresAt: Date.now() + 300000, scope: 'rare:account offline_access' }); });
        const result = await runCli(['--json', 'prints', 'drops', 'configure', '--id', dropId, '--price-usd-cents', '2500',
          '--chain', 'sepolia', '--api-url', apiBaseUrl, '--storage', 'file', '--auth-directory', directory], { home });
        expect(parseJsonStdout(result)).toEqual({ id: 'configured-option' });
        expect(received).toEqual([{ path: `/v1/prints/drops/${dropId}/options/standard`, authorization: 'Bearer print-options-access', body: { displayPriceUsdCents: '2500' } }]);
      });
    } finally { await new Promise<void>((resolve, reject) => { server.close(error => { if (error) reject(error); else resolve(); }); }); }
  });

  it('passes an authenticated replacement master update through the built CLI', async () => {
    const dropId = '00000000-0000-4000-8000-000000000001';
    const replacementKey = 'b'.repeat(64);
    const received: { method?: string; path?: string; authorization?: string; body: unknown }[] = [];
    const server = createServer((request, response) => {
      void text(request).then(body => {
        // eslint-disable-next-line functional/immutable-data -- Record actual HTTP input for the built-command contract.
        received.push({ method: request.method, path: request.url, authorization: request.headers.authorization, body: JSON.parse(body) });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ data: { id: dropId, status: 'PUBLISHED', metadata: { productionUploadKey: replacementKey } } }));
      });
    });
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Missing fixture address');
    try {
      await withTempHome(async temporary => {
        const home = await realpath(temporary);
        const apiBaseUrl = `http://127.0.0.1:${address.port}`;
        const directory = join(home, 'auth');
        const scope = { apiBaseUrl, authBaseUrl: `${apiBaseUrl}/auth/v2`, clientId: 'rare-sdk' };
        const store = createAuthStore({ ...scope, backend: 'file', directory });
        await store.withLock(async () => { await store.set({ ...scope, revision: 'replace-master-session', accessToken: 'replace-master-access',
          refreshToken: 'replace-master-refresh', expiresAt: Date.now() + 300000, scope: 'rare:account offline_access' }); });
        const patch = join(home, 'replacement.json');
        await writeFile(patch, JSON.stringify({ productionUploadKey: replacementKey }));
        const result = await runCli(['--json', 'prints', 'drops', 'update', '--id', dropId, '--input', patch,
          '--chain', 'sepolia', '--api-url', apiBaseUrl, '--storage', 'file', '--auth-directory', directory], { home });
        expect(parseJsonStdout(result)).toEqual({ id: dropId, status: 'PUBLISHED', metadata: { productionUploadKey: replacementKey } });
        expect(received).toEqual([{ method: 'PATCH', path: `/v1/prints/drops/${dropId}`, authorization: 'Bearer replace-master-access', body: { productionUploadKey: replacementKey } }]);
      });
    } finally { await new Promise<void>((resolve, reject) => { server.close(error => { if (error) reject(error); else resolve(); }); }); }
  });

  it('rejects public production URLs and malformed shipping input before authentication', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rare-print-input-'));
    try {
      const draft = join(directory, 'draft.json');
      await writeFile(draft, JSON.stringify({ name: 'Invalid draft', print: { productionImageUri: 'https://example.com/master.png' } }));
      const result = await runCli(['--json', 'prints', 'drops', 'create', '--input', draft]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('productionUploadKey');
      const address = join(directory, 'address.json');
      await writeFile(address, JSON.stringify({ details: { email: 'invalid' } }));
      const shipping = await runCli(['--json', 'shipping', 'save', '--input', address]);
      expect(shipping.code).toBe(1);
      expect(shipping.stderr).toContain('email');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects NFT-only print creation before authentication', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rare-print-legacy-'));
    try {
      const file = join(directory, 'draft.json');
      await writeFile(file, JSON.stringify({ idempotencyKey: '00000000-0000-4000-8000-000000000001',
        name: 'Retired NFT-only draft', universalTokenId: `11155111-0x${'1'.repeat(40)}-1` }));
      const result = await runCli(['--json', 'prints', 'drops', 'create', '--input', file]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('chainId');
      expect(result.stderr).toContain('print');
      expect(result.stderr).toContain('universalTokenId');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('requires explicit consent before signing and publishing a Listing', async () => {
    const result = await runCli(['--json', 'prints', 'listing', 'publish', '--input', 'unused.json'], {
      env: { RARE_SKIP_CONFIRMATION: '0' },
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('requires --yes');
    const consent = await runCli(['--json', 'prints', 'listing', 'publish', '--input', 'unused.json', '--yes'], {
      env: { RARE_SKIP_CONFIRMATION: '0' },
    });
    expect(consent.code).toBe(1);
    expect(consent.stderr).toContain('ENOENT');
    expect(consent.stderr).not.toContain('requires --yes');
  });

  it('rejects conflicting shipping sources before any quote request', async () => {
    const result = await runCli(['--json', 'cart', 'checkout', '--listing', `0x${'1'.repeat(64)}`,
      '--payment-currency', 'usdc', '--shipping-input', 'unused.json',
      '--saved-address-id', '00000000-0000-4000-8000-000000000001', '--preview']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('not both');
  });

  it('rejects invalid print quantity limits and eligibility rules before authentication', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rare-print-policy-'));
    try {
      const file = join(directory, 'listing.json');
      const terms = {
        optionId: '00000000-0000-4000-8000-000000000001', seller: `0x${'1'.repeat(40)}`,
        listingSalt: `0x${'2'.repeat(64)}`, deadline: '2000000000', availableQuantity: '10', fulfillmentKind: 1,
      };
      for (const maxQuantityPerCheckout of ['0', '1001', '01', '-1', '1.5']) {
        await writeFile(file, JSON.stringify({ ...terms, maxQuantityPerCheckout }));
        const result = await runCli(['--json', 'prints', 'listing', 'prepare', '--input', file]);
        expect(result.code).toBe(1);
        expect(result.stderr).toContain('maxQuantityPerCheckout');
      }
      await writeFile(file, JSON.stringify({ ...terms, eligibilityRuleId: 'invalid-rule' }));
      const result = await runCli(['--json', 'prints', 'listing', 'prepare', '--input', file]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('eligibilityRuleId');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
