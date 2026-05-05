import { describe, expect, it } from 'vitest';
import { mainnet } from 'viem/chains';
import {
  requireWallet,
  resolveChainFromPublicClient,
  toInteger,
  toNonNegativeInteger,
  toNonNegativeWei,
  toPositiveInteger,
  toPositiveWei,
  toWei,
} from '../../../src/sdk/helpers.js';
import {
  buyerAddress,
  createFakePublicClient,
  createFakeWalletClient,
  sellerAccount,
  sellerAddress,
} from '../../helpers/fakeViem.js';

describe('SDK helper normalization', () => {
  it('normalizes integer inputs to bigint', () => {
    expect(toInteger(12n, 'tokenId')).toBe(12n);
    expect(toInteger(12, 'tokenId')).toBe(12n);
    expect(toInteger('12', 'tokenId')).toBe(12n);
  });

  it('rejects invalid integer inputs', () => {
    expect(() => toInteger(1.2, 'tokenId')).toThrow('tokenId must be an integer.');
    expect(() => toInteger(Number.POSITIVE_INFINITY, 'tokenId')).toThrow('tokenId must be an integer.');
    expect(() => toInteger('abc', 'tokenId')).toThrow('tokenId must be an integer.');
  });

  it('rejects negative uint inputs before contract writes', () => {
    expect(toNonNegativeInteger(0, 'tokenId')).toBe(0n);
    expect(() => toNonNegativeInteger('-1', 'tokenId')).toThrow(
      'tokenId must be greater than or equal to 0.',
    );
  });

  it('rejects non-positive integer inputs where zero is unsafe', () => {
    expect(toPositiveInteger('1', 'duration')).toBe(1n);
    expect(() => toPositiveInteger(0, 'duration')).toThrow('duration must be greater than 0.');
    expect(() => toPositiveInteger(-1, 'duration')).toThrow('duration must be greater than 0.');
  });

  it('normalizes amount inputs to wei', () => {
    expect(toWei(5n)).toBe(5n);
    expect(toWei('1')).toBe(1_000_000_000_000_000_000n);
    expect(toWei(0.5)).toBe(500_000_000_000_000_000n);
  });

  it('allows zero money amounts when zero is a meaningful contract value', () => {
    expect(toNonNegativeWei('0', 'price')).toBe(0n);
    expect(toNonNegativeWei('1', 'price')).toBe(1_000_000_000_000_000_000n);
    expect(() => toNonNegativeWei('-0.1', 'price')).toThrow(
      'price must be greater than or equal to 0.',
    );
  });

  it('rejects non-positive money amounts before payment writes', () => {
    expect(toPositiveWei('1', 'amount')).toBe(1_000_000_000_000_000_000n);
    expect(() => toPositiveWei('0', 'amount')).toThrow('amount must be greater than 0.');
    expect(() => toPositiveWei('-0.1', 'amount')).toThrow('amount must be greater than 0.');
  });
});

describe('wallet resolution', () => {
  it('requires a wallet client for write operations', () => {
    expect(() => requireWallet({ publicClient: createFakePublicClient() })).toThrow(
      'walletClient is required for write operations.',
    );
  });

  it('uses the wallet account when no override account is configured', () => {
    const walletClient = createFakeWalletClient({ account: sellerAccount });
    const result = requireWallet({ publicClient: createFakePublicClient(), walletClient });

    expect(result.account).toBe(sellerAccount);
    expect(result.accountAddress).toBe(sellerAddress);
  });

  it('keeps the wallet account object when it matches the configured account', () => {
    const walletClient = createFakeWalletClient({ account: sellerAccount });
    const result = requireWallet({
      publicClient: createFakePublicClient(),
      walletClient,
      account: sellerAddress,
    });

    expect(result.account).toBe(sellerAccount);
    expect(result.accountAddress).toBe(sellerAddress);
  });

  it('uses a configured account address when it differs from the wallet account object', () => {
    const walletClient = createFakeWalletClient({ account: sellerAccount });
    const result = requireWallet({
      publicClient: createFakePublicClient(),
      walletClient,
      account: buyerAddress,
    });

    expect(result.account).toBe(buyerAddress);
    expect(result.accountAddress).toBe(buyerAddress);
  });
});

describe('chain resolution', () => {
  it('maps public client chain IDs to supported chain names', () => {
    expect(resolveChainFromPublicClient(createFakePublicClient({ chain: mainnet }))).toBe('mainnet');
  });

  it('requires an explicit chain on the public client', () => {
    expect(() => resolveChainFromPublicClient(createFakePublicClient({ chain: undefined }))).toThrow(
      'Unable to resolve chain from publicClient.chain.id.',
    );
  });

  it('rejects unsupported chain IDs', () => {
    expect(() =>
      resolveChainFromPublicClient(createFakePublicClient({ chain: { ...mainnet, id: 999_999 } })),
    ).toThrow('Unsupported chain id: 999999.');
  });
});
