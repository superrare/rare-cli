import { describe, expect, it } from 'vitest';
import {
  assertReleaseAllowlistConfigWriteMatches,
  assertReleaseLimitWriteMatches,
  assertReleaseSellerStakingMinimumWriteMatches,
  buildReleaseAllowlistArtifact,
  buildReleaseTokenIdRange,
  getReleaseAllowlistProof,
  normalizeBytes32,
  parseReleaseAllowlistAddresses,
  parseReleaseAllowlistArtifact,
  planReleaseDirectSaleMint,
  planReleaseAllowlistConfig,
  planReleaseMintLimit,
  planReleaseSellerStakingMinimum,
  planReleaseTxLimit,
  preflightReleaseDirectSaleMint,
  shapeReleaseCollectionSupply,
  shapeReleaseDirectSaleConfig,
  verifyReleaseAllowlistProof,
} from '../../../src/sdk/release-core.js';

const COLLECTION_ADDRESS = '0x1111111111111111111111111111111111111111';
const ETH_ADDRESS = '0x0000000000000000000000000000000000000000';
const WALLET_A = '0x1111111111111111111111111111111111111111';
const WALLET_B = '0x2222222222222222222222222222222222222222';
const WALLET_C = '0x3333333333333333333333333333333333333333';
const EXPECTED_ROOT = '0xcbf843e9efe7be41ca4d3a03347d27e7bb96d83ae75b3b36983ad907d2109c65';

describe('RareMinter release core', () => {
  it('builds deterministic allowlist artifacts from JSON wallet arrays', () => {
    const artifact = buildReleaseAllowlistArtifact({
      content: JSON.stringify([WALLET_B, WALLET_A, WALLET_C]),
      format: 'json',
    });

    expect(artifact).toMatchObject({
      version: 1,
      type: 'rare-release-allowlist',
      root: EXPECTED_ROOT,
      count: 3,
      addresses: [WALLET_A, WALLET_B, WALLET_C],
    });
    expect(artifact.entries).toHaveLength(3);
    expect(artifact.entries[0].proof).toEqual([
      '0x2ab0a4443bbea3fbe4d0e1503d11ff1367842fb0c8b28a5c8550f27599a40751',
      '0x37d95e0aa71e34defa88b4c43498bc8b90207e31ad0ef4aa6f5bea78bd25a1ab',
    ]);
  });

  it('parses CSV address columns and JSON address objects', () => {
    expect(parseReleaseAllowlistAddresses({
      content: `user address\n${WALLET_B}\n${WALLET_A}\n`,
      format: 'csv',
    })).toEqual([WALLET_A, WALLET_B]);

    expect(parseReleaseAllowlistAddresses({
      content: JSON.stringify([{ address: WALLET_B }, { ADDRESS: WALLET_A }]),
      format: 'json',
    })).toEqual([WALLET_A, WALLET_B]);
  });

  it('rejects duplicate and malformed allowlist rows', () => {
    expect(() => parseReleaseAllowlistAddresses({
      content: JSON.stringify([WALLET_A, WALLET_A]),
      format: 'json',
    })).toThrow(`Duplicate allowlist address: ${WALLET_A}.`);

    expect(() => parseReleaseAllowlistAddresses({
      content: 'address\nnot-an-address\n',
      format: 'csv',
    })).toThrow('allowlist address at index 0 must be a valid 0x address.');
  });

  it('generates and verifies address proofs', () => {
    const artifact = buildReleaseAllowlistArtifact({
      content: JSON.stringify([WALLET_B, WALLET_A, WALLET_C]),
      format: 'json',
    });
    const proof = getReleaseAllowlistProof(artifact, WALLET_B);

    expect(proof).toEqual({
      root: EXPECTED_ROOT,
      address: WALLET_B,
      leaf: '0x2ab0a4443bbea3fbe4d0e1503d11ff1367842fb0c8b28a5c8550f27599a40751',
      proof: [
        '0xe2c07404b8c1df4c46226425cac68c28d27a766bbddce62309f36724839b22c0',
        '0x37d95e0aa71e34defa88b4c43498bc8b90207e31ad0ef4aa6f5bea78bd25a1ab',
      ],
      valid: true,
    });
    expect(verifyReleaseAllowlistProof({
      root: EXPECTED_ROOT,
      address: WALLET_B,
      proof: proof.proof,
    })).toBe(true);
    expect(verifyReleaseAllowlistProof({
      root: EXPECTED_ROOT,
      address: WALLET_C,
      proof: proof.proof,
    })).toBe(false);
  });

  it('parses artifacts and rejects mismatched roots', () => {
    const artifact = buildReleaseAllowlistArtifact({
      content: JSON.stringify([WALLET_B, WALLET_A]),
      format: 'json',
    });

    expect(parseReleaseAllowlistArtifact(JSON.stringify(artifact)).root).toBe(artifact.root);
    expect(() => parseReleaseAllowlistArtifact(JSON.stringify({
      ...artifact,
      root: EXPECTED_ROOT,
    }))).toThrow('Allowlist artifact root does not match its address list.');
  });

  it('plans RareMinter config writes with non-negative integer inputs', () => {
    expect(planReleaseAllowlistConfig({
      contract: COLLECTION_ADDRESS,
      root: EXPECTED_ROOT,
      endTimestamp: '1778500000',
    })).toEqual({
      contract: COLLECTION_ADDRESS,
      root: EXPECTED_ROOT,
      endTimestamp: 1778500000n,
    });

    expect(planReleaseMintLimit({
      contract: COLLECTION_ADDRESS,
      limit: 0,
    })).toEqual({
      contract: COLLECTION_ADDRESS,
      limit: 0n,
    });

    expect(planReleaseTxLimit({
      contract: COLLECTION_ADDRESS,
      limit: '3',
    })).toEqual({
      contract: COLLECTION_ADDRESS,
      limit: 3n,
    });

    expect(planReleaseSellerStakingMinimum({
      contract: COLLECTION_ADDRESS,
      minimum: '1000000000000000000',
      endTimestamp: 1778500000,
    })).toEqual({
      contract: COLLECTION_ADDRESS,
      minimum: 1000000000000000000n,
      endTimestamp: 1778500000n,
    });
  });

  it('rejects invalid bytes32 roots and negative config values', () => {
    expect(() => normalizeBytes32('0x1234', 'root')).toThrow('root must be a bytes32 hex string.');
    expect(() => planReleaseMintLimit({
      contract: COLLECTION_ADDRESS,
      limit: -1,
    })).toThrow('limit must be greater than or equal to 0.');
  });

  it('verifies RareMinter write readbacks in pure core logic', () => {
    const allowlistPlan = planReleaseAllowlistConfig({
      contract: COLLECTION_ADDRESS,
      root: EXPECTED_ROOT,
      endTimestamp: 1778500000,
    });
    expect(() => assertReleaseAllowlistConfigWriteMatches(allowlistPlan, {
      allowlistRoot: EXPECTED_ROOT,
      allowlistEndTimestamp: 1778500000n,
    })).not.toThrow();
    expect(() => assertReleaseAllowlistConfigWriteMatches(allowlistPlan, {
      allowlistRoot: EXPECTED_ROOT,
      allowlistEndTimestamp: 1778500001n,
    })).toThrow('RareMinter allowlist config write was mined but the verified read did not match.');

    expect(() => assertReleaseLimitWriteMatches('mint limit', 2n, 2n)).not.toThrow();
    expect(() => assertReleaseLimitWriteMatches('mint limit', 2n, 1n)).toThrow(
      'RareMinter mint limit write was mined but the verified read did not match.',
    );

    const stakingPlan = planReleaseSellerStakingMinimum({
      contract: COLLECTION_ADDRESS,
      minimum: 5,
      endTimestamp: 1778500000,
    });
    expect(() => assertReleaseSellerStakingMinimumWriteMatches(stakingPlan, {
      sellerStakingMinimum: 5n,
      sellerStakingMinimumEndTimestamp: 1778500000n,
    })).not.toThrow();
    expect(() => assertReleaseSellerStakingMinimumWriteMatches(stakingPlan, {
      sellerStakingMinimum: 6n,
      sellerStakingMinimumEndTimestamp: 1778500000n,
    })).toThrow('RareMinter seller staking minimum write was mined but the verified read did not match.');
  });

  it('plans direct sale mints with uint8 quantity and optional proof inputs', () => {
    expect(planReleaseDirectSaleMint({
      contract: COLLECTION_ADDRESS,
      quantity: '2',
      price: '0.5',
      proof: [EXPECTED_ROOT],
    })).toEqual({
      contract: COLLECTION_ADDRESS,
      quantity: 2,
      currency: undefined,
      price: 500000000000000000n,
      proof: [EXPECTED_ROOT],
      recipient: undefined,
      autoApprove: true,
    });

    expect(() => planReleaseDirectSaleMint({
      contract: COLLECTION_ADDRESS,
      quantity: 256,
    })).toThrow('quantity must be less than or equal to 255.');
  });

  it('preflights direct sale mint limits, supply, and allowlist proofs', () => {
    const proof = getReleaseAllowlistProof(buildReleaseAllowlistArtifact({
      content: JSON.stringify([WALLET_B, WALLET_A, WALLET_C]),
      format: 'json',
    }), WALLET_A);
    const plan = planReleaseDirectSaleMint({
      contract: COLLECTION_ADDRESS,
      quantity: 1,
      proof: proof.proof,
    });

    expect(preflightReleaseDirectSaleMint({
      status: {
        directSale: shapeReleaseDirectSaleConfig({
          seller: WALLET_B,
          currencyAddress: ETH_ADDRESS,
          price: 10n,
          startTime: 90n,
          maxMints: 2n,
          splitRecipients: [WALLET_B],
          splitRatios: [100],
        }),
        allowlistRoot: EXPECTED_ROOT,
        allowlistEndTimestamp: 200n,
        mintLimit: 2n,
        txLimit: 1n,
        accountMints: 1n,
        accountTxs: 0n,
        supply: shapeReleaseCollectionSupply({
          totalSupply: 1n,
          preparedTokenCount: 2n,
        }),
      },
      plan,
      buyer: WALLET_A,
      nowSeconds: 100n,
    })).toMatchObject({
      contract: COLLECTION_ADDRESS,
      buyer: WALLET_A,
      recipient: WALLET_A,
      quantity: 1,
      currency: ETH_ADDRESS,
      price: 10n,
      totalPrice: 10n,
      allowlistRequired: true,
    });
  });

  it('rejects direct sale mints that fail preflight checks', () => {
    const status = {
      directSale: shapeReleaseDirectSaleConfig({
        seller: WALLET_B,
        currencyAddress: ETH_ADDRESS,
        price: 10n,
        startTime: 90n,
        maxMints: 1n,
        splitRecipients: [WALLET_B],
        splitRatios: [100],
      }),
      allowlistRoot: EXPECTED_ROOT,
      allowlistEndTimestamp: 200n,
      mintLimit: 0n,
      txLimit: 0n,
      supply: shapeReleaseCollectionSupply({
        totalSupply: 2n,
        preparedTokenCount: 2n,
      }),
    };

    expect(() => preflightReleaseDirectSaleMint({
      status,
      plan: planReleaseDirectSaleMint({ contract: COLLECTION_ADDRESS }),
      buyer: WALLET_A,
      nowSeconds: 100n,
    })).toThrow('Release collection is sold out.');

    expect(() => preflightReleaseDirectSaleMint({
      status: {
        ...status,
        supply: shapeReleaseCollectionSupply({ totalSupply: 0n, preparedTokenCount: 2n }),
      },
      plan: planReleaseDirectSaleMint({ contract: COLLECTION_ADDRESS }),
      buyer: WALLET_A,
      nowSeconds: 100n,
    })).toThrow('Active allowlist requires a proof.');

    expect(() => preflightReleaseDirectSaleMint({
      status: {
        ...status,
        allowlistRoot: '0x0000000000000000000000000000000000000000000000000000000000000000',
        supply: shapeReleaseCollectionSupply({ totalSupply: 0n, preparedTokenCount: 2n }),
      },
      plan: planReleaseDirectSaleMint({
        contract: COLLECTION_ADDRESS,
        recipient: WALLET_C,
      }),
      buyer: WALLET_A,
      nowSeconds: 100n,
    })).toThrow('does not support a separate recipient');
  });

  it('builds inclusive direct sale token id ranges', () => {
    expect(buildReleaseTokenIdRange(10n, 12n)).toEqual([10n, 11n, 12n]);
    expect(buildReleaseTokenIdRange(12n, 10n)).toEqual([]);
  });
});
