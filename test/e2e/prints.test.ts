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
        ['prints', 'files', 'validate'], ['prints', 'mockups', 'create'], ['prints', 'mockups', 'get'],
        ['prints', 'quote'], ['prints', 'products', 'list'], ['prints', 'products', 'get'], ['prints', 'get'], ['prints', 'activity'], ['prints', 'releases'],
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

  it('reuses generated draft keys and listing salts after a failed request', async () => {
    const received = new Map<string, unknown[]>();
    const server = createServer((request, response) => {
      void text(request).then(body => {
        const path = request.url ?? '';
        const requests = [...(received.get(path) ?? []), JSON.parse(body)];
        // eslint-disable-next-line functional/immutable-data -- Record requests from separate CLI processes.
        received.set(path, requests);
        response.writeHead(requests.length <= 2 ? 503 : 201, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(requests.length <= 2 ? { message: 'Unavailable' } : { data: { id: 'saved' } }));
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
        await store.withLock(async () => { await store.set({ ...scope, revision: 'print-retry-session',
          accessToken: 'print-retry-access', refreshToken: 'print-retry-refresh',
          expiresAt: Date.now() + 300000, scope: 'rare:account offline_access' }); });
        const draft = { chainId: '11155111', name: 'Print', print: { name: 'Print', description: '', tags: [],
          productionUploadKey: 'a'.repeat(64), specificationId: 'GLOBAL-FAP-8X12', images: ['https://example.com/preview.jpg'] } };
        const terms = { deadline: '1999999999', availableQuantity: '2' };
        const key = expect.stringMatching(/^[0-9a-f-]{36}$/u);
        const salt = expect.stringMatching(/^0x[0-9a-f]{64}$/u);
        const scenarios = [
          { command: ['drops', 'create'], path: '/v1/prints/drops', input: draft, generated: { idempotencyKey: key } },
          { command: ['listing', 'prepare'], path: '/v1/prints/listings/prepare',
            input: { ...terms, optionId: '00000000-0000-4000-8000-000000000001', seller: '0x1111111111111111111111111111111111111111' },
            generated: { listingSalt: salt } },
          { command: ['concierge', 'create'], path: '/v1/prints/concierge/drafts',
            input: { creatorUserId: '17', drop: draft, listing: terms, displayPriceUsdCents: '1000' },
            generated: { drop: { idempotencyKey: key }, listing: { listingSalt: salt } } },
        ];
        for (const scenario of scenarios) {
          const inputPath = join(home, `${scenario.command[0]}.json`);
          await writeFile(inputPath, JSON.stringify(scenario.input));
          const args = ['--json', 'prints', ...scenario.command, '--input', inputPath,
            '--chain', 'sepolia', '--api-url', apiBaseUrl, '--storage', 'file', '--auth-directory', directory];
          expect((await runCli(args, { home })).stderr).toContain('Rerun the same command with the same input file');
          expect(received.get(scenario.path)).toHaveLength(2);
          expect(parseJsonStdout(await runCli(args, { home }))).toEqual({ id: 'saved' });
          const [first, second, third] = received.get(scenario.path) ?? [];
          expect(first).toMatchObject(scenario.generated);
          expect(second).toEqual(first);
          expect(third).toEqual(first);
        }
      });
    } finally { await new Promise<void>((resolve, reject) => { server.close(error => { if (error) reject(error); else resolve(); }); }); }
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

  it('validates owned files and creates and reads preview jobs through authenticated SDK requests', async () => {
    const uploadKey = 'a'.repeat(64);
    const id = '00000000-0000-4000-8000-000000000001';
    const validation = { valid: true, status: 'warning', issues: [{ code: 'low_resolution', severity: 'warning', message: 'Low resolution' }] };
    const preview = { id, status: 'completed', result: { url: 'https://example.com/preview.jpg', widthPx: 800, heightPx: 1200 } };
    const received: { path?: string; method?: string; authorization?: string; body: unknown }[] = [];
    const server = createServer((request, response) => {
      void text(request).then(body => {
        // eslint-disable-next-line functional/immutable-data -- Observe actual requests from the built CLI.
        received.push({ path: request.url, method: request.method, authorization: request.headers.authorization, body: body === '' ? null : JSON.parse(body) });
        response.writeHead(request.method === 'POST' && request.url === '/v1/prints/mockups' ? 201 : 200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ data: request.url === '/v1/prints/files/validate' ? validation : preview }));
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
        await store.withLock(async () => { await store.set({ ...scope, revision: 'print-files-session', accessToken: 'print-files-access',
          refreshToken: 'print-files-refresh', expiresAt: Date.now() + 300000, scope: 'rare:account offline_access' }); });
        const options = ['--chain', 'sepolia', '--api-url', apiBaseUrl, '--storage', 'file', '--auth-directory', directory];
        const fileOptions = ['--production-upload-key', uploadKey, '--specification-id', 'GLOBAL-FAP-8X12'];
        expect(parseJsonStdout(await runCli(['--json', 'prints', 'files', 'validate', ...fileOptions, ...options], { home }))).toEqual(validation);
        expect(parseJsonStdout(await runCli(['--json', 'prints', 'mockups', 'create', ...fileOptions, ...options], { home }))).toEqual(preview);
        const human = await runCli(['prints', 'mockups', 'get', '--id', id, ...options], { home });
        expect(human.code).toBe(0);
        expect(human.stdout).toContain('Status: completed');
        expect(human.stdout).toContain('Url: https://example.com/preview.jpg');
        expect(human.stdout).not.toContain('"result"');
        expect(received).toEqual([
          { path: '/v1/prints/files/validate', method: 'POST', authorization: 'Bearer print-files-access', body: { productionUploadKey: uploadKey, specificationId: 'GLOBAL-FAP-8X12' } },
          { path: '/v1/prints/mockups', method: 'POST', authorization: 'Bearer print-files-access', body: { productionUploadKey: uploadKey, specificationId: 'GLOBAL-FAP-8X12' } },
          { path: `/v1/prints/mockups/${id}`, method: 'GET', authorization: 'Bearer print-files-access', body: null },
        ]);
        const malformed = await runCli(['--json', 'prints', 'files', 'validate', '--production-upload-key', 'https://example.com/master.jpg', '--specification-id', 'GLOBAL-FAP-8X12', ...options], { home });
        expect(malformed.code).toBe(1);
        expect(received).toHaveLength(3);
      });
    } finally { await new Promise<void>((resolve, reject) => { server.close(error => { if (error) reject(error); else resolve(); }); }); }
  });

  it('routes scalar and multiple print formats and read-only quotes through the official SDK', async () => {
    const dropId = '00000000-0000-4000-8000-000000000001';
    const received: { path?: string; authorization?: string; body: unknown }[] = [];
    const server = createServer((request, response) => {
      void text(request).then(body => {
        // eslint-disable-next-line functional/immutable-data -- Capture real HTTP input for the built-command assertion.
        received.push({ path: request.url, authorization: request.headers.authorization, body: JSON.parse(body) });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        const data = request.url === '/v1/prints/estimates'
          ? { currency: 'USD', productionCostUsdCents: '1200', shippingCostUsdCents: '500',
            quotedAt: '2026-11-01T12:00:00.000Z', expiresAt: '2026-11-01T12:05:00.000Z',
            assumptions: { specificationId: 'GLOBAL-FAP-8X12', destinationCountryCode: 'US', copies: 2, shippingMethod: 'Standard' },
            warnings: ['estimate_only'] }
          : request.url?.endsWith('/options')
            ? { options: [{ id: 'configured-option' }], listingOptionId: 'configured-option' }
            : { id: 'configured-option' };
        response.end(JSON.stringify({ data }));
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
        const largeDropId = '33333333-3333-4333-8333-333333333333';
        const large = await runCli(['--json', 'prints', 'drops', 'configure', '--id', largeDropId, '--price-usd-cents', '4000',
          '--chain', 'sepolia', '--api-url', apiBaseUrl, '--storage', 'file', '--auth-directory', directory], { home });
        expect(large.code).toBe(0);
        expect(received[1]).toEqual({ path: `/v1/prints/drops/${largeDropId}/options/standard`, authorization: 'Bearer print-options-access', body: { displayPriceUsdCents: '4000' } });
        const quoteInput = join(home, 'quote.json');
        await writeFile(quoteInput, JSON.stringify({ specificationId: 'GLOBAL-FAP-8X12', destinationCountryCode: 'US', copies: 2 }));
        const quote = await runCli(['--json', 'prints', 'quote', '--input', quoteInput, '--chain', 'sepolia',
          '--api-url', apiBaseUrl, '--storage', 'file', '--auth-directory', directory], { home });
        expect(parseJsonStdout(quote)).toMatchObject({ currency: 'USD', productionCostUsdCents: '1200', shippingCostUsdCents: '500' });
        expect(received[2]).toMatchObject({ path: '/v1/prints/estimates', authorization: 'Bearer print-options-access',
          body: { specificationId: 'GLOBAL-FAP-8X12', destinationCountryCode: 'US', copies: 2 } });

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

  it('forwards print format choices and mint unit associations with authenticated delivery checkout', async () => {
    let received: unknown;
    const server = createServer((request, response) => {
      void text(request).then(body => {
        received = { path: request.url, body: JSON.parse(body) };
        response.writeHead(409, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'fixture_capture', message: 'Checkout captured' }));
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
        await store.withLock(async () => { await store.set({ ...scope, revision: 'mint-print-session', accessToken: 'mint-print-access',
          refreshToken: 'mint-print-refresh', expiresAt: Date.now() + 300000, scope: 'rare:account offline_access' }); });
        const listingDigest = `0x${'1'.repeat(64)}`;
        const mintSelections = [{ preparationId: '00000000-0000-4000-8000-000000000001', listingDigest, unitIndexes: [0] }];
        const input = join(home, 'checkout.json');
        await writeFile(input, JSON.stringify({ items: [{ kind: 'listing', listingDigest, quantity: '1' }], mintSelections }));
        const savedAddressId = '00000000-0000-4000-8000-000000000002';
        const result = await runCli(['--json', 'cart', 'checkout', '--input', input, '--payment-currency', 'eth',
          '--recipient', `0x${'2'.repeat(40)}`, '--saved-address-id', savedAddressId, '--preview', '--chain', 'sepolia',
          '--api-url', apiBaseUrl, '--storage', 'file', '--auth-directory', directory], { home });
        expect(result.code).toBe(1);
        expect(result.stderr).toContain('fixture_capture');
        expect(received).toMatchObject({ body: { delivery: { savedAddressId, mintSelections } } });
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
