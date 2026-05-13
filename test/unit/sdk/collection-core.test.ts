import { describe, expect, it } from 'vitest';
import {
  buildCreateLazySovereignCollectionWrite,
  buildCreateSovereignCollectionWrite,
  normalizeLazySovereignCollectionContractType,
  normalizeSovereignCollectionContractType,
  planCreateLazySovereignCollection,
  planCreateSovereignCollection,
} from '../../../src/sdk/collection-core.js';

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
});
