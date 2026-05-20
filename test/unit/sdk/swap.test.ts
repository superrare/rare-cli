import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPublicClient, createWalletClient, custom } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { resolveCurrency } from '../../../src/contracts/addresses.js';
import { createRareClient } from '../../../src/sdk/client.js';

const accountAddress = '0x1234567890123456789012345678901234567890' as const;
const rareAddress = resolveCurrency('rare', 'sepolia');
const swapAccount = privateKeyToAccount(
  '0x0000000000000000000000000000000000000000000000000000000000000001',
);

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

  it('rejects non-positive Uniswap API deadlines before quoting', async () => {
    const fetchMock = vi.fn(async (): Promise<Response> => {
      throw new Error('unexpected Uniswap API request');
    });
    const request = vi.fn(async (): Promise<never> => {
      throw new Error('unexpected RPC request');
    });
    vi.stubEnv('UNISWAP_API_KEY', 'test-key');
    vi.stubGlobal('fetch', fetchMock);

    const transport = custom({ request });
    const publicClient = createPublicClient({ chain: sepolia, transport });
    const walletClient = createWalletClient({ account: swapAccount, chain: sepolia, transport });
    const rare = createRareClient({ publicClient, walletClient });

    await expect(rare.swap.buyToken({
      token: rareAddress,
      amountIn: '0.001',
      route: 'uniswap',
      deadline: 0,
    })).rejects.toThrow('deadline must be greater than 0.');

    await expect(rare.swap.sellToken({
      token: rareAddress,
      amountIn: '1',
      route: 'uniswap',
      deadline: '-1',
    })).rejects.toThrow('deadline must be greater than 0.');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});
