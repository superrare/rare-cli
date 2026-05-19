/* eslint-disable no-restricted-syntax, @typescript-eslint/explicit-function-return-type */
import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import { ETH_ADDRESS } from '../../../src/contracts/addresses.js';
import { createReleaseNamespace } from '../../../src/sdk/release.js';
import { buildReleaseAllowlistArtifact } from '../../../src/sdk/release-core.js';

const accountAddress = '0x0000000000000000000000000000000000000001' as Address;
const collection = '0x1000000000000000000000000000000000000000' as Address;
const customCurrency = '0x3000000000000000000000000000000000000000' as Address;
const rareMinter = '0x2000000000000000000000000000000000000000' as Address;
const auction = '0x4000000000000000000000000000000000000000' as Address;

function createReleaseTestNamespace(publicClient: unknown, opts: {
  apiFetch?: typeof fetch;
  writeContract?: (params: { functionName: string; args?: readonly unknown[] }) => Promise<`0x${string}`>;
} = {}) {
  return createReleaseNamespace(
    publicClient as never,
    {
      publicClient: publicClient as never,
      walletClient: {
        account: { address: accountAddress },
        writeContract: opts.writeContract ?? (async (): Promise<never> => {
          throw new Error('unexpected release write');
        }),
      } as never,
      apiFetch: opts.apiFetch,
    },
    'sepolia',
    { rareMinter, auction },
  );
}

async function expectRejectionCause(
  promise: Promise<unknown>,
  message: string,
  cause: Error,
) {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).message).toContain(message);
  expect((caught as Error).cause).toBe(cause);
}

describe('release namespace shell errors', () => {
  it('preserves the ERC20 decimals read failure as the wrapped cause', async () => {
    const cause = new Error('decimals rpc failed');
    const release = createReleaseTestNamespace({
      async readContract(params: { functionName: string }): Promise<never> {
        expect(params.functionName).toBe('decimals');
        throw cause;
      },
    });

    await expectRejectionCause(
      release.configure({
        contract: collection,
        currency: customCurrency,
        price: '1',
        maxMints: 1,
      }),
      `Unable to read decimals for ERC20 currency ${customCurrency}`,
      cause,
    );
  });

  it('preserves owner read and mintTo simulation failures as wrapped causes', async () => {
    const ownerCause = new Error('owner rpc failed');
    const ownerReadRelease = createReleaseTestNamespace({
      async readContract(params: { functionName: string }): Promise<never> {
        expect(params.functionName).toBe('owner');
        throw ownerCause;
      },
    });

    await expectRejectionCause(
      ownerReadRelease.configure({
        contract: collection,
        price: '1',
        maxMints: 1,
      }),
      `Unable to read owner() from collection ${collection}`,
      ownerCause,
    );

    const simulationCause = new Error('mintTo simulation failed');
    const simulationRelease = createReleaseTestNamespace({
      async readContract(params: { functionName: string }) {
        expect(params.functionName).toBe('owner');
        return accountAddress;
      },
      async simulateContract(): Promise<never> {
        throw simulationCause;
      },
    });

    await expectRejectionCause(
      simulationRelease.configure({
        contract: collection,
        price: '1',
        maxMints: 1,
      }),
      `Collection ${collection} must expose mintTo(address)`,
      simulationCause,
    );
  });

  it('does not resolve rare-api proofs when callers provide an explicit empty singleton proof', async () => {
    const artifact = buildReleaseAllowlistArtifact([accountAddress]);
    const writeReached = new Error('write reached with explicit empty proof');
    const release = createReleaseTestNamespace({
      async readContract(params: { functionName: string }) {
        if (params.functionName === 'getDirectSaleConfig') {
          return {
            seller: accountAddress,
            currencyAddress: ETH_ADDRESS,
            price: 0n,
            startTime: 0n,
            maxMints: 1n,
            splitRecipients: [accountAddress],
            splitRatios: [100],
          };
        }
        if (params.functionName === 'getContractAllowListConfig') {
          return {
            root: artifact.root,
            endTimestamp: 2_000n,
          };
        }
        if (
          params.functionName === 'getContractMintLimit' ||
          params.functionName === 'getContractTxLimit' ||
          params.functionName === 'getContractMintsPerAddress' ||
          params.functionName === 'getContractTxsPerAddress' ||
          params.functionName === 'totalSupply'
        ) {
          return 0n;
        }
        if (params.functionName === 'maxTokens') {
          return 10n;
        }
        throw new Error(`unexpected read ${params.functionName}`);
      },
      async getBlock() {
        return { timestamp: 1_000n };
      },
    }, {
      apiFetch: async (): Promise<never> => {
        throw new Error('unexpected rare-api proof resolution');
      },
      async writeContract(params): Promise<never> {
        expect(params.functionName).toBe('mintDirectSale');
        expect(params.args?.[4]).toEqual([]);
        throw writeReached;
      },
    });

    await expect(release.mint({
      contract: collection,
      proof: [],
    })).rejects.toBe(writeReached);
  });
});
