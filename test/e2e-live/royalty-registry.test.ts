import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeLive, expectTx, jsonCommand, step } from './live-helpers.js';
import {
  cleanupLiveCliFixture,
  createLiveCliFixture,
  readProtocolRoyaltyRegistry,
  readRoyaltyRegistryReceiverOverride,
  type CollectionRoyaltyRegistryReceiverOverrideResult,
  type CollectionRoyaltyRegistryStatusResult,
  type LiveCliFixture,
  LiveCliFixtureRef,
} from './helpers/live-cli-fixture.js';

const live = new LiveCliFixtureRef<LiveCliFixture>('Live royalty registry CLI fixture has not been initialized.');
const royaltyRegistryStatusFixture = {
  contract: '0xECd22766A90E83474Ef13a1B38D7Ffa6A1d64c57',
  tokenId: '1',
};

describeLive('live royalty registry CLI writes', () => {
  beforeAll(async () => {
    live.set(await createLiveCliFixture());
  });

  afterAll(async () => {
    await cleanupLiveCliFixture(live.optionalValue);
  });

  it('reads legacy royalty registry status for the configured token fixture', async () => {
    const fixture = live.value;
    const registry = await readProtocolRoyaltyRegistry(fixture);
    const status = await step('read legacy royalty registry status', () =>
      jsonCommand<CollectionRoyaltyRegistryStatusResult>(fixture.sellerHome, [
        'collection',
        'royalty',
        'registry',
        'status',
        '--contract',
        royaltyRegistryStatusFixture.contract,
        '--token-id',
        royaltyRegistryStatusFixture.tokenId,
        '--chain',
        fixture.chain,
      ]),
    );

    expect(status.chain).toBe(fixture.chain);
    expect(status.registry.toLowerCase()).toBe(registry.toLowerCase());
    expect(status.contract.toLowerCase()).toBe(royaltyRegistryStatusFixture.contract.toLowerCase());
    expect(status.tokenId).toBe(royaltyRegistryStatusFixture.tokenId);
    expect(status.salePrice).toBe('10000');
    expect(status.creatorRegistry).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(status.receiver).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(status.royaltyPercentage).toBeGreaterThanOrEqual(0);
    expect(status.royaltyPercentage).toBeLessThanOrEqual(100);
    expect(status.royaltyAmount).toMatch(/^\d+$/);
  });

  it('sets a legacy royalty registry receiver override for the connected wallet', async () => {
    const fixture = live.value;
    const registry = await readProtocolRoyaltyRegistry(fixture);
    const result = await step('set royalty registry receiver override', () =>
      jsonCommand<CollectionRoyaltyRegistryReceiverOverrideResult>(fixture.sellerHome, [
        'collection',
        'royalty',
        'registry',
        'set-receiver-override',
        '--receiver',
        fixture.buyerAddress,
        '--chain',
        fixture.chain,
      ]),
    );

    expectTx(result);
    expect(result.registry.toLowerCase()).toBe(registry.toLowerCase());
    expect(result.receiver.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());

    const receiverOverride = await readRoyaltyRegistryReceiverOverride(fixture, registry, fixture.sellerAddress);
    expect(receiverOverride.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());
  });
});
