import { describe, expect, it } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };
import { rareMcpServerMetadata } from '../../src/mcp/server.js';

describe('MCP server metadata', () => {
  it('uses package metadata as the server identity source of truth', () => {
    expect(rareMcpServerMetadata).toEqual({
      name: pkg.name,
      version: pkg.version,
    });
  });
});
