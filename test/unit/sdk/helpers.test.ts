import { describe, expect, it } from 'vitest';
import type { PublicClient, WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet } from 'viem/chains';
import {
  requireWallet,
  resolveChainFromPublicClient,
  toInteger,
  toNonNegativeInteger,
  toNonNegativeWei,
  toPositiveInteger,
  toPositiveWei,
  toSafeIntegerNumber,
  toWei,
} from '../../../src/sdk/helpers.js';

const sellerAccount = privateKeyToAccount(
  '0x0000000000000000000000000000000000000000000000000000000000000001',
);
const sellerAddress = sellerAccount.address;
const buyerAddress = privateKeyToAccount(
  '0x0000000000000000000000000000000000000000000000000000000000000002',
).address;

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

  it('rejects unsafe numeric integers', () => {
    expect(toInteger(Number.MAX_SAFE_INTEGER, 'tokenId')).toBe(9_007_199_254_740_991n);
    expect(toInteger('9007199254740993', 'tokenId')).toBe(9_007_199_254_740_993n);
    expect(() => toInteger(Number.MAX_SAFE_INTEGER + 1, 'tokenId')).toThrow('string or bigint');
  });

  it('rejects integer strings that cannot round-trip through number', () => {
    expect(toSafeIntegerNumber('1714500000', 'deadline')).toBe(1_714_500_000);
    expect(() => toSafeIntegerNumber('9007199254740993', 'deadline')).toThrow('safe JavaScript integer');
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

  it('rejects unsafe numeric amounts', () => {
    expect(toWei('1.000000000000000001')).toBe(1_000_000_000_000_000_001n);
    expect(toWei(0.1)).toBe(100_000_000_000_000_000n);
    expect(() => toWei(Number.MAX_SAFE_INTEGER + 1)).toThrow('string or bigint');
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
    expect(() => requireWallet({ publicClient: publicClient() })).toThrow(
      'walletClient is required for write operations.',
    );
  });

  it('uses the wallet account when no override account is configured', () => {
    const result = requireWallet({ publicClient: publicClient(), walletClient: walletClient(sellerAccount) });

    expect(result.account).toBe(sellerAccount);
    expect(result.accountAddress).toBe(sellerAddress);
  });

  it('keeps the wallet account object when it matches the configured account', () => {
    const result = requireWallet({
      publicClient: publicClient(),
      walletClient: walletClient(sellerAccount),
      account: sellerAddress,
    });

    expect(result.account).toBe(sellerAccount);
    expect(result.accountAddress).toBe(sellerAddress);
  });

  it('uses a configured account address when it differs from the wallet account object', () => {
    const result = requireWallet({
      publicClient: publicClient(),
      walletClient: walletClient(sellerAccount),
      account: buyerAddress,
    });

    expect(result.account).toBe(buyerAddress);
    expect(result.accountAddress).toBe(buyerAddress);
  });
});

describe('chain resolution', () => {
  it('maps public client chain IDs to supported chain names', () => {
    expect(resolveChainFromPublicClient(publicClient(mainnet))).toBe('mainnet');
  });

  it('requires an explicit chain on the public client', () => {
    expect(() => resolveChainFromPublicClient(publicClient(undefined))).toThrow(
      'Unable to resolve chain from publicClient.chain.id.',
    );
  });

  it('rejects unsupported chain IDs', () => {
    expect(() =>
      resolveChainFromPublicClient(publicClient({ ...mainnet, id: 999_999 })),
    ).toThrow('Unsupported chain id: 999999.');
  });
});

function publicClient(chain?: PublicClient['chain']): PublicClient {
  return (chain ? { chain } : {}) as PublicClient;
}

function walletClient(account: WalletClient['account']): WalletClient {
  return { account } as WalletClient;
}
