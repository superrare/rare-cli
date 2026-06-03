import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import {
  mcpReadToolNames,
  mcpToolSpecs,
  mcpWriteToolNames,
  sdkPathToMcpToolName,
  selectMcpToolNames,
  serializeForMcp,
  shapeMcpConfigSummary,
  shapeMcpToolAnnotations,
  shapeMcpTransactionResult,
  resolveMcpChain,
} from '../../../src/mcp/core.js';

const privateKey = '0x1111111111111111111111111111111111111111111111111111111111111111';

describe('mcp core helpers', () => {
  it('derives tool inventory by read/write access', () => {
    expect(selectMcpToolNames({ allowWrites: false })).toEqual(mcpReadToolNames);
    expect(selectMcpToolNames({ allowWrites: true })).toEqual([
      ...mcpReadToolNames,
      ...mcpWriteToolNames,
    ]);
    expect(new Set(mcpToolSpecs.map((tool) => tool.name)).size).toBe(mcpToolSpecs.length);
    expect(mcpReadToolNames).toContain('liquid_edition_status');
    expect(mcpReadToolNames).toContain('bridge_quote');
    expect(mcpWriteToolNames).toContain('bridge_send');
    expect(mcpWriteToolNames).toContain('liquid_edition_deploy_multi_curve');
    expect(mcpWriteToolNames).toContain('collection_deploy_erc721');
    expect(mcpWriteToolNames).toContain('collection_deploy_erc1155');
    expect(mcpReadToolNames).toContain('listing_erc1155_release_status');
  });

  it('maps SDK paths to SDK-shaped snake_case tool names', () => {
    expect(sdkPathToMcpToolName('rare.collection.deploy.erc721')).toBe('collection_deploy_erc721');
    expect(sdkPathToMcpToolName('rare.collection.erc1155.createToken')).toBe('collection_erc1155_create_token');
    expect(sdkPathToMcpToolName('rare.listing.erc1155.release.allowlist.setConfig')).toBe('listing_erc1155_release_allowlist_set_config');
    expect(sdkPathToMcpToolName('rare.liquidEdition.deploy.multiCurve')).toBe('liquid_edition_deploy_multi_curve');
    expect(sdkPathToMcpToolName('rare.listing.release.allowlist.setConfig')).toBe('listing_release_allowlist_set_config');
    expect(sdkPathToMcpToolName('rare.swap.quoteBuyToken')).toBe('swap_quote_buy_token');
    expect(sdkPathToMcpToolName('rare.bridge.send')).toBe('bridge_send');
  });

  it('shapes MCP tool annotations by access level', () => {
    expect(shapeMcpToolAnnotations('read')).toEqual({
      readOnlyHint: true,
      destructiveHint: undefined,
      openWorldHint: true,
    });
    expect(shapeMcpToolAnnotations('write')).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    });
  });

  it('resolves MCP chains with config and sepolia fallback', () => {
    expect(resolveMcpChain({ defaultChain: 'base', chains: {} }, 'sepolia')).toBe('sepolia');
    expect(resolveMcpChain({ defaultChain: 'base', chains: {} })).toBe('base');
    expect(resolveMcpChain({ chains: {} })).toBe('sepolia');
    expect(() => resolveMcpChain({ chains: {} }, 'polygon')).toThrow(
      'Unsupported chain "polygon". Supported chains: mainnet, sepolia, base, base-sepolia',
    );
  });

  it('shapes config summaries without exposing secrets', () => {
    const account = privateKeyToAccount(privateKey);
    expect(shapeMcpConfigSummary({
      defaultChain: 'mainnet',
      chains: {
        sepolia: {
          privateKey,
          rpcUrl: 'http://127.0.0.1:8545',
          uniswapApiKey: 'uni-test-key-1234567890',
        },
        base: {
          privateKeyRef: 'op://Vault/base/key',
          accountAddress: '0x0000000000000000000000000000000000000001',
          uniswapApiKeyRef: 'op://Vault/uniswap/key',
        },
      },
    })).toEqual({
      defaultChain: 'mainnet',
      chains: {
        sepolia: {
          hasPrivateKey: true,
          privateKey: '0x1111...1111',
          walletAddress: account.address,
          rpcUrl: 'http://127.0.0.1:8545',
          hasUniswapApiKey: true,
          uniswapApiKey: 'uni-te...7890',
        },
        base: {
          hasPrivateKey: true,
          privateKeyRef: 'op://Vault/base/key',
          accountAddress: '0x0000000000000000000000000000000000000001',
          walletAddress: '0x0000000000000000000000000000000000000001',
          hasUniswapApiKey: true,
          uniswapApiKeyRef: 'op://Vault/uniswap/key',
        },
      },
    });
  });

  it('serializes MCP values and shapes transaction results', () => {
    expect(serializeForMcp({
      amount: 10n,
      keep: 'yes',
      omit: undefined,
      nested: [{ value: 2n }],
    })).toEqual({
      amount: '10',
      keep: 'yes',
      nested: [{ value: '2' }],
    });

    expect(shapeMcpTransactionResult({
      txHash: '0xabc',
      receipt: { blockNumber: 123n, logs: ['omitted'] },
      value: 1n,
    }, { context: 'mint' })).toEqual({
      txHash: '0xabc',
      value: 1n,
      blockNumber: 123n,
      context: 'mint',
    });
  });
});
