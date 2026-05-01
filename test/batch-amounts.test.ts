import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBatchAmount, formatBatchAmount, getBatchCurrencyDecimals } from '../src/commands/batch-amounts.js';
import { resolveCurrency } from '../src/contracts/addresses.js';

const mockPublicClient = {
  async readContract() {
    return 8;
  },
} as const;

test('parseBatchAmount uses named currency decimals', async () => {
  const eth = resolveCurrency('eth', 'sepolia');
  const rare = resolveCurrency('rare', 'sepolia');
  const usdc = resolveCurrency('usdc', 'sepolia');

  assert.equal(await parseBatchAmount(mockPublicClient as never, 'sepolia', eth, '1.5'), 1500000000000000000n);
  assert.equal(await parseBatchAmount(mockPublicClient as never, 'sepolia', rare, '2'), 2000000000000000000n);
  assert.equal(await parseBatchAmount(mockPublicClient as never, 'sepolia', usdc, '1.5'), 1500000n);
});

test('batch amount helpers query decimals for arbitrary ERC20 addresses', async () => {
  const currency = '0x9999999999999999999999999999999999999999';

  assert.equal(await getBatchCurrencyDecimals(mockPublicClient as never, 'sepolia', currency), 8);
  assert.equal(await parseBatchAmount(mockPublicClient as never, 'sepolia', currency, '1.23'), 123000000n);
  assert.equal(await formatBatchAmount(mockPublicClient as never, 'sepolia', currency, 123000000n), '1.23');
});
