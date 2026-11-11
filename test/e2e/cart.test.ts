import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { EventEmitter, once } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
import { describe, expect, it } from 'vitest';
import { getCartAddress } from '@rareprotocol/rare-sdk/contracts';
import { isAddress, zeroAddress } from 'viem';
import { parseJsonStdout, runCli, withTempHome } from '../helpers/cli.js';
import { createAuthStore } from '../../src/auth-storage.js';

const listingDigest = `0x${'22'.repeat(32)}`;
const listingSalt = `0x${'33'.repeat(32)}`;
const sku = `0x${'44'.repeat(32)}`;
const hash = `0x${'55'.repeat(32)}`;
const seller = '0x1111111111111111111111111111111111111111';
const recipient = '0x2222222222222222222222222222222222222222';
const token = '0x3333333333333333333333333333333333333333';
const attemptId = '9ce51055-73ea-4448-9d02-57637648cefd';
describe('built Cart CLI', () => {
  it('exposes the high-level Cart workflow', async () => {
    await withTempHome(async (home) => {
      const help = await runCli(['cart', '--help'], { home });
      expect(help.code).toBe(0);
      expect(help.stdout).toContain('listing');
      expect(help.stdout).toContain('checkout');
      expect(help.stdout).toContain('swap');
      expect(help.stdout).toContain('catalog');
      for (const path of [['products', 'create'], ['products', 'attach-sku'], ['products', 'publish'], ['variants', 'add']]) {
        const catalogHelp = await runCli(['cart', 'catalog', ...path, '--help'], { home });
        expect(catalogHelp.code).toBe(0);
        expect(catalogHelp.stdout).toContain('--api-url <url>');
      }

      const listingHelp = await runCli(['cart', 'listing', 'create', '--help'], { home });
      expect(listingHelp.stdout).toContain('--input <path>');
      expect(listingHelp.stdout).toContain('--output <path>');
      expect(listingHelp.stdout).toContain('--preview');
      expect(listingHelp.stdout).toContain('--yes');
      expect(listingHelp.stdout).toContain('--api-url <url>');
      expect(listingHelp.stdout).toContain('--storage <backend>');

      const checkoutHelp = await runCli(['cart', 'checkout', '--help'], { home });
      expect(checkoutHelp.stdout).toContain('--listing <listing-digest[=quantity]>');
      expect(checkoutHelp.stdout).toContain('--payment-currency <currency>');
      expect(checkoutHelp.stdout).toContain('--authorize-only');
      expect(checkoutHelp.stdout).toContain('--input <path>');
    });
  });

  it('sends a minimal checkout intent and prints the API preview', async () => {
    await withCartApiFixture(async ({ baseUrl, request }) => {
      const result = await runCli([
        '--json',
        'cart',
        'checkout',
        '--listing',
        `${listingDigest}=2`,
        '--payment-currency',
        'eth',
        '--recipient',
        recipient,
        '--preview',
        '--chain',
        'sepolia',
      ], { env: { RARE_API_URL: baseUrl } });

      const body = parseJsonStdout<{ preview: boolean; preparation: { intent: unknown; paymentAmount: string } }>(result);
      expect(body.preview).toBe(true);
      expect(body).toMatchObject({
        quote: { currency: zeroAddress, total: '200', expiresAt: '2030-01-01T00:00:00.000Z',
          lines: [{ kind: 'items', amount: '200' }] },
      });
      expect(body.preparation.paymentAmount).toBe('200');
      expect(body.preparation.intent).toEqual({
        paymentCurrency: zeroAddress,
        items: [{ kind: 'listing', listingDigest, quantity: '2', recipient }],
      });
      const captured = await request;
      expect(captured).toMatchObject({
        pathname: '/v1/cart/checkout/preview',
        body: {
          paymentCurrency: zeroAddress,
          items: [{ kind: 'listing', listingDigest, quantity: '2', recipient }],
        },
      });
      expect(captured.searchParams).toMatchObject({
        chainId: '11155111',
        cartAddress: getCartAddress('sepolia'),
      });
    });
  });

  it.each([
    ['--input-amount', '0.01', 'exact-input', 'inputAmount', '10000000000000000'],
    ['--output-amount', '2', 'exact-output', 'outputAmount', '2000000000000000000'],
  ])('wires cart swap %s into generic checkout without a listing', async (flag, amount, mode, amountField, units) => {
    await withCartApiFixture(async ({ baseUrl, request }) => {
      const result = await runCli(['--json', 'cart', 'swap', '--payment-currency', 'eth',
        '--output-currency', 'rare', flag, amount, '--recipient', recipient, '--preview', '--chain', 'sepolia'],
      { env: { RARE_API_URL: baseUrl } });
      expect(result.code).toBe(0);
      expect(await request).toMatchObject({ pathname: '/v1/cart/checkout/preview', body: {
        paymentCurrency: zeroAddress,
        items: [{ kind: 'swap', mode, outputCurrency: expect.stringMatching(/^0x/), [amountField]: units, recipient }],
      } });
      expect(result.stdout).not.toContain('txHash');
    });
  });

  it('sends mixed typed items from JSON and preserves each recipient', async () => {
    await withTempHome(async home => {
      const input = join(home, 'checkout.json');
      await writeFile(input, JSON.stringify({ items: [
        { kind: 'listing', listingDigest, quantity: '2', recipient: seller },
        { kind: 'swap', mode: 'exact-input', outputCurrency: 'rare', inputAmount: '0.01' },
      ] }));
      await withCartApiFixture(async ({ baseUrl, request }) => {
        const result = await runCli(['--json', 'cart', 'checkout', '--input', input,
          '--payment-currency', 'eth', '--recipient', recipient, '--preview', '--chain', 'sepolia'],
        { home, env: { RARE_API_URL: baseUrl } });
        expect(result.code).toBe(0);
        expect(await request).toMatchObject({ body: { items: [
          { kind: 'listing', listingDigest, quantity: '2', recipient: seller },
          { kind: 'swap', mode: 'exact-input', inputAmount: '10000000000000000', recipient },
        ] } });
      });
    });
  });

  it.each([
    ['--output-currency', 'rare'],
    ['--output-currency', 'rare', '--input-amount', '1', '--output-amount', '2'],
    ['--output-currency', 'rare', '--input-amount', '0'],
  ])('rejects invalid swap shortcuts before wallet/network work: %j', async (...args) => {
    const result = await runCli(['--json', 'cart', 'swap', '--payment-currency', 'eth', ...args, '--preview']);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/swap requires|positive decimal/);
  });

  it('rejects malformed local inputs before wallet or network work', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rare-cli-cart-input-'));
    try {
      const input = join(directory, 'listings.json');
      await writeFile(input, '{"deadline":', 'utf8');

      const listing = await runCli(['cart', 'listing', 'create', '--input', input, '--preview']);
      expect(listing.code).toBe(1);
      expect(listing.stderr).toContain('input must contain valid JSON');

      const checkout = await runCli([
        'cart', 'checkout', '--listing', 'not-a-digest', '--payment-currency', 'eth', '--recipient', recipient, '--preview',
      ]);
      expect(checkout.code).toBe(1);
      expect(checkout.stderr).toContain('must be a 0x-prefixed bytes32 value');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects combining preview with checkout authorization before reading wallet credentials', async () => {
    const result = await runCli(['--json', 'cart', 'checkout', '--listing', listingDigest,
      '--payment-currency', 'eth', '--preview', '--authorize-only', '--yes']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Use either --preview or --authorize-only, not both.');
  });

  it('authorizes checkout without submitting payment or requiring a wallet signer', async () => {
    await withTempHome(async temporary => {
      const home = await realpath(temporary);
      await withCartApiFixture(async ({ baseUrl, preparationRequest }) => {
        const directory = join(home, 'auth');
        const scope = { apiBaseUrl: baseUrl, authBaseUrl: `${baseUrl}/auth/v2`, clientId: 'rare-sdk' };
        const store = createAuthStore({ ...scope, backend: 'file', directory });
        await store.withLock(async () => { await store.set({ ...scope, revision: 'cart-prepare-session',
          accessToken: 'cart-prepare-access', refreshToken: 'cart-prepare-refresh',
          expiresAt: Date.now() + 300000, scope: 'rare:account offline_access' }); });
        const result = await runCli(['--json', 'cart', 'checkout', '--listing', `${listingDigest}=2`,
          '--payment-currency', 'eth', '--recipient', recipient, '--authorize-only', '--yes',
          '--chain', 'sepolia', '--api-url', baseUrl, '--storage', 'file', '--auth-directory', directory], { home });
        expect(parseJsonStdout(result)).toMatchObject({ authorizeOnly: true,
          preparedPurchase: { executePurchase: { order: { orderId: hash } } } });
        expect(await preparationRequest).toMatchObject({ pathname: '/v1/cart/checkout/prepare',
          authorization: 'Bearer cart-prepare-access', body: { preparationReference: attemptId } });
        expect(result.stdout).not.toContain('txHash');
      });
    });
  });

  it('starts card checkout and resumes it by attempt ID without a transaction hash', async () => {
    await withTempHome(async temporary => {
      const home = await realpath(temporary);
      await withCartApiFixture(async ({ baseUrl, requests }) => {
        const directory = join(home, 'auth');
        const scope = { apiBaseUrl: baseUrl, authBaseUrl: `${baseUrl}/auth/v2`, clientId: 'rare-sdk' };
        const store = createAuthStore({ ...scope, backend: 'file', directory });
        await store.withLock(async () => { await store.set({ ...scope, revision: 'cart-resume-session',
          accessToken: 'cart-resume-access', refreshToken: 'cart-resume-refresh',
          expiresAt: Date.now() + 300000, scope: 'rare:account offline_access' }); });
        const authArgs = ['--chain', 'sepolia', '--api-url', baseUrl, '--storage', 'file', '--auth-directory', directory];
        const card = await runCli(['--json', 'cart', 'card', '--listing', listingDigest, '--recipient', recipient,
          '--email', 'buyer@example.com', ...authArgs], { home });
        expect(parseJsonStdout(card)).toMatchObject({ attemptId, sessionKey: 'fixture-card-session' });
        const result = await runCli(['--json', 'cart', 'resume', attemptId, ...authArgs], { home });
        expect(parseJsonStdout(result)).toMatchObject({ status: 'EXECUTED', orderId: hash, receipt: { receiptStatus: 'INDEXED' } });
        expect(requests.find(request => request.pathname === '/v1/cart/checkout/coinflow')).toMatchObject({
          idempotencyKey: attemptId,
          body: { preparationReference: attemptId, email: 'buyer@example.com' },
        });
        expect(requests.map(request => [request.method, request.pathname])).toEqual([
          ['POST', '/v1/cart/checkout/preview'],
          ['POST', '/v1/cart/checkout/coinflow'],
          ['GET', `/v1/account/orders/checkout/${attemptId}`],
          ['GET', `/v1/cart/orders/${hash}/receipt`],
        ]);
      });
    });
  });

  it('rejects an expired quote before starting card payment', async () => {
    await withCartApiFixture(async ({ baseUrl, requests }) => {
      const result = await runCli(['--json', 'cart', 'card', '--listing', listingDigest, '--recipient', recipient,
        '--email', 'buyer@example.com', '--chain', 'sepolia', '--api-url', baseUrl]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('checkout quote expired');
      expect(requests.map(request => request.pathname)).toEqual(['/v1/cart/checkout/preview']);
    }, '2020-01-01T00:00:00.000Z');
  });

  it('reuses saved account credentials for Listing preparation without another login or wallet signature', async () => {
    await withTempHome(async temporary => {
      const home = await realpath(temporary);
      await withCartApiFixture(async ({ baseUrl, request }) => {
        const directory = join(home, 'auth');
        const scope = { apiBaseUrl: baseUrl, authBaseUrl: `${baseUrl}/auth/v2`, clientId: 'rare-sdk' };
        const store = createAuthStore({ ...scope, backend: 'file', directory });
        await store.withLock(async () => { await store.set({ ...scope, revision: 'cart-session',
          accessToken: 'cart-access-secret', refreshToken: 'cart-refresh-secret',
          expiresAt: Date.now() + 300000, scope: 'rare:account offline_access' }); });
        const configured = await runCli(['--json', 'configure', '--chain', 'sepolia', '--rpc-url', baseUrl,
          '--private-key', `0x${'11'.repeat(32)}`], { home });
        expect(configured.code).toBe(0);
        const input = join(home, 'listing.json');
        await writeFile(input, JSON.stringify({ deadline: '9999999999', listings: [{ sku,
          settlementCurrency: 'eth', unitPrice: '1', quantity: '1', paymentRecipient: seller,
            splits: [{ recipient: seller, basisPoints: 6667 }, { recipient, basisPoints: 3333 }] }] }));
        const result = await runCli(['--json', 'cart', 'listing', 'create', '--preview', '--chain', 'sepolia',
          '--input', input, '--api-url', baseUrl, '--storage', 'file', '--auth-directory', directory],
        { home, env: { RARE_API_URL: 'https://unused-api.example' } });
        expect(result.code).toBe(1);
        expect(result.stderr).toContain('fixture listing rejected');
        expect(result.stdout + result.stderr).not.toContain('cart-access-secret');
        expect(result.stdout + result.stderr).not.toContain('cart-refresh-secret');
        expect(await request).toMatchObject({ pathname: '/v1/cart/listings/preview', authorization: 'Bearer cart-access-secret',
          body: { listings: [{ paymentRecipient: seller, splits: [
            { recipient: seller, basisPoints: 6667 }, { recipient, basisPoints: 3333 },
          ] }] } });
      });
    });
  });

  it('requires explicit consent for Cart writes in JSON mode', async () => {
    const result = await runCli([
      '--json', 'cart', 'listing', 'cancel', '--listing-digest', listingDigest, '--chain', 'sepolia',
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('rare cart listing cancel requires --yes when --json is enabled.');
    const swap = await runCli(['--json', 'cart', 'swap', '--payment-currency', 'eth',
      '--output-currency', 'rare', '--output-amount', '1', '--chain', 'sepolia']);
    expect(swap.code).toBe(1);
    expect(swap.stderr).toContain('rare cart swap requires --yes when --json is enabled.');
  });
});

type CartApiRequest = {
  method?: string;
  idempotencyKey?: string | string[];
  authorization?: string;
  pathname: string;
  searchParams: Record<string, string>;
  body: unknown;
};

async function withCartApiFixture<T>(fn: (fixture: {
  baseUrl: string;
  requests: readonly CartApiRequest[];
  request: Promise<CartApiRequest>;
  preparationRequest: Promise<CartApiRequest>;
}) => Promise<T>, expiresAt = '2030-01-01T00:00:00.000Z'): Promise<T> {
  const captured = new EventEmitter();
  const requests: CartApiRequest[] = [];
  const server = createServer((request, response) => {
    void handleCartApiRequest(request, response, (value) => {
      requests.push(value);
      captured.emit('request', value);
    }, expiresAt);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Cart API fixture did not bind a TCP port.');
  try {
    return await fn({ baseUrl: `http://127.0.0.1:${address.port}`, requests, request: waitForCartApiRequest(captured),
      preparationRequest: waitForCartApiRequest(captured, '/v1/cart/checkout/prepare') });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
}

async function waitForCartApiRequest(events: EventEmitter, pathname?: string): Promise<CartApiRequest> {
  const values: unknown[] = await once(events, 'request');
  const value = values[0];
  if (!isCartApiRequest(value)) throw new Error('Cart API fixture captured an invalid request.');
  if (pathname !== undefined && value.pathname !== pathname) return waitForCartApiRequest(events, pathname);
  return value;
}

function isCartApiRequest(value: unknown): value is CartApiRequest {
  return typeof value === 'object' && value !== null &&
    'pathname' in value && typeof value.pathname === 'string' &&
    'searchParams' in value && typeof value.searchParams === 'object' && value.searchParams !== null &&
    'body' in value;
}

async function handleCartApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  capture: (request: CartApiRequest) => void,
  expiresAt: string,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const rawBody = await text(request);
  const body = rawBody.length === 0 ? undefined : JSON.parse(rawBody) as unknown;
  capture({ method: request.method, idempotencyKey: request.headers['idempotency-key'], pathname: url.pathname, searchParams: Object.fromEntries(url.searchParams), body, authorization: request.headers.authorization });
  if (request.method === 'GET' && url.pathname.startsWith('/v1/account/orders/checkout/')) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: { status: 'EXECUTED', orderId: hash, preparedPurchase: preparedPurchaseFixture(`0x${'aa'.repeat(65)}`) } }));
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/cart/orders/${hash}/receipt`) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: { orderId: hash, receiptStatus: 'INDEXED' } }));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/v1/cart/checkout/coinflow') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: {
      checkoutJwtToken: 'fixture-jwt', sessionKey: 'fixture-card-session',
      config: { merchantId: 'fixture-merchant', env: 'sandbox' },
      preparedPurchase: preparedPurchaseFixture(`0x${'aa'.repeat(65)}`),
    } }));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/v1/cart/checkout/prepare') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: preparedPurchaseFixture() }));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/v1/cart/listings/preview') {
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'fixture listing rejected' }));
    return;
  }
  if (request.method !== 'POST' || url.pathname !== '/v1/cart/checkout/preview') {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  const currency = typeof body === 'object' && body !== null && 'paymentCurrency' in body &&
    typeof body.paymentCurrency === 'string' && isAddress(body.paymentCurrency) ? body.paymentCurrency : zeroAddress;
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({
    data: {
      preparationReference: attemptId,
      quote: { currency, total: '200', expiresAt,
        lines: [{ kind: 'items', amount: '200' }] },
      preparation: preparedPurchaseFixture('0x', currency),
    },
  }));
}

function preparedPurchaseFixture(platformSignature = '0x', paymentCurrency: string = zeroAddress): Record<string, unknown> {
  return {
    schemaVersion: 1,
    chainId: '11155111',
    cartAddress: getCartAddress('sepolia'),
    preparedAt: '2026-08-28T12:00:00.000Z',
    executePurchase: {
      order: {
        orderId: hash,
        paymentCurrency,
        deadline: '1893456000',
        paymentAmount: '200',
        spreadRecipient: recipient,
        orderLinesHash: hash,
        payoutRouteHash: hash,
        fulfillmentActionsHash: hash,
      },
      lines: [{
        sku,
        listingDigest,
        fulfillmentKind: 2,
        quantity: '2',
        settlementCurrency: zeroAddress,
        amount: '200',
        paymentRecipient: seller,
      }],
      listings: [{
        listingSalt,
        seller,
        sku,
        fulfillmentKind: 2,
        tokenContract: token,
        tokenId: '1',
        settlementCurrency: zeroAddress,
        minimumUnitPrice: '100',
        availableQuantity: '2',
        paymentRecipient: seller,
        splits: [],
      }],
      authorization: {
        listingRoots: [],
        listingRootSignatures: [],
        listingRootIndexes: [],
        listingProofs: [],
      },
      route: { commands: '0x', inputs: [], routerValue: '0' },
      actions: [{ lineIndex: '0', quantity: '2', recipient }],
      platformSignature,
    },
  };
}
