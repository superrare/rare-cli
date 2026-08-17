import { describe, expect, it } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };
import { listingReleaseMintInputSchema, rareMcpServerMetadata } from '../../src/mcp/server.js';

describe('MCP server metadata', () => {
  it('omits unsupported recipients from RareMinter direct-sale mint inputs', () => {
    expect(Object.keys(listingReleaseMintInputSchema)).not.toContain('recipient');
  });

  it('uses package metadata as the server identity source of truth', () => {
    expect(rareMcpServerMetadata).toEqual({
      name: pkg.name,
      version: pkg.version,
    });
  });
});
