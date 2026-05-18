import { describe, expect, it } from 'vitest';
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
});

function rareClientWithTokenError(error: Error): TokenReader {
  return {
    token: {
      getTokenInfo: (): ReturnType<TokenReader['token']['getTokenInfo']> => Promise.reject(error),
    },
  };
}
