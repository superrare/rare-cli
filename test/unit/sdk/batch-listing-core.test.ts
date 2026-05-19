import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import { ETH_ADDRESS } from '../../../src/contracts/addresses.js';
import {
  planBatchListingRootRegistration,
  shapeBatchListingStatus,
  shouldResolveBatchListingAllowListProof,
  uniqueAddresses,
} from '../../../src/sdk/batch-listing-core.js';
import type { BatchListingRootArtifact } from '../../../src/sdk/batch-listing.js';

const seller = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' satisfies Address;
const collaborator = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' satisfies Address;
const contract = '0x1111111111111111111111111111111111111111' satisfies Address;
const otherContract = '0x2222222222222222222222222222222222222222' satisfies Address;
const root = `0x${'22'.repeat(32)}` as const;
const allowListRoot = `0x${'33'.repeat(32)}` as const;

const artifact = {
  root,
  currency: ETH_ADDRESS,
  amount: '1',
  splitAddresses: [],
  splitRatios: [],
  tokens: [
    { contract, tokenId: '1' },
    { contract, tokenId: '2' },
  ],
} satisfies BatchListingRootArtifact;

describe('batch listing core', () => {
  it('deduplicates addresses without changing first-seen order', () => {
    expect(uniqueAddresses([contract, otherContract, contract])).toEqual([contract, otherContract]);
  });

  it('plans default and explicit root registration splits', () => {
    expect(planBatchListingRootRegistration(artifact, seller)).toEqual({
      splitAddresses: [seller],
      splitRatios: [100],
    });

    expect(planBatchListingRootRegistration({
      ...artifact,
      splitAddresses: [seller, collaborator],
      splitRatios: [70, 30],
    }, seller)).toEqual({
      splitAddresses: [seller, collaborator],
      splitRatios: [70, 30],
    });
  });

  it('rejects root registrations that would produce empty contract proofs', () => {
    expect(() =>
      planBatchListingRootRegistration({
        ...artifact,
        tokens: [{ contract, tokenId: '1' }],
      }, seller),
    ).toThrow(/at least two tokens/);

    expect(() =>
      planBatchListingRootRegistration({
        ...artifact,
        allowList: {
          root: allowListRoot,
          addresses: [seller],
          endTimestamp: '1234',
        },
      }, seller),
    ).toThrow(/Allowlist must contain at least two addresses/);
  });

  it('decides when an active allowlist proof needs API resolution', () => {
    const tokenProof = {
      root,
      contract,
      tokenId: '1',
      proof: [`0x${'44'.repeat(32)}`],
    } as const;
    const allowList = { root: allowListRoot, endTimestamp: 100n };

    expect(shouldResolveBatchListingAllowListProof({
      allowList,
      tokenProof,
      nowTimestamp: 99n,
    })).toBe(true);
    expect(shouldResolveBatchListingAllowListProof({
      allowList,
      tokenProof,
      nowTimestamp: 100n,
    })).toBe(false);
    expect(shouldResolveBatchListingAllowListProof({
      allowList,
      tokenProof: { ...tokenProof, allowListProof: [`0x${'55'.repeat(32)}`] },
      nowTimestamp: 99n,
    })).toBe(false);
  });

  it('shapes active and cancelled status from read results', () => {
    const active = shapeBatchListingStatus({
      root,
      creator: seller,
      listingConfig: {
        currency: ETH_ADDRESS,
        amount: 1n,
        splitRecipients: [seller],
        splitRatios: [100],
        nonce: 3n,
      },
      cancellationNonce: 3n,
      allowList: undefined,
      tokenStatus: { tokenInRoot: true, tokenNonce: 0n },
    });

    expect(active).toMatchObject({
      root,
      seller,
      currencyAddress: ETH_ADDRESS,
      amount: 1n,
      splitRecipients: [seller],
      splitRatios: [100],
      nonce: 3n,
      isEth: true,
      hasListing: true,
      tokenInRoot: true,
      tokenNonce: 0n,
    });

    expect(shapeBatchListingStatus({
      root,
      creator: seller,
      listingConfig: {
        currency: ETH_ADDRESS,
        amount: 1n,
        splitRecipients: [],
        splitRatios: [],
        nonce: 3n,
      },
      cancellationNonce: 4n,
      allowList: undefined,
      tokenStatus: {},
    }).hasListing).toBe(false);
  });
});
