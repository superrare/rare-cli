import { describe, expect, it } from 'vitest';
import { parseUnits, type PublicClient, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { resolveCurrency } from '../../../src/contracts/addresses.js';
import { createRareClient } from '../../../src/sdk/client.js';

const account = privateKeyToAccount(
  '0x0000000000000000000000000000000000000000000000000000000000000001',
);
const nftContract = '0x1000000000000000000000000000000000000000' as const;
const collection = '0x2000000000000000000000000000000000000000' as const;

describe('SDK currency amount normalization', () => {
  it('normalizes USDC listing prices with configured 6-decimal units', async () => {
    const harness = createClientHarness();
    const rare = createRareClient(harness.config);
    const usdc = resolveCurrency('usdc', 'sepolia');

    await rare.listing.create({
      contract: nftContract,
      tokenId: '1',
      currency: usdc,
      price: '1.25',
      autoApprove: false,
    });

    const [write] = harness.getWrites();
    expect(write).toBeDefined();
    expect(write?.[3]).toBe(parseUnits('1.25', 6));
    expect(write?.[3]).not.toBe(parseUnits('1.25', 18));
  });

  it('normalizes USDC auction reserve prices with configured 6-decimal units', async () => {
    const harness = createClientHarness();
    const rare = createRareClient(harness.config);
    const usdc = resolveCurrency('usdc', 'sepolia');

    await rare.auction.create({
      contract: collection,
      tokenId: '2',
      currency: usdc,
      startingPrice: '2.5',
      duration: '3600',
      autoApprove: false,
    });

    const [write] = harness.getWrites();
    expect(write).toBeDefined();
    expect(write?.[3]).toBe(parseUnits('2.5', 6));
    expect(write?.[3]).not.toBe(parseUnits('2.5', 18));
  });
});

function createClientHarness(): {
  config: {
    publicClient: PublicClient;
    walletClient: WalletClient;
  };
  getWrites: () => readonly unknown[][];
} {
  let writes: readonly unknown[][] = [];
  // eslint-disable-next-line no-restricted-syntax -- This is a minimal viem client double for unit-level argument capture.
  const publicClient = {
    chain: sepolia,
    async readContract() {
      return `0x${'11'.repeat(32)}`;
    },
    async waitForTransactionReceipt() {
      return { blockNumber: 1n, logs: [] };
    },
  } as unknown as PublicClient;

  // eslint-disable-next-line no-restricted-syntax -- This is a minimal viem client double for unit-level argument capture.
  const walletClient = {
    account,
    async writeContract(request: { args?: unknown[] }) {
      writes = [...writes, request.args ?? []];
      return '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    },
  } as unknown as WalletClient;

  return {
    config: { publicClient, walletClient },
    getWrites: () => writes,
  };
}
