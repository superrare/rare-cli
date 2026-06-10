import { describe, expect, it, vi } from 'vitest';
import { readTokenInfo } from '../../../src/commands/status.js';

const contract = '0x1000000000000000000000000000000000000000' as const;
type TokenReader = Parameters<typeof readTokenInfo>[0];

describe('status command token reads', () => {
  it('returns null for explicit nonexistent token errors', async () => {
    const rare = rareClientWithTokenError(
      new Error('execution reverted: ERC721: owner query for nonexistent token'),
    );

    await expect(readTokenInfo(rare, contract, '1')).resolves.toBeNull();
  });

  it('surfaces unexpected token read errors', async () => {
    const error = new Error('RPC request failed');
    const rare = rareClientWithTokenError(error);

    await expect(readTokenInfo(rare, contract, '1')).rejects.toBe(error);
  });

  it('rejects malformed token IDs before reading token status', async () => {
    const rare = rareClientWithTokenError(new Error('unexpected token read'));

    await expect(readTokenInfo(rare, contract, 'abc')).rejects.toThrow('tokenId must be an integer.');
    expect(rare.token.status).not.toHaveBeenCalled();
  });
});

function rareClientWithTokenError(error: Error): TokenReader {
  return {
    token: {
      status: vi.fn((): ReturnType<TokenReader['token']['status']> => Promise.reject(error)),
    },
  };
}
