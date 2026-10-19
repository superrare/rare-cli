import { describe, expect, it } from 'vitest';
import { parseEligibilityRuleId, parseEligibilityRuleInput } from '../../../src/commands/eligibility-core.js';

const input = {
  definition: {
    kind: 'PRIMARY_SALE',
    source: { chainId: '11155111', tokenContract: '0x1111111111111111111111111111111111111111' },
    targets: [{ sku: `0x${'22'.repeat(32)}` }],
  },
};

describe('eligibility rule file validation', () => {
  it('keeps the purchase, primary sale and holder rules distinct', () => {
    for (const kind of ['PRIMARY_SALE', 'EVERY_SALE', 'CURRENT_HOLDER']) {
      expect(parseEligibilityRuleInput({ ...input, definition: { ...input.definition, kind } }).definition.kind).toBe(kind);
    }
  });

  it('rejects malformed scopes before API or credential work', () => {
    expect(parseEligibilityRuleId('b299b521-0f42-4b31-8b37-d686afaf7196')).toBe('b299b521-0f42-4b31-8b37-d686afaf7196');
    expect(() => parseEligibilityRuleId('not-a-rule')).toThrow();
    expect(() => parseEligibilityRuleInput({ ...input, definition: { ...input.definition, targets: [] } })).toThrow();
    expect(() => parseEligibilityRuleInput({ ...input, definition: { ...input.definition, targets: [{ sku: 'anything' }] } })).toThrow();
    expect(() => parseEligibilityRuleInput({ ...input, definition: { ...input.definition,
      source: { ...input.definition.source, tokenContract: 'invalid' } } })).toThrow();
    expect(() => parseEligibilityRuleInput({ ...input, effectiveFrom: 'tomorrow' })).toThrow();
  });
});
