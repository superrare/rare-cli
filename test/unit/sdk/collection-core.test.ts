import { describe, expect, it } from 'vitest';
import {
  normalizeSovereignCollectionContractType,
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
});
