import type { CartCheckoutReceipt } from '@rareprotocol/rare-sdk';
import { resolveCurrency } from '@rareprotocol/rare-sdk/contracts';
import { getAddress } from 'viem';
import { expect } from 'vitest';

const printMarkupSku = '0xc21e3c86f14bc0a82dec35150929132e5f457b523d7b90f7873e0082a1ab16a2';
const sepoliaTreasury = '0xBa68422A154e459f7b4992a95Ad358d412b6bd1d';

export function assertSepoliaPrintMarkup(receipt: CartCheckoutReceipt, production?: bigint): void {
  const markup = receipt.lines.filter(line => line.sku.toLowerCase() === printMarkupSku);
  expect(markup).toHaveLength(1);
  const line = markup[0];
  if (line === undefined) throw new Error('Expected the print markup settlement line.');
  expect(line.fulfillmentKind).toBe(0);
  expect(getAddress(line.settlementCurrency)).toBe(getAddress(resolveCurrency('usdc', 'sepolia')));
  expect(getAddress(line.paymentRecipient)).toBe(getAddress(sepoliaTreasury));
  if (production !== undefined) expect(BigInt(line.amount)).toBe(production * 5n / 100n);
}
