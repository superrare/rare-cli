import { describe, expect, it } from 'vitest';
import { parseBatchAmount, formatBatchAmount, getBatchCurrencyDecimals } from '../src/commands/batch-amounts.js';
import { resolveCurrency } from '../src/contracts/addresses.js';

const mockPublicClient = {
  async readContract() {
    return 8;
  },
} as const;

describe('batch amount helpers', () => {
  it('uses named currency decimals', async () => {
    const eth = resolveCurrency('eth', 'sepolia');
    const rare = resolveCurrency('rare', 'sepolia');
    const usdc = resolveCurrency('usdc', 'sepolia');

    expect(await parseBatchAmount(mockPublicClient as never, 'sepolia', eth, '1.5')).toBe(
      1500000000000000000n,
    );
    expect(await parseBatchAmount(mockPublicClient as never, 'sepolia', rare, '2')).toBe(
      2000000000000000000n,
    );
    expect(await parseBatchAmount(mockPublicClient as never, 'sepolia', usdc, '1.5')).toBe(1500000n);
  });

  it('queries decimals for arbitrary ERC20 addresses', async () => {
    const currency = '0x9999999999999999999999999999999999999999';

    expect(await getBatchCurrencyDecimals(mockPublicClient as never, 'sepolia', currency)).toBe(8);
    expect(await parseBatchAmount(mockPublicClient as never, 'sepolia', currency, '1.23')).toBe(
      123000000n,
    );
    expect(await formatBatchAmount(mockPublicClient as never, 'sepolia', currency, 123000000n)).toBe(
      '1.23',
    );
  });
});
