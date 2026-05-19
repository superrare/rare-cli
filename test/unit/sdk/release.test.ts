/* eslint-disable no-restricted-syntax, @typescript-eslint/explicit-function-return-type */
import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import { createReleaseNamespace } from '../../../src/sdk/release.js';

const accountAddress = '0x0000000000000000000000000000000000000001' as Address;
const collection = '0x1000000000000000000000000000000000000000' as Address;
const customCurrency = '0x3000000000000000000000000000000000000000' as Address;
const rareMinter = '0x2000000000000000000000000000000000000000' as Address;
const auction = '0x4000000000000000000000000000000000000000' as Address;

function createReleaseTestNamespace(publicClient: unknown) {
  return createReleaseNamespace(
    publicClient as never,
    {
      publicClient: publicClient as never,
      walletClient: {
        account: { address: accountAddress },
        async writeContract(): Promise<never> {
          throw new Error('unexpected release write');
        },
      } as never,
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
});
