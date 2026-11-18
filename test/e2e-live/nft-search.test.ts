import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseJsonStdout, runCli, withTempHome } from '../helpers/cli.js';

const pageSchema = z.object({
  data: z.array(z.object({ universalTokenId: z.string(), chainId: z.string() })),
  pagination: z.object({ totalCount: z.number(), perPage: z.number() }),
});

describe('random NFT search through the built CLI and real API', () => {
  it('returns public random NFTs with the requested chain and result limits', async () => {
    const api = process.env.RARE_ACCOUNT_TEST_API_URL;
    if (!api) throw new Error('Missing RARE_ACCOUNT_TEST_API_URL');

    await withTempHome(async home => {
      const search = async (options: string[]): Promise<z.infer<typeof pageSchema>> => {
        const result = await runCli(
          ['--json', 'search', 'nfts', '--chain', 'mainnet', '--sort-by', 'random', ...options],
          { home, env: { RARE_API_URL: api }, timeoutMs: 30000 },
        );
        expect(result.code, result.stderr).toBe(0);
        return pageSchema.parse(parseJsonStdout(result));
      };

      const sample = await search(['--per-page', '1']);
      expect(sample.data).toHaveLength(1);
      expect(sample.data[0]?.chainId).toBe('1');

      const text = await search(['--query', 'art', '--per-page', '3']);
      expect(text.data).toHaveLength(3);
      expect(text.data.every(nft => nft.chainId === '1')).toBe(true);
      expect(text.pagination.perPage).toBe(3);

      const invalid = await runCli(
        ['--json', 'search', 'nfts', '--sort-by', 'invalid'],
        { home, env: { RARE_API_URL: api }, timeoutMs: 10000 },
      );
      expect(invalid.code).not.toBe(0);
    });
  }, 60000);
});
