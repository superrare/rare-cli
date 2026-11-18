import { expect } from 'vitest';
import { z } from 'zod';
import { jsonCommand, type BuyerLiveFixture } from './live-harness.js';

const inboxSchema = z.object({ data: z.array(z.object({
  category: z.string(), payload: z.unknown(),
})) });
const payloadSchema = z.object({ orderId: z.string(), transactionHash: z.string(),
  items: z.array(z.object({ sku: z.string(), quantity: z.string() })).min(1),
});

export async function verifyCartPurchaseNotifications(
  fixture: BuyerLiveFixture,
  purchase: { orderId: string; txHash: string },
  expectedItems: number,
): Promise<void> {
  for (const [home, category] of [[fixture.buyerHome, 'cartOrderConfirmed'], [fixture.sellerHome, 'cartSaleReceived']]) {
    if (!home || !category) throw new Error('Notification fixture account is missing.');
    const matches = async (): Promise<z.infer<typeof payloadSchema>[]> => {
      const result: unknown = await jsonCommand(home, ['notifications', 'list', '--per-page', '50']);
      return inboxSchema.parse(result).data.filter(notice => notice.category === category)
        .map(notice => payloadSchema.parse(notice.payload)).filter(payload => payload.orderId === purchase.orderId);
    };
    await expect.poll(async () => (await matches()).length, { timeout: 180_000, interval: 3_000 }).toBe(1);
    const [notice] = await matches();
    expect(notice).toMatchObject({ orderId: purchase.orderId, transactionHash: purchase.txHash });
    expect(notice?.items).toHaveLength(expectedItems);
  }
}
