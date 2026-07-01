/* eslint-disable no-restricted-syntax, functional/immutable-data */
import { describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';
import { createBatchOfferNamespace } from '../../../src/sdk/batch-offer.js';
import { ETH_ADDRESS } from '../../../src/contracts/addresses.js';
import { hashBatchToken } from '../../../src/sdk/batch-core.js';

const accountAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const contractAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
const txHash = `0x${'11'.repeat(32)}`;

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json' },
  });
}

async function parseJsonBody(input: RequestInfo | URL, init: RequestInit | undefined): Promise<unknown> {
  const body = input instanceof Request ? await input.clone().text() : init?.body;
  if (typeof body !== 'string') {
    throw new Error('Expected request body to be a JSON string.');
  }
  return JSON.parse(body);
}

describe('batch offer namespace', () => {
  it('scans older event chunks when API proof resolution needs active root candidates', async () => {
    const tokenId = 1n;
    const oldRoot = hashBatchToken(contractAddress, tokenId);
    const eventRanges: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
    const proofRoots: unknown[] = [];
    const writeContract = vi.fn(async () => txHash);
    const namespace = createBatchOfferNamespace(
      {
        async getBlockNumber() {
          return 25_050n;
        },
        async getBlock() {
          return { timestamp: 1_000n };
        },
        async getContractEvents(params: {
          fromBlock: bigint;
          toBlock: bigint;
        }) {
          eventRanges.push({
            fromBlock: params.fromBlock,
            toBlock: params.toBlock,
          });
          if (params.fromBlock <= 5_000n && params.toBlock >= 5_000n) {
            return [{ args: { rootHash: oldRoot } }];
          }
          return [];
        },
        async readContract(params: { functionName: string }) {
          if (params.functionName === 'getBatchOffer') {
            return [accountAddress, oldRoot, 1n, ETH_ADDRESS, 3_600n, 0n];
          }
          if (params.functionName === 'ownerOf') {
            return accountAddress;
          }
          if (params.functionName === 'isApprovedForAll') {
            return true;
          }
          throw new Error(`Unexpected readContract: ${params.functionName}`);
        },
        async waitForTransactionReceipt() {
          return { logs: [] };
        },
      } as never,
      {
        publicClient: {} as never,
        account: accountAddress,
        walletClient: {
          account: { address: accountAddress },
          writeContract,
        } as never,
        apiFetch: async (input, init) => {
          const body = await parseJsonBody(input, init);
          const root = (body as { root?: unknown }).root;
          proofRoots.push(root);
          if (root === oldRoot) {
            return jsonResponse({
              root: oldRoot,
              contractAddress,
              tokenId: tokenId.toString(),
              leaf: oldRoot,
              proof: [],
            });
          }
          return jsonResponse({ error: 'not found' }, { status: 404, statusText: 'Not Found' });
        },
      },
      'sepolia',
    );

    await expect(namespace.accept({
      creator: accountAddress,
      contract: contractAddress,
      tokenId,
    })).rejects.toThrow('Batch offer accept transaction succeeded but BatchOfferAccepted was not found in logs.');

    expect(eventRanges).toEqual([
      { fromBlock: 15_051n, toBlock: 25_050n },
      { fromBlock: 5_051n, toBlock: 15_050n },
      { fromBlock: 0n, toBlock: 5_050n },
    ]);
    expect(proofRoots).toEqual([undefined, oldRoot]);
    expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: 'acceptBatchOffer',
      args: expect.arrayContaining([oldRoot]),
    }));
  });
});
