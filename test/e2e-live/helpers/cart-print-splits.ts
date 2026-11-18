import { expect } from 'vitest';
import type { CartCheckoutReceipt } from '@rareprotocol/rare-sdk';
import { cartAbi, getCartAddress } from '@rareprotocol/rare-sdk/contracts';
import { erc20Abi, isAddressEqual, parseEventLogs, type Address, type Hex } from 'viem';
import type { LiveFixture } from './live-harness.js';

export async function readCollaboratorBalance(fixture: LiveFixture, collaborator: Address): Promise<bigint> {
  return fixture.publicClient.readContract({ address: fixture.usdcAddress, abi: erc20Abi,
    functionName: 'balanceOf', args: [collaborator] });
}

/** Check payouts against settled seller proceeds, excluding buyer production and shipping charges. */
export async function verifyPrintSplits(fixture: LiveFixture, purchase: { txHash: Hex; orderId: Hex },
  receipt: CartCheckoutReceipt, listings: readonly Hex[], collaborator: Address, balanceBefore: bigint): Promise<void> {
  const transaction = await fixture.publicClient.getTransactionReceipt({ hash: purchase.txHash });
  const logs = transaction.logs.filter(log => isAddressEqual(log.address, getCartAddress(fixture.chain)));
  const events = parseEventLogs({ abi: cartAbi, logs, eventName: 'ListingSplitPaid' });
  expect(events).toHaveLength(listings.length * 2);
  let collaboratorTotal = 0n;
  for (const digest of listings) {
    const line = receipt.lines.find(candidate => candidate.listingDigest === digest);
    if (line === undefined) throw new Error('Split merchandise was missing from the indexed receipt.');
    expect(line.settlementCurrency.toLowerCase() === fixture.usdcAddress.toLowerCase()).toBe(true);
    const allocations = events.filter(event => event.args.listingDigest === digest);
    expect(allocations).toHaveLength(2);
    const collaboratorAmount = BigInt(line.amount) * 3000n / 10000n;
    for (const event of allocations) {
      const recipient = event.args.recipient;
      expect([fixture.sellerAddress.toLowerCase(), collaborator.toLowerCase()]).toContain(recipient.toLowerCase());
      const amount = isAddressEqual(recipient, collaborator) ? collaboratorAmount : BigInt(line.amount) - collaboratorAmount;
      expect(event.args).toMatchObject({ orderId: purchase.orderId, lineIndex: BigInt(line.lineIndex),
        amount });
      expect(event.args.currency.toLowerCase()).toBe(fixture.usdcAddress.toLowerCase());
      const indexed = receipt.splitAllocations.find(allocation => allocation.listingDigest === digest && allocation.lineIndex === line.lineIndex && allocation.recipient.toLowerCase() === recipient.toLowerCase());
      expect(indexed?.amount).toBe(amount.toString());
    }
    collaboratorTotal += collaboratorAmount;
  }
  expect(await readCollaboratorBalance(fixture, collaborator) - balanceBefore).toBe(collaboratorTotal);
}
