/* eslint-disable functional/immutable-data */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RARE_API_BASE_URL, resolveRareApiBaseUrl } from '../../../src/data-access/base-url.js';
import { createApiClient } from '../../../src/data-access/client.js';

const originalRareApiBaseUrl = process.env.RARE_API_BASE_URL;

afterEach(() => {
  if (originalRareApiBaseUrl === undefined) {
    delete process.env.RARE_API_BASE_URL;
  } else {
    process.env.RARE_API_BASE_URL = originalRareApiBaseUrl;
  }
  vi.unstubAllGlobals();
});

describe('API client configuration', () => {
  it('resolves base URLs from env, explicit config, then the production default', () => {
    process.env.RARE_API_BASE_URL = 'https://rare-api.env.test';
    expect(resolveRareApiBaseUrl('https://rare-api.config.test')).toBe('https://rare-api.env.test');

    delete process.env.RARE_API_BASE_URL;
    expect(resolveRareApiBaseUrl('https://rare-api.config.test')).toBe('https://rare-api.config.test');
    expect(resolveRareApiBaseUrl()).toBe(DEFAULT_RARE_API_BASE_URL);
  });

  it('uses RARE_API_BASE_URL as the global base URL override', async () => {
    process.env.RARE_API_BASE_URL = 'https://rare-api.test';
    const requests: Request[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request);
      return new Response(JSON.stringify({ data: [], pagination: { page: 1, perPage: 1, total: 0 } }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = createApiClient('https://explicit-api.test');
    await client.GET('/v1/nfts', { params: { query: { page: 1, perPage: 1 } } });

    expect(requests[0]?.url).toBe('https://rare-api.test/v1/nfts?page=1&perPage=1');
  });
});
