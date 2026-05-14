import { describe, expect, it } from 'vitest';
import { zeroAddress } from 'viem';
import {
  buildCollectionMintBatchWrite,
  buildCollectionPrepareLazyMintWrite,
  buildCollectionRoyaltyRegistryContractPercentageWrite,
  buildCollectionRoyaltyRegistryContractReceiverWrite,
  buildCollectionRoyaltyRegistryReceiverOverrideWrite,
  buildCollectionRoyaltyRegistryTokenReceiverWrite,
  buildCreateLazySovereignCollectionWrite,
  buildCreateSovereignCollectionWrite,
  defaultRoyaltyInfoSalePrice,
  normalizeLazySovereignCollectionContractType,
  normalizeSovereignCollectionContractType,
  planCollectionBaseUri,
  planCollectionContract,
  planCollectionMintBatch,
  planCollectionPrepareLazyMint,
  planCollectionReceiver,
  planCollectionRoyaltyRegistryContractPercentage,
  planCollectionRoyaltyRegistryContractReceiver,
  planCollectionRoyaltyRegistryReceiverOverride,
  planCollectionRoyaltyRegistryStatus,
  planCollectionRoyaltyRegistryTokenReceiver,
  planCollectionRoyaltyInfo,
  planCollectionToken,
  planCollectionTokenReceiver,
  planCollectionTokenUri,
  planCreateLazySovereignCollection,
  planCreateSovereignCollection,
  shapeCollectionRoyaltyRegistryStatus,
} from '../../../src/sdk/collection-core.js';

const COLLECTION_ADDRESS = '0x1111111111111111111111111111111111111111';
const MINTER_ADDRESS = '0x2222222222222222222222222222222222222222';
const REGISTRY_ADDRESS = '0x3333333333333333333333333333333333333333';
const CREATOR_REGISTRY_ADDRESS = '0x4444444444444444444444444444444444444444';

describe('Sovereign collection core', () => {
  it('normalizes supported contract type aliases', () => {
    expect(normalizeSovereignCollectionContractType(undefined)).toBeUndefined();
    expect(normalizeSovereignCollectionContractType('standard')).toBe('standard');
    expect(normalizeSovereignCollectionContractType('sovereign-nft')).toBe('standard');
    expect(normalizeSovereignCollectionContractType('royalty-guard')).toBe('royalty-guard');
    expect(normalizeSovereignCollectionContractType('deadman')).toBe('deadman-royalty-guard');
  });

  it('rejects unsupported contract types', () => {
    expect(() => normalizeSovereignCollectionContractType('lazy')).toThrow(
      'Unsupported Sovereign collection contract type "lazy".',
    );
  });

  it('plans standard collection creation with optional max supply', () => {
    expect(planCreateSovereignCollection({
      name: 'Test',
      symbol: 'TST',
    })).toEqual({
      name: 'Test',
      symbol: 'TST',
      maxTokens: undefined,
      contractType: 'standard',
      contractTypeReadName: undefined,
    });

    expect(planCreateSovereignCollection({
      name: 'Test',
      symbol: 'TST',
      maxTokens: '100',
      contractType: 'standard',
    })).toEqual({
      name: 'Test',
      symbol: 'TST',
      maxTokens: 100n,
      contractType: 'standard',
      contractTypeReadName: undefined,
    });
  });

  it('requires max supply for non-standard contract types', () => {
    expect(() => planCreateSovereignCollection({
      name: 'Guarded',
      symbol: 'GRD',
      contractType: 'royalty-guard',
    })).toThrow('maxTokens is required when creating a royalty-guard Sovereign collection.');
  });

  it('maps non-standard contract types to factory constant reads', () => {
    expect(planCreateSovereignCollection({
      name: 'Guarded',
      symbol: 'GRD',
      maxTokens: 10,
      contractType: 'royalty-guard',
    }).contractTypeReadName).toBe('ROYALTY_GUARD');

    expect(planCreateSovereignCollection({
      name: 'Deadman',
      symbol: 'DTH',
      maxTokens: 10,
      contractType: 'deadman-royalty-guard',
    }).contractTypeReadName).toBe('ROYALTY_GUARD_DEADMAN');
  });

  it('builds overloaded Sovereign factory write arguments in core', () => {
    expect(buildCreateSovereignCollectionWrite(planCreateSovereignCollection({
      name: 'Test',
      symbol: 'TST',
    }))).toEqual({
      functionName: 'createSovereignNFTContract',
      args: ['Test', 'TST'],
    });

    expect(buildCreateSovereignCollectionWrite(planCreateSovereignCollection({
      name: 'Capped',
      symbol: 'CAP',
      maxTokens: 10,
    }))).toEqual({
      functionName: 'createSovereignNFTContract',
      args: ['Capped', 'CAP', 10n],
    });

    const guarded = planCreateSovereignCollection({
      name: 'Guarded',
      symbol: 'GRD',
      maxTokens: 10,
      contractType: 'royalty-guard',
    });
    expect(buildCreateSovereignCollectionWrite(guarded, `0x${'11'.repeat(32)}`)).toEqual({
      functionName: 'createSovereignNFTContract',
      args: ['Guarded', 'GRD', 10n, `0x${'11'.repeat(32)}`],
    });
    expect(() => buildCreateSovereignCollectionWrite(guarded)).toThrow(
      'contractType is required for royalty-guard Sovereign collection writes.',
    );
  });

  it('normalizes supported lazy contract type aliases', () => {
    expect(normalizeLazySovereignCollectionContractType(undefined)).toBeUndefined();
    expect(normalizeLazySovereignCollectionContractType('lazy')).toBe('lazy');
    expect(normalizeLazySovereignCollectionContractType('standard')).toBe('lazy');
    expect(normalizeLazySovereignCollectionContractType('royalty-guard')).toBe('lazy-royalty-guard');
    expect(normalizeLazySovereignCollectionContractType('deadman')).toBe('lazy-deadman-royalty-guard');
  });

  it('rejects unsupported lazy contract types', () => {
    expect(() => normalizeLazySovereignCollectionContractType('batch')).toThrow(
      'Unsupported Lazy Sovereign collection contract type "batch".',
    );
  });

  it('plans lazy collection creation with required max supply and factory constant read', () => {
    expect(planCreateLazySovereignCollection({
      name: 'Release',
      symbol: 'REL',
      maxTokens: '100',
    })).toEqual({
      name: 'Release',
      symbol: 'REL',
      maxTokens: 100n,
      contractType: 'lazy',
      contractTypeReadName: 'LAZY_SOVEREIGN_NFT',
    });

    expect(planCreateLazySovereignCollection({
      name: 'Guarded Release',
      symbol: 'GRL',
      maxTokens: 100,
      contractType: 'lazy-deadman-royalty-guard',
    }).contractTypeReadName).toBe('LAZY_ROYALTY_GUARD_DEADMAN');
  });

  it('builds Lazy Sovereign factory write arguments in core', () => {
    const plan = planCreateLazySovereignCollection({
      name: 'Release',
      symbol: 'REL',
      maxTokens: '100',
    });
    const contractType = `0x${'11'.repeat(32)}` as const;

    expect(buildCreateLazySovereignCollectionWrite(plan, contractType)).toEqual({
      functionName: 'createSovereignNFTContract',
      args: ['Release', 'REL', 100n, contractType],
    });
  });

  it('plans collection batch mint with positive token count', () => {
    expect(planCollectionMintBatch({
      contract: COLLECTION_ADDRESS,
      baseUri: 'ipfs://batch',
      tokenCount: '25',
    })).toEqual({
      contract: COLLECTION_ADDRESS,
      baseUri: 'ipfs://batch',
      tokenCount: 25n,
    });
  });

  it('rejects non-positive collection batch mint counts', () => {
    expect(() => planCollectionMintBatch({
      contract: COLLECTION_ADDRESS,
      baseUri: 'ipfs://batch',
      tokenCount: 0,
    })).toThrow('tokenCount must be greater than 0.');
  });

  it('plans lazy prepare mint with optional minter', () => {
    expect(planCollectionPrepareLazyMint({
      contract: COLLECTION_ADDRESS,
      baseUri: 'ipfs://lazy',
      tokenCount: 3,
    })).toEqual({
      contract: COLLECTION_ADDRESS,
      baseUri: 'ipfs://lazy',
      tokenCount: 3n,
    });

    expect(planCollectionPrepareLazyMint({
      contract: COLLECTION_ADDRESS,
      baseUri: 'ipfs://lazy',
      tokenCount: '3',
      minter: MINTER_ADDRESS,
    })).toEqual({
      contract: COLLECTION_ADDRESS,
      baseUri: 'ipfs://lazy',
      tokenCount: 3n,
      minter: MINTER_ADDRESS,
    });
  });

  it('rejects non-positive lazy prepare mint counts', () => {
    expect(() => planCollectionPrepareLazyMint({
      contract: COLLECTION_ADDRESS,
      baseUri: 'ipfs://lazy',
      tokenCount: '-1',
    })).toThrow('tokenCount must be greater than 0.');
  });

  it('builds collection mint write arguments in core', () => {
    const batchPlan = planCollectionMintBatch({
      contract: COLLECTION_ADDRESS,
      baseUri: 'ipfs://batch',
      tokenCount: '25',
    });
    expect(buildCollectionMintBatchWrite(batchPlan)).toEqual({
      functionName: 'batchMint',
      args: ['ipfs://batch', 25n],
    });

    const lazyPlan = planCollectionPrepareLazyMint({
      contract: COLLECTION_ADDRESS,
      baseUri: 'ipfs://lazy',
      tokenCount: 3,
    });
    expect(buildCollectionPrepareLazyMintWrite(lazyPlan)).toEqual({
      functionName: 'prepareMint',
      args: ['ipfs://lazy', 3n],
    });

    const minterPlan = planCollectionPrepareLazyMint({
      contract: COLLECTION_ADDRESS,
      baseUri: 'ipfs://lazy',
      tokenCount: 3,
      minter: MINTER_ADDRESS,
    });
    expect(buildCollectionPrepareLazyMintWrite(minterPlan)).toEqual({
      functionName: 'prepareMintWithMinter',
      args: ['ipfs://lazy', 3n, MINTER_ADDRESS],
    });
  });

  it('plans collection token reads with non-negative token IDs', () => {
    expect(planCollectionToken({
      contract: COLLECTION_ADDRESS,
      tokenId: '0',
    })).toEqual({
      contract: COLLECTION_ADDRESS,
      tokenId: 0n,
    });

    expect(() => planCollectionToken({
      contract: COLLECTION_ADDRESS,
      tokenId: '-1',
    })).toThrow('tokenId must be greater than or equal to 0.');
  });

  it('plans royalty info with a default raw sale price quote', () => {
    expect(planCollectionRoyaltyInfo({
      contract: COLLECTION_ADDRESS,
      tokenId: 1,
    })).toEqual({
      contract: COLLECTION_ADDRESS,
      tokenId: 1n,
      salePrice: defaultRoyaltyInfoSalePrice,
    });

    expect(planCollectionRoyaltyInfo({
      contract: COLLECTION_ADDRESS,
      tokenId: 1,
      salePrice: '500',
    }).salePrice).toBe(500n);
  });

  it('plans collection owner write inputs', () => {
    expect(planCollectionReceiver({
      contract: COLLECTION_ADDRESS,
      receiver: MINTER_ADDRESS,
    })).toEqual({
      contract: COLLECTION_ADDRESS,
      receiver: MINTER_ADDRESS,
    });

    expect(planCollectionTokenReceiver({
      contract: COLLECTION_ADDRESS,
      tokenId: '2',
      receiver: MINTER_ADDRESS,
    })).toEqual({
      contract: COLLECTION_ADDRESS,
      tokenId: 2n,
      receiver: MINTER_ADDRESS,
    });
  });

  it('plans royalty registry status reads and omits unset receiver mappings', () => {
    const plan = planCollectionRoyaltyRegistryStatus({
      registry: REGISTRY_ADDRESS,
      contract: COLLECTION_ADDRESS,
      tokenId: '2',
    });

    expect(plan).toEqual({
      registry: REGISTRY_ADDRESS,
      contract: COLLECTION_ADDRESS,
      tokenId: 2n,
      salePrice: defaultRoyaltyInfoSalePrice,
    });

    expect(shapeCollectionRoyaltyRegistryStatus(
      { ...plan, registry: REGISTRY_ADDRESS },
      {
        creatorRegistry: CREATOR_REGISTRY_ADDRESS,
        receiver: MINTER_ADDRESS,
        royaltyPercentage: 10,
        royaltyAmount: 1000n,
        contractPercentageSet: false,
        contractPercentage: 0,
        contractReceiver: zeroAddress,
        tokenReceiver: zeroAddress,
      },
    )).toEqual({
      registry: REGISTRY_ADDRESS,
      contract: COLLECTION_ADDRESS,
      tokenId: 2n,
      salePrice: defaultRoyaltyInfoSalePrice,
      creatorRegistry: CREATOR_REGISTRY_ADDRESS,
      receiver: MINTER_ADDRESS,
      royaltyPercentage: 10,
      royaltyAmount: 1000n,
    });
  });

  it('shapes configured royalty registry overrides', () => {
    const plan = planCollectionRoyaltyRegistryStatus({
      registry: REGISTRY_ADDRESS,
      contract: COLLECTION_ADDRESS,
      tokenId: '2',
      salePrice: '500',
    });

    expect(shapeCollectionRoyaltyRegistryStatus(
      { ...plan, registry: REGISTRY_ADDRESS },
      {
        creatorRegistry: CREATOR_REGISTRY_ADDRESS,
        receiver: MINTER_ADDRESS,
        royaltyPercentage: 15,
        royaltyAmount: 75n,
        contractPercentageSet: true,
        contractPercentage: 15,
        contractReceiver: MINTER_ADDRESS,
        tokenReceiver: COLLECTION_ADDRESS,
      },
    )).toEqual({
      registry: REGISTRY_ADDRESS,
      contract: COLLECTION_ADDRESS,
      tokenId: 2n,
      salePrice: 500n,
      creatorRegistry: CREATOR_REGISTRY_ADDRESS,
      receiver: MINTER_ADDRESS,
      royaltyPercentage: 15,
      royaltyAmount: 75n,
      configuredContractPercentage: 15,
      contractReceiver: MINTER_ADDRESS,
      tokenReceiver: COLLECTION_ADDRESS,
    });
  });

  it('plans and builds royalty registry writes', () => {
    const overridePlan = planCollectionRoyaltyRegistryReceiverOverride({
      registry: REGISTRY_ADDRESS,
      receiver: MINTER_ADDRESS,
    });
    expect(buildCollectionRoyaltyRegistryReceiverOverrideWrite(overridePlan)).toEqual({
      functionName: 'setRoyaltyReceiverOverride',
      args: [MINTER_ADDRESS],
    });

    const contractReceiverPlan = planCollectionRoyaltyRegistryContractReceiver({
      registry: REGISTRY_ADDRESS,
      contract: COLLECTION_ADDRESS,
      receiver: MINTER_ADDRESS,
    });
    expect(buildCollectionRoyaltyRegistryContractReceiverWrite(contractReceiverPlan)).toEqual({
      functionName: 'setRoyaltyReceiverForContract',
      args: [MINTER_ADDRESS, COLLECTION_ADDRESS],
    });

    const tokenReceiverPlan = planCollectionRoyaltyRegistryTokenReceiver({
      registry: REGISTRY_ADDRESS,
      contract: COLLECTION_ADDRESS,
      tokenId: '2',
      receiver: MINTER_ADDRESS,
    });
    expect(buildCollectionRoyaltyRegistryTokenReceiverWrite(tokenReceiverPlan)).toEqual({
      functionName: 'setRoyaltyReceiverForToken',
      args: [MINTER_ADDRESS, COLLECTION_ADDRESS, 2n],
    });

    const percentagePlan = planCollectionRoyaltyRegistryContractPercentage({
      registry: REGISTRY_ADDRESS,
      contract: COLLECTION_ADDRESS,
      percentage: '15',
    });
    expect(buildCollectionRoyaltyRegistryContractPercentageWrite(percentagePlan)).toEqual({
      functionName: 'setPercentageForSetERC721ContractRoyalty',
      args: [COLLECTION_ADDRESS, 15],
    });
  });

  it('rejects royalty registry percentages outside the contract range', () => {
    expect(() => planCollectionRoyaltyRegistryContractPercentage({
      contract: COLLECTION_ADDRESS,
      percentage: '-1',
    })).toThrow('percentage must be between 0 and 100.');

    expect(() => planCollectionRoyaltyRegistryContractPercentage({
      contract: COLLECTION_ADDRESS,
      percentage: '101',
    })).toThrow('percentage must be between 0 and 100.');
  });

  it('plans Lazy Sovereign metadata operations', () => {
    expect(planCollectionBaseUri({
      contract: COLLECTION_ADDRESS,
      baseUri: 'ipfs://next',
    })).toEqual({
      contract: COLLECTION_ADDRESS,
      baseUri: 'ipfs://next',
    });

    expect(planCollectionTokenUri({
      contract: COLLECTION_ADDRESS,
      tokenId: '3',
      tokenUri: 'ipfs://token',
    })).toEqual({
      contract: COLLECTION_ADDRESS,
      tokenId: 3n,
      tokenUri: 'ipfs://token',
    });

    expect(planCollectionContract({ contract: COLLECTION_ADDRESS })).toEqual({
      contract: COLLECTION_ADDRESS,
    });
  });

});
