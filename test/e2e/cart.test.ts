import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { EventEmitter, once } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
import { describe, expect, it } from 'vitest';
import { getCartAddress } from '@rareprotocol/rare-sdk/contracts';
import { zeroAddress } from 'viem';
import { parseJsonStdout, runCli, withTempHome } from '../helpers/cli.js';

const listingDigest = `0x${'22'.repeat(32)}`;
const listingSalt = `0x${'33'.repeat(32)}`;
const sku = `0x${'44'.repeat(32)}`;
const hash = `0x${'55'.repeat(32)}`;
const seller = '0x1111111111111111111111111111111111111111';
const recipient = '0x2222222222222222222222222222222222222222';
const token = '0x3333333333333333333333333333333333333333';
describe('built Cart CLI', () => {
  it('exposes the high-level Cart workflow', async () => {
    await withTempHome(async (home) => {
      const help = await runCli(['cart', '--help'], { home });
      expect(help.code).toBe(0);
      expect(help.stdout).toContain('listing');
      expect(help.stdout).toContain('checkout');

      const listingHelp = await runCli(['cart', 'listing', 'create', '--help'], { home });
      expect(listingHelp.stdout).toContain('--input <path>');
      expect(listingHelp.stdout).toContain('--output <path>');
      expect(listingHelp.stdout).toContain('--preview');
      expect(listingHelp.stdout).toContain('--yes');

      const checkoutHelp = await runCli(['cart', 'checkout', '--help'], { home });
      expect(checkoutHelp.stdout).toContain('--listing <listing-digest[=quantity]>');
      expect(checkoutHelp.stdout).toContain('--payment-currency <currency>');
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
      ], { env: { RARE_API_BASE_URL: baseUrl } });

      const body = parseJsonStdout<{ preview: boolean; preparation: { intent: unknown; paymentAmount: string } }>(result);
      expect(body.preview).toBe(true);
      expect(body.preparation.paymentAmount).toBe('200');
      expect(body.preparation.intent).toEqual({
        paymentCurrency: zeroAddress,
        items: [{ listingDigest, quantity: '2', recipient }],
      });
      const captured = await request;
      expect(captured).toMatchObject({
        pathname: '/v1/cart/checkout/preview',
        body: {
          paymentCurrency: zeroAddress,
          items: [{ listingDigest, quantity: '2', recipient }],
        },
      });
      expect(captured.searchParams).toMatchObject({
        chainId: '11155111',
        cartAddress: getCartAddress('sepolia'),
      });
    });
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

  it('requires explicit consent for Cart writes in JSON mode', async () => {
    const result = await runCli([
      '--json', 'cart', 'listing', 'cancel', '--listing-digest', listingDigest, '--chain', 'sepolia',
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('rare cart listing cancel requires --yes when --json is enabled.');
  });
});

type CartApiRequest = {
  pathname: string;
  searchParams: Record<string, string>;
  body: unknown;
};

async function withCartApiFixture<T>(fn: (fixture: {
  baseUrl: string;
  request: Promise<CartApiRequest>;
}) => Promise<T>): Promise<T> {
  const captured = new EventEmitter();
  const server = createServer((request, response) => {
    void handleCartApiRequest(request, response, (value) => {
      captured.emit('request', value);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Cart API fixture did not bind a TCP port.');
  try {
    return await fn({ baseUrl: `http://127.0.0.1:${address.port}`, request: waitForCartApiRequest(captured) });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
}

async function waitForCartApiRequest(events: EventEmitter): Promise<CartApiRequest> {
  const values: unknown[] = await once(events, 'request');
  const value = values[0];
  if (!isCartApiRequest(value)) throw new Error('Cart API fixture captured an invalid request.');
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
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const rawBody = await text(request);
  const body = rawBody.length === 0 ? undefined : JSON.parse(rawBody) as unknown;
  capture({ pathname: url.pathname, searchParams: Object.fromEntries(url.searchParams), body });
  if (request.method !== 'POST' || url.pathname !== '/v1/cart/checkout/preview') {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({
    data: {
      preparationReference: 'cart-checkout-fixture',
      preparation: preparedPurchaseFixture(),
    },
  }));
}

function preparedPurchaseFixture(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    chainId: '11155111',
    cartAddress: getCartAddress('sepolia'),
    preparedAt: '2026-08-28T12:00:00.000Z',
    executePurchase: {
      order: {
        orderId: hash,
        paymentCurrency: zeroAddress,
        deadline: '1893456000',
        paymentAmount: '200',
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
      }],
      authorization: {
        listingRoots: [],
        listingRootSignatures: [],
        listingRootIndexes: [],
        listingProofs: [],
      },
      route: { commands: '0x', inputs: [], routerValue: '0' },
      actions: [{ lineIndex: '0', quantity: '2', recipient }],
      platformSignature: '0x',
    },
  };
}
