import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPublicClient, custom } from 'viem';
import { sepolia } from 'viem/chains';
import { resolveCurrency } from '../../../src/contracts/addresses.js';
import { createRareClient } from '../../../src/sdk/client.js';

const accountAddress = '0x1234567890123456789012345678901234567890' as const;
const rareAddress = resolveCurrency('rare', 'sepolia');

describe('Swap SDK fallback handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('surfaces canonical local quote failures instead of falling back to Uniswap', async () => {
    const fetchMock = vi.fn(async (): Promise<Response> => {
      throw new Error('unexpected Uniswap fallback');
    });
    vi.stubEnv('UNISWAP_API_KEY', 'test-key');
    vi.stubGlobal('fetch', fetchMock);

    const publicClient = createPublicClient({
      chain: sepolia,
      transport: custom({
        async request({ method }) {
          if (method === 'eth_call') {
            throw new Error('bad local quoter');
          }

          throw new Error(`unexpected RPC method: ${method}`);
        },
      }),
    });
    const rare = createRareClient({
      publicClient,
      account: accountAddress,
    });

    await expect(rare.swap.quoteBuyToken({
      token: rareAddress,
      amountIn: '0.001',
    })).rejects.toThrow('bad local quoter');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
