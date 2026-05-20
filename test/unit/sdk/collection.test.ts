import { describe, expect, it, vi } from 'vitest';
import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeFunctionResult,
} from 'viem';
import { mainnet } from 'viem/chains';
import { collectionOwnerAbi } from '../../../src/contracts/abis/collection-owner.js';
import { createCollectionNamespace } from '../../../src/sdk/collection.js';

const contract = '0x1111111111111111111111111111111111111111';
const receiver = '0x2222222222222222222222222222222222222222';
const defaultReceiver = '0x3333333333333333333333333333333333333333';

type DefaultRoyaltyReadMode = 'available' | 'unsupported' | 'failed';

function createTestCollectionNamespace(mode: DefaultRoyaltyReadMode): ReturnType<typeof createCollectionNamespace> {
  const request = vi.fn(async ({ method, params }: { method: string; params?: unknown[] }): Promise<`0x${string}`> => {
    if (method !== 'eth_call') {
      throw new Error(`unexpected RPC method ${method}`);
    }

    const { functionName } = decodeFunctionData({
      abi: collectionOwnerAbi,
      data: getCallData(params),
    });

    if (functionName === 'royaltyInfo') {
      return encodeFunctionResult({
        abi: collectionOwnerAbi,
        functionName,
        result: [receiver, 500n],
      });
    }

    if (mode === 'unsupported') {
      return '0x';
    }

    if (mode === 'failed' && functionName === 'getDefaultRoyaltyReceiver') {
      throw new Error('temporary RPC failure');
    }

    if (functionName === 'getDefaultRoyaltyReceiver') {
      return encodeFunctionResult({
        abi: collectionOwnerAbi,
        functionName,
        result: defaultReceiver,
      });
    }

    if (functionName === 'getDefaultRoyaltyPercentage') {
      return encodeFunctionResult({
        abi: collectionOwnerAbi,
        functionName,
        result: 10n,
      });
    }

    throw new Error(`unexpected read ${functionName}`);
  });
  const publicClient = createPublicClient({ chain: mainnet, transport: custom({ request }) });

  return createCollectionNamespace(
    publicClient,
    { publicClient },
    'mainnet',
    { async get(): Promise<never> { throw new Error('unexpected collection get'); } },
    {
      async erc721(): Promise<never> { throw new Error('unexpected deploy erc721'); },
      async lazyBatchMint(): Promise<never> { throw new Error('unexpected deploy lazyBatchMint'); },
    },
    async (): Promise<never> => {
      throw new Error('unexpected collection mint');
    },
  );
}

function getCallData(params: unknown[] | undefined): `0x${string}` {
  const [call] = params ?? [];
  if (isCallWithData(call)) {
    return call.data;
  }

  throw new Error('eth_call params must include call data');
}

function isCallWithData(value: unknown): value is { data: `0x${string}` } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    isHex(value.data)
  );
}

function isHex(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && value.startsWith('0x');
}

describe('SDK collection namespace', () => {
  it('includes default royalty reads when the collection supports them', async () => {
    const collection = createTestCollectionNamespace('available');

    await expect(collection.royalty.status({ contract, tokenId: 1 })).resolves.toMatchObject({
      receiver,
      royaltyAmount: 500n,
      defaultReceiver,
      defaultPercentage: 10n,
    });
  });

  it('omits default royalty fields when optional methods are unsupported', async () => {
    const collection = createTestCollectionNamespace('unsupported');
    const status = await collection.royalty.status({ contract, tokenId: 1 });

    expect(status.receiver).toBe(receiver);
    expect(status.royaltyAmount).toBe(500n);
    expect(status).not.toHaveProperty('defaultReceiver');
    expect(status).not.toHaveProperty('defaultPercentage');
  });

  it('throws default royalty read failures instead of returning partial status', async () => {
    const collection = createTestCollectionNamespace('failed');

    await expect(collection.royalty.status({ contract, tokenId: 1 })).rejects.toThrow(
      `Collection ${contract} does not support getDefaultRoyaltyReceiver`,
    );
  });
});
