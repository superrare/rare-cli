import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SaveShippingAddress, ShippingAddress } from '@rareprotocol/rare-sdk';
import { cleanupLiveFixture, createCartLiveFixture, jsonCommand, requireBuyerFixture } from './helpers/live-harness.js';

describe('private shipping address book through the built CLI', () => {
  it('saves multiple addresses, switches defaults, edits without duplicates and protects another account', async () => {
    const fixture = requireBuyerFixture(await createCartLiveFixture({ buyer: true }));
    const firstId = randomUUID();
    const secondId = randomUUID();
    const list = (home = fixture.sellerHome): Promise<ShippingAddress[]> => jsonCommand(home, ['shipping', 'list']);
    const original = await list();
    const originalDefault = original.find(address => address.isDefault);
    const details = { name: 'Address book test', email: 'address-book@example.test', phoneNumber: '+12025550123',
      addressLine1: '123 Test Street', townOrCity: 'New York', stateOrCounty: 'NY', postalOrZipCode: '10001', countryCode: 'US' };
    const save = async (value: SaveShippingAddress, home = fixture.sellerHome): Promise<ShippingAddress> => {
      const file = join(fixture.tempDir, `address-${randomUUID()}.json`);
      await writeFile(file, JSON.stringify(value));
      return jsonCommand(home, ['shipping', 'save', '--input', file]);
    };
    try {
      const owner = await jsonCommand<{ accountId: string }>(fixture.sellerHome, ['profile', 'get']);
      const other = await jsonCommand<{ accountId: string }>(fixture.buyerHome, ['profile', 'get']);
      expect(owner.accountId).not.toBe(other.accountId);
      expect(await save({ id: firstId, label: 'First', details, makeDefault: true })).toMatchObject({ id: firstId, isDefault: true });
      expect(await save({ id: secondId, label: 'Second', details, makeDefault: false })).toMatchObject({ id: secondId, isDefault: false });
      expect((await list()).filter(address => address.isDefault).map(address => address.id)).toEqual([firstId]);
      await save({ id: secondId, label: 'Second', details, makeDefault: true });
      expect((await list()).filter(address => address.isDefault).map(address => address.id)).toEqual([secondId]);
      const edited = { ...details, addressLine1: '456 Updated Street', addressLine2: 'Apartment 2' };
      expect(await save({ id: secondId, label: 'Updated', details: edited })).toMatchObject({ id: secondId, isDefault: true, label: 'Updated', details: edited });
      const addresses = await list();
      expect(addresses).toHaveLength(original.length + 2);
      expect(addresses.filter(address => address.id === secondId)).toHaveLength(1);
      expect((await list(fixture.buyerHome)).some(address => address.id === firstId || address.id === secondId)).toBe(false);
      await expect(save({ id: secondId, details }, fixture.buyerHome)).rejects.toThrow(/Status: 404/u);
      await expect(jsonCommand(fixture.buyerHome, ['shipping', 'delete', '--id', secondId])).rejects.toThrow(/Status: 404/u);
      expect((await list()).find(address => address.id === secondId)).toMatchObject({ label: 'Updated', details: edited });
      await jsonCommand(fixture.sellerHome, ['shipping', 'delete', '--id', secondId]);
      const remaining = await list();
      expect(remaining.some(address => address.id === secondId)).toBe(false);
      expect(remaining.filter(address => address.isDefault)).toHaveLength(1);
    } finally {
      try {
        if (originalDefault) await save({ id: originalDefault.id, label: originalDefault.label, details: originalDefault.details, makeDefault: true });
        for (const address of (await list()).filter(address => address.id === firstId || address.id === secondId)) {
          await jsonCommand(fixture.sellerHome, ['shipping', 'delete', '--id', address.id]);
        }
        expect((await list()).map(address => address.id).sort()).toEqual(original.map(address => address.id).sort());
      } finally {
        await cleanupLiveFixture(fixture);
      }
    }
  }, 300_000);
});
