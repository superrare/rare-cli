/* eslint-disable no-restricted-syntax */
import { describe, expect, it, vi } from 'vitest';
import { RareApiError } from '../../../src/data-access/errors.js';
import {
  generateApiNftMerkleRoot,
  resolveApiNftMerkleProof,
} from '../../../src/sdk/merkle-api.js';

const publicClient = {
  chain: { id: 11155111 },
} as never;

const hex32 = (byte: string): `0x${string}` => `0x${byte.repeat(64)}`;

describe('SDK merkle API client', () => {
  it('posts through the shared rare-api client and normalizes responses', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = input instanceof Request ? input : new Request(input, init);
      const body: unknown = await request.clone().json();

      expect(request.method).toBe('POST');
      expect(request.url).toBe('https://rare-api.test/v1/merkle-roots/nfts/proof');
      expect(request.headers.get('content-type')).toBe('application/json');
      expect(body).toEqual({
        chainId: 11155111,
        contractAddress: '0x1111111111111111111111111111111111111111',
        tokenId: '1',
        root: hex32('1'),
        context: 'batch-listing',
      });

      return jsonResponse({
        root: hex32('1'),
        contractAddress: '0x1111111111111111111111111111111111111111',
        tokenId: '1',
        leaf: hex32('2'),
        proof: [hex32('3')],
      });
    });

    const proof = await resolveApiNftMerkleProof(
      { publicClient, apiBaseUrl: 'https://rare-api.test', apiFetch: fetchImpl },
      {
        chainId: 11155111,
        contractAddress: '0x1111111111111111111111111111111111111111',
        tokenId: 1n,
        root: hex32('1'),
        context: 'batch-listing',
      },
    );

    expect(proof).toEqual({
      root: hex32('1'),
      contractAddress: '0x1111111111111111111111111111111111111111',
      tokenId: '1',
      leaf: hex32('2'),
      proof: [hex32('3')],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('surfaces merkle endpoint failures as RareApiError', async () => {
    const request = generateApiNftMerkleRoot(
      {
        publicClient,
        apiBaseUrl: 'https://rare-api.test',
        apiFetch: async () => jsonResponse({ error: 'rate limit exceeded' }, { status: 429, statusText: 'Too Many Requests' }),
      },
      [{ contractAddress: '0x1111111111111111111111111111111111111111', tokenId: 1n }],
    );

    await expect(request).rejects.toThrow(RareApiError);
    await expect(request).rejects.toMatchObject({
      name: 'RareApiError',
      status: 429,
      path: '/v1/merkle-roots/nfts',
      message: 'API error 429 on /v1/merkle-roots/nfts: rate limit exceeded',
    });
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  });
}
