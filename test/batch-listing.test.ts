import test from 'node:test';
import assert from 'node:assert/strict';
import type { Address } from 'viem';
import { createBatchListingNamespace } from '../src/sdk/batch-listing.js';
import { getBatchListingAddress } from '../src/contracts/addresses.js';

const batchListingAddress = '0xF2bE72d4343beD375Cb6d0E799a3c003163860e0' as Address;
const accountAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const hex32 = (byte: string) => (`0x${byte.repeat(64)}` as `0x${string}`);

function receipt() {
  return { blockNumber: 1n } as never;
}

test('batch listing create skips approval tx hashes when approval is already in place', async () => {
  const writeCalls: unknown[] = [];
  const namespace = createBatchListingNamespace(
    {
      async readContract(params: { functionName: string }) {
        if (params.functionName === 'ownerOf') return accountAddress;
        if (params.functionName === 'isApprovedForAll') return true;
        throw new Error(`Unexpected readContract: ${params.functionName}`);
      },
      async waitForTransactionReceipt() {
        return receipt();
      },
    } as never,
    {
      publicClient: {} as never,
      walletClient: {
        account: { address: accountAddress },
        async writeContract(params: unknown) {
          writeCalls.push(params);
          return hex32('1');
        },
      } as never,
    },
    { batchListing: batchListingAddress },
  );

  const result = await namespace.create({
      artifact: {
      root: hex32('2'),
      currency: '0x0000000000000000000000000000000000000000',
      amount: '1',
      splitAddresses: [],
      splitRatios: [],
      tokens: [{ contract: accountAddress, tokenId: '1' }],
    },
  });

  assert.equal(result.approvalTxHashes, undefined);
  assert.equal(writeCalls.length, 1);
});

test('batch listing create fails early when sampled token ownership does not match the configured wallet', async () => {
  const namespace = createBatchListingNamespace(
    {
      async readContract(params: { functionName: string }) {
        if (params.functionName === 'ownerOf') return '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
        throw new Error(`Unexpected readContract: ${params.functionName}`);
      },
    } as never,
    {
      publicClient: {} as never,
      walletClient: {
        account: { address: accountAddress },
      } as never,
    },
    { batchListing: batchListingAddress },
  );

  await assert.rejects(
    namespace.create({
      artifact: {
        root: hex32('2'),
        currency: '0x0000000000000000000000000000000000000000',
        amount: '1',
        splitAddresses: [],
        splitRatios: [],
        tokens: [{ contract: accountAddress, tokenId: '1' }],
      },
    }),
    /is owned by/,
  );
});

test('batch listing buy submits an empty allowListProof when the proof artifact does not include one', async () => {
  const writeCalls: Array<{ functionName: string; args: unknown[] }> = [];
  const namespace = createBatchListingNamespace(
    {
      async readContract(params: { functionName: string }) {
        if (params.functionName === 'allowance') return 10n ** 18n;
        throw new Error(`Unexpected readContract: ${params.functionName}`);
      },
      async waitForTransactionReceipt() {
        return receipt();
      },
    } as never,
    {
      publicClient: {} as never,
      walletClient: {
        account: { address: accountAddress },
        async writeContract(params: { functionName: string; args: unknown[] }) {
          writeCalls.push(params);
          return hex32('3');
        },
      } as never,
    },
    { batchListing: batchListingAddress },
  );

  await namespace.buy({
    creator: accountAddress,
    currency: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    amount: 1n,
    proofArtifact: {
      root: hex32('4'),
      contract: '0x1111111111111111111111111111111111111111',
      tokenId: '1',
      proof: [hex32('5')],
    },
  });

  assert.equal(writeCalls.length, 1);
  assert.equal(writeCalls[0]?.functionName, 'buyWithMerkleProof');
  assert.deepEqual(writeCalls[0]?.args[7], []);
});

test('batch listing status marks listings inactive when the root nonce no longer matches', async () => {
  const namespace = createBatchListingNamespace(
    {
      async readContract(params: { functionName: string }) {
        if (params.functionName === 'getMerkleSalePriceConfig') {
          return {
            currency: '0x0000000000000000000000000000000000000000',
            amount: 1n,
            splitRecipients: [] as Address[],
            splitRatios: [] as number[],
            nonce: 3n,
          };
        }
        if (params.functionName === 'getCreatorSalePriceMerkleRootNonce') return 4n;
        if (params.functionName === 'getAllowListConfig') {
          return {
            root: '0x' + '00'.repeat(32),
            endTimestamp: 0n,
          };
        }
        throw new Error(`Unexpected readContract: ${params.functionName}`);
      },
    } as never,
    { publicClient: {} as never },
    { batchListing: batchListingAddress },
  );

  const result = await namespace.getStatus({
    root: hex32('2'),
    creator: accountAddress,
  });

  assert.equal(result.hasListing, false);
});

test('getBatchListingAddress throws a clear error for unsupported deployment chains', () => {
  assert.throws(() => getBatchListingAddress('base'), /Available on: sepolia, mainnet|Available on: mainnet, sepolia/);
});
