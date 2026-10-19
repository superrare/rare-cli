import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanupLiveFixture, createCartLiveFixture, jsonCommand } from './helpers/live-harness.js';

describe('print tooling through the built CLI and deployed Rare API', () => {
  it('uploads a private master, creates a print draft and round-trips private saved shipping', async () => {
    const fixture = await createCartLiveFixture();
    const addressId = randomUUID();
    try {
      const specifications = await jsonCommand<{ id: string }[]>(fixture.sellerHome, ['prints', 'specifications']);
      const specification = specifications[0];
      if (specification === undefined) throw new Error('Print tooling requires at least one supported specification.');
      const image = join(fixture.tempDir, 'print.png');
      await writeFile(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9uQAAAAASUVORK5CYII=', 'base64'));
      const master = await jsonCommand<{ access: string; key: string; url?: string }>(fixture.sellerHome, ['uploads', 'upload', image, '--access', 'private']);
      expect(master.access).toBe('private');
      expect(master.url).toBeUndefined();
      const media = await jsonCommand<{ access: string; url: string }>(fixture.sellerHome, ['uploads', 'upload', image, '--access', 'public']);
      expect(media.access).toBe('public');
      const name = `CLI print ${randomUUID()}`;
      const file = join(fixture.tempDir, 'print.json');
      await writeFile(file, JSON.stringify({ idempotencyKey: randomUUID(), chainId: '11155111', name,
        print: { name, description: 'CLI live draft', tags: ['test'], productionUploadKey: master.key,
          images: [media.url], specificationId: specification.id } }));
      const drop = await jsonCommand<{ id: string }>(fixture.sellerHome, ['prints', 'drops', 'create', '--input', file]);
      try {
        expect(await jsonCommand(fixture.sellerHome, ['prints', 'drops', 'get', '--id', drop.id])).toMatchObject({ id: drop.id });
        const address = join(fixture.tempDir, 'shipping.json');
        await writeFile(address, JSON.stringify({ id: addressId, label: 'CLI test', makeDefault: false,
          details: { name: 'CLI test', email: 'cli-test@example.com', phoneNumber: '+12025550123',
            addressLine1: '123 Test Street', townOrCity: 'New York', stateOrCounty: 'NY', postalOrZipCode: '10001', countryCode: 'US' } }));
        const saved = await jsonCommand<{ id: string }[]>(fixture.sellerHome, ['shipping', 'save', '--input', address]);
        expect(saved.some(item => item.id === addressId)).toBe(true);
        const loaded = await jsonCommand<{ id: string }[]>(fixture.sellerHome, ['shipping', 'list']);
        expect(loaded.some(item => item.id === addressId)).toBe(true);
      } finally {
        await jsonCommand(fixture.sellerHome, ['prints', 'drops', 'archive', '--id', drop.id]);
      }
    } finally {
      try {
        const remaining = await jsonCommand<{ id: string }[]>(fixture.sellerHome, ['shipping', 'delete', '--id', addressId]);
        expect(remaining.some(item => item.id === addressId)).toBe(false);
      } finally {
        await cleanupLiveFixture(fixture);
      }
    }
  }, 240_000);
});
