import { describe, expect, it } from 'vitest';
import { serializeOutputJson } from '../../src/output-core.js';

describe('shared JSON output serialization', () => {
  it('prints a signed Listing artifact without failing on nested bigint terms', () => {
    const artifact = { signedArtifact: { root: { nonce: 0n, deadline: 123456789n },
      entries: [{ listing: { unitPrice: 25000000n, quantity: (1n << 256n) - 1n } }] } };
    expect(serializeOutputJson(artifact)).toBe(JSON.stringify({ signedArtifact: {
      root: { nonce: '0', deadline: '123456789' },
      entries: [{ listing: { unitPrice: '25000000', quantity: ((1n << 256n) - 1n).toString() } }],
    } }, null, 2));
  });
});
