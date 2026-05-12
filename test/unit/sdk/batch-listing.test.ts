/* eslint-disable no-restricted-syntax, @typescript-eslint/explicit-function-return-type, functional/immutable-data */
import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import { createBatchListingNamespace } from '../../../src/sdk/batch-listing.js';
import { getBatchListingAddress } from '../../../src/contracts/addresses.js';

const batchListingAddress = '0xF2bE72d4343beD375Cb6d0E799a3c003163860e0' as Address;
const marketplaceSettingsAddress = '0x972dEe8fa339ad2D9c6cbDA31b67f98Fac242d13' as Address;
const erc20ApprovalManagerAddress = '0x4619eB29e84392CE91C27FC936A5c94d1D14b93f' as Address;
const approvalManagerAddress = '0x5fa0a461d3a2Ea3bFDf03e8BD37CAbB4ae84205E' as Address;
const accountAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const hex32 = (byte: string) => (`0x${byte.repeat(64)}`);
const addresses = {
  batchListing: batchListingAddress,
  marketplaceSettings: marketplaceSettingsAddress,
  erc20ApprovalManager: erc20ApprovalManagerAddress,
  erc721ApprovalManager: approvalManagerAddress,
} as const;

function receipt() {
  return { blockNumber: 1n } as never;
}

describe('batch listing namespace', () => {
  it('skips approval tx hashes when approval is already in place', async () => {
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
      addresses,
    );

    const result = await namespace.create({
      artifact: {
        root: hex32('2'),
        currency: '0x0000000000000000000000000000000000000000',
        amount: '1',
        splitAddresses: [],
        splitRatios: [],
        tokens: [
          { contract: accountAddress, tokenId: '1' },
          { contract: accountAddress, tokenId: '2' },
        ],
      },
    });

    expect(result.approvalTxHashes).toBeUndefined();
    expect(writeCalls.length).toBe(1);
    expect((writeCalls[0] as { args: unknown[] }).args[3]).toEqual([accountAddress]);
    expect((writeCalls[0] as { args: unknown[] }).args[4]).toEqual([100]);
  });

  it('fails early when sampled token ownership does not match the configured wallet', async () => {
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
      addresses,
    );

    await expect(
      namespace.create({
        artifact: {
          root: hex32('2'),
          currency: '0x0000000000000000000000000000000000000000',
          amount: '1',
          splitAddresses: [],
          splitRatios: [],
          tokens: [
            { contract: accountAddress, tokenId: '1' },
            { contract: accountAddress, tokenId: '2' },
          ],
        },
      }),
    ).rejects.toThrow(/is owned by/);
  });

  it('submits an empty allowListProof when the proof artifact does not include one', async () => {
    const writeCalls: Array<{ functionName: string; args: unknown[] }> = [];
    const namespace = createBatchListingNamespace(
      {
        async readContract(params: { functionName: string; args?: unknown[] }) {
          if (params.functionName === 'calculateMarketplaceFee') return 0n;
          if (params.functionName === 'allowance') {
            expect(params.args?.[1]).toBe(erc20ApprovalManagerAddress);
            return 10n ** 18n;
          }
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
      addresses,
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

    expect(writeCalls.length).toBe(1);
    expect(writeCalls[0]?.functionName).toBe('buyWithMerkleProof');
    expect(writeCalls[0]?.args[7]).toEqual([]);
  });

  it('marks listings inactive when the root nonce no longer matches', async () => {
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
              root: `0x${'00'.repeat(32)}`,
              endTimestamp: 0n,
            };
          }
          throw new Error(`Unexpected readContract: ${params.functionName}`);
        },
      } as never,
      { publicClient: {} as never },
      addresses,
    );

    const result = await namespace.getStatus({
      root: hex32('2'),
      creator: accountAddress,
    });

    expect(result.hasListing).toBe(false);
  });

  it('marks ETH listings active when amount and root nonce match', async () => {
    const namespace = createBatchListingNamespace(
      {
        async readContract(params: { functionName: string }) {
          if (params.functionName === 'getMerkleSalePriceConfig') {
            return {
              currency: '0x0000000000000000000000000000000000000000',
              amount: 1n,
              splitRecipients: [accountAddress] as Address[],
              splitRatios: [100] as number[],
              nonce: 3n,
            };
          }
          if (params.functionName === 'getCreatorSalePriceMerkleRootNonce') return 3n;
          if (params.functionName === 'getAllowListConfig') {
            return {
              root: `0x${'00'.repeat(32)}`,
              endTimestamp: 0n,
            };
          }
          throw new Error(`Unexpected readContract: ${params.functionName}`);
        },
      } as never,
      { publicClient: {} as never },
      addresses,
    );

    const result = await namespace.getStatus({
      root: hex32('2'),
      creator: accountAddress,
    });

    expect(result.isEth).toBe(true);
    expect(result.hasListing).toBe(true);
  });

  it('approves the ERC721 approval manager rather than the marketplace', async () => {
    const writeCalls: Array<{ functionName: string; args: unknown[] }> = [];
    let approvalChecks = 0;
    const namespace = createBatchListingNamespace(
      {
        async readContract(params: { functionName: string; args?: unknown[] }) {
          if (params.functionName === 'ownerOf') return accountAddress;
          if (params.functionName === 'isApprovedForAll') {
            expect(params.args?.[1]).toBe(approvalManagerAddress);
            approvalChecks += 1;
            return approvalChecks > 1;
          }
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
            return params.functionName === 'setApprovalForAll' ? hex32('6') : hex32('7');
          },
        } as never,
      },
      addresses,
    );

    const result = await namespace.create({
      artifact: {
        root: hex32('2'),
        currency: '0x0000000000000000000000000000000000000000',
        amount: '1',
        splitAddresses: [],
        splitRatios: [],
        tokens: [
          { contract: accountAddress, tokenId: '1' },
          { contract: accountAddress, tokenId: '2' },
        ],
      },
    });

    expect(writeCalls[0]?.functionName).toBe('setApprovalForAll');
    expect(writeCalls[0]?.args).toEqual([approvalManagerAddress, true]);
    expect(writeCalls[1]?.functionName).toBe('registerSalePriceMerkleRoot');
    expect(result.approvalTxHashes).toEqual([hex32('6')]);
  });
});

describe('batch listing addresses', () => {
  it('throws a clear error for unsupported deployment chains', () => {
    expect(() => getBatchListingAddress('base')).toThrow(
      /Available on: sepolia, mainnet|Available on: mainnet, sepolia/,
    );
  });
});
