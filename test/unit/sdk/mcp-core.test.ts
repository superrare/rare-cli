import { describe, expect, it } from 'vitest';
import {
  mcpReadToolNames,
  mcpWriteToolNames,
  resolveMcpChain,
  selectMcpToolNames,
  serializeForMcp,
  shapeMcpConfigSummary,
} from '../../../src/sdk/mcp-core.js';

describe('mcp core helpers', () => {
  it('selects read-only tools by default and write tools only when allowed', () => {
    expect(selectMcpToolNames({ allowWrites: false })).toEqual([...mcpReadToolNames]);
    expect(selectMcpToolNames({ allowWrites: true })).toEqual([
      ...mcpReadToolNames,
      ...mcpWriteToolNames,
    ]);
  });

  it('resolves explicit, configured, and default chains', () => {
    expect(resolveMcpChain({ defaultChain: 'base', chains: {} }, 'sepolia')).toBe('sepolia');
    expect(resolveMcpChain({ defaultChain: 'base', chains: {} })).toBe('base');
    expect(resolveMcpChain({ chains: {} })).toBe('sepolia');
    expect(() => resolveMcpChain({ chains: {} }, 'polygon')).toThrow(
      'Unsupported chain "polygon".',
    );
  });

  it('shapes masked config summaries with wallet addresses', () => {
    expect(shapeMcpConfigSummary({
      defaultChain: 'sepolia',
      chains: {
        sepolia: {
          privateKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
          rpcUrl: 'https://rpc.example',
        },
      },
    })).toEqual({
      defaultChain: 'sepolia',
      chains: {
        sepolia: {
          hasPrivateKey: true,
          privateKey: '0x0000...0001',
          walletAddress: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
          rpcUrl: 'https://rpc.example',
        },
      },
    });
  });

  it('serializes bigint-rich SDK results into JSON-safe structures', () => {
    expect(serializeForMcp({
      amount: 1n,
      nested: [{ tokenId: 2n, omit: undefined }],
      keep: null,
    })).toEqual({
      amount: '1',
      nested: [{ tokenId: '2' }],
      keep: null,
    });
  });
});
