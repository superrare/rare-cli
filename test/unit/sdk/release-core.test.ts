import { describe, expect, it } from 'vitest';
import { parseEther, parseUnits } from 'viem';
import {
  ZERO_BYTES32,
  assertReleaseContractOwner,
  collectReleaseSplit,
  finalizeReleaseSplitAccumulator,
  normalizeReleasePrice,
  normalizeReleaseStartTime,
  planReleaseConfigure,
  resolveReleaseSplits,
  shapeReleaseStatus,
} from '../../../src/sdk/release-core.js';

const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
const accountAddress = '0x0000000000000000000000000000000000000001' as const;
const recipientAddress = '0x0000000000000000000000000000000000000002' as const;
const erc20Currency = '0x3000000000000000000000000000000000000000' as const;
const collection = '0x1000000000000000000000000000000000000000' as const;
const rareMinter = '0x2000000000000000000000000000000000000000' as const;

describe('release configure planning', () => {
  it('plans ETH release defaults from plain inputs', () => {
    expect(
      planReleaseConfigure(
        {
          contract: collection,
          price: '0.5',
          maxMints: '3',
        },
        {
          accountAddress,
          currencyDecimals: null,
          nowSeconds: 1_700_000_000n,
        },
      ),
    ).toEqual({
      contract: collection,
      currencyAddress: ETH_ADDRESS,
      price: parseEther('0.5'),
      startTime: 1_700_000_000n,
      maxMints: 3n,
      splitRecipients: [accountAddress],
      splitRatios: [100],
    });
  });

  it('plans ERC20 releases with explicit decimals, start time, and splits', () => {
    expect(
      planReleaseConfigure(
        {
          contract: collection,
          currency: erc20Currency,
          price: '1.25',
          startTime: '2024-01-02T00:00:00.000Z',
          maxMints: 10,
          splitAddresses: [accountAddress, recipientAddress],
          splitRatios: [70, 30],
        },
        {
          accountAddress,
          currencyDecimals: 6,
          nowSeconds: 1_700_000_000n,
        },
      ),
    ).toMatchObject({
      currencyAddress: erc20Currency,
      price: parseUnits('1.25', 6),
      startTime: 1_704_153_600n,
      maxMints: 10n,
      splitRecipients: [accountAddress, recipientAddress],
      splitRatios: [70, 30],
    });
  });

  it('rejects invalid release business inputs before shell writes', () => {
    expect(() =>
      planReleaseConfigure(
        { contract: collection, price: '1', maxMints: 0 },
        { accountAddress, currencyDecimals: null, nowSeconds: 1n },
      ),
    ).toThrow('maxMints must be an integer between 1 and 100.');
    expect(() => normalizeReleaseStartTime('-1', 1n)).toThrow(
      'startTime must be greater than or equal to 0.',
    );
    expect(() =>
      resolveReleaseSplits({
        splitAddresses: [accountAddress],
        splitRatios: [50],
        defaultRecipient: accountAddress,
      }),
    ).toThrow('Split ratios must sum to 100 (got 50).');
    expect(() =>
      normalizeReleasePrice({
        currencyAddress: erc20Currency,
        amount: '1',
        currencyDecimals: null,
      }),
    ).toThrow('currencyDecimals is required to normalize ERC20 price amounts.');
  });

  it('parses repeatable split CLI values without mutating prior accumulator state', () => {
    const first = collectReleaseSplit(`${accountAddress}=60`, undefined);
    const second = collectReleaseSplit(`${recipientAddress}=40`, first);

    expect(first).toEqual({ addresses: [accountAddress], ratios: [60] });
    expect(second).toEqual({ addresses: [accountAddress, recipientAddress], ratios: [60, 40] });
    expect(finalizeReleaseSplitAccumulator(second)).toEqual({
      addresses: [accountAddress, recipientAddress],
      ratios: [60, 40],
    });
  });

  it('checks collection ownership as pure release validation', () => {
    expect(() =>
      assertReleaseContractOwner({
        contract: collection,
        accountAddress,
        owner: recipientAddress,
      }),
    ).toThrow(`Connected wallet ${accountAddress} is not the owner of collection ${collection}.`);

    expect(() =>
      assertReleaseContractOwner({
        contract: collection,
        accountAddress,
        owner: accountAddress,
      }),
    ).not.toThrow();
  });
});

describe('release status shaping', () => {
  it('classifies a configured started release as currently mintable', () => {
    expect(
      shapeReleaseStatus({
        rareMinter,
        contract: collection,
        directSale: {
          seller: accountAddress,
          currencyAddress: ETH_ADDRESS,
          price: parseEther('1'),
          startTime: 900n,
          maxMints: 5n,
          splitRecipients: [accountAddress],
          splitRatios: [100],
        },
        allowlist: { root: ZERO_BYTES32, endTimestamp: 0n },
        mintLimit: 0n,
        txLimit: 0n,
        wallet: null,
        walletMints: null,
        walletTxs: null,
        stakingMinimum: { amount: 0n, endTimestamp: 0n },
        totalSupply: 5n,
        maxSupply: 10n,
        currencyDecimals: 18,
        nowSeconds: 1_000n,
      }),
    ).toMatchObject({
      configured: true,
      started: true,
      allowlistActive: false,
      stakingMinimumActive: false,
      remainingSupply: 5n,
      soldOut: false,
      currentlyMintable: true,
      now: 1_000n,
    });
  });

  it('uses limits and unconfigured seller state to mark releases unavailable', () => {
    const limited = shapeReleaseStatus({
      rareMinter,
      contract: collection,
      directSale: {
        seller: accountAddress,
        currencyAddress: ETH_ADDRESS,
        price: parseEther('1'),
        startTime: 900n,
        maxMints: 5n,
        splitRecipients: [accountAddress],
        splitRatios: [100],
      },
      allowlist: { root: `0x${'11'.repeat(32)}`, endTimestamp: 1_500n },
      mintLimit: 2n,
      txLimit: 0n,
      wallet: recipientAddress,
      walletMints: 2n,
      walletTxs: 0n,
      stakingMinimum: { amount: 10n, endTimestamp: 1_500n },
      totalSupply: 10n,
      maxSupply: 10n,
      currencyDecimals: 18,
      nowSeconds: 1_000n,
    });

    expect(limited).toMatchObject({
      allowlistActive: true,
      requiresAllowlist: true,
      stakingMinimumActive: true,
      remainingSupply: 0n,
      soldOut: true,
      currentlyMintable: false,
    });

    const unconfigured = shapeReleaseStatus({
      rareMinter,
      contract: collection,
      directSale: {
        seller: ETH_ADDRESS,
        currencyAddress: ETH_ADDRESS,
        price: 0n,
        startTime: 0n,
        maxMints: 0n,
        splitRecipients: [],
        splitRatios: [],
      },
      allowlist: { root: ZERO_BYTES32, endTimestamp: 0n },
      mintLimit: 0n,
      txLimit: 0n,
      wallet: null,
      walletMints: null,
      walletTxs: null,
      stakingMinimum: { amount: 0n, endTimestamp: 0n },
      totalSupply: null,
      maxSupply: null,
      currencyDecimals: 18,
      nowSeconds: 1_000n,
    });

    expect(unconfigured.configured).toBe(false);
    expect(unconfigured.currentlyMintable).toBe(false);
  });
});
