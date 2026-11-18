import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { PrintDrop } from '@rareprotocol/rare-sdk';
import { z } from 'zod';
import { cleanupLiveFixture, createCartLiveFixture, jsonCommand, requireBuyerFixture } from './helpers/live-harness.js';
import { downloadTestImage } from './helpers/test-image.js';
import { deployErc721Collection, mintToken } from './helpers/live-erc721.js';

const conciergeDraftSchema = z.object({
  data: z.object({
    dropId: z.uuid(),
    option: z.object({ id: z.uuid(), metadata: z.record(z.string(), z.unknown()) }).passthrough(),
    listing: z.object({ optionId: z.uuid(), listingSalt: z.string(), seller: z.string() }).passthrough(),
    preparationId: z.uuid(),
  }),
});

it('lets an operator with the Pipelines support key set up a print that only its creator can publish', async () => {
  const origin = URL.parse(process.env['PIPELINES_BASE_URL'] ?? '');
  const supportKey = process.env['GQL_API_KEY'];
  if (origin === null || origin.username !== '' ||
      origin.password !== '' || origin.search !== '' || origin.hash !== '' ||
      (origin.protocol !== 'https:' &&
        !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))) ||
      supportKey === undefined || supportKey.trim() === '') {
    throw new Error('Set PIPELINES_BASE_URL (HTTPS or loopback) and GQL_API_KEY for the concierge live test.');
  }
  const endpoint = new URL('/prints/concierge/drafts', origin);
  for (const invalidKey of [undefined, randomUUID()]) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
        ...(invalidKey === undefined ? {} : { 'x-superrare-support-secret': invalidKey }) },
      body: '{}', redirect: 'error', signal: AbortSignal.timeout(15_000),
    });
    expect(response.status).toBe(403);
  }
  const fixture = requireBuyerFixture(await createCartLiveFixture({ buyer: true }));
  const adminHome = fixture.sellerHome;
  const creatorHome = fixture.buyerHome;
  let dropId: string | undefined;
  try {
    expect(fixture.chain).toBe('sepolia');
    const [operator, creator] = await Promise.all([
      jsonCommand<{ accountId: string }>(adminHome, ['profile', 'get']),
      jsonCommand<{ accountId: string }>(creatorHome, ['profile', 'get']),
    ]);
    const artist = { ...fixture, sellerHome: creatorHome, sellerAddress: fixture.buyerAddress };
    const collection = await deployErc721Collection(artist, '1');
    const token = await mintToken(artist, collection.contract);
    const sourceUniversalTokenId = `${fixture.chainId}-${token.contract.toLowerCase()}-${token.tokenId}`;
    const image = join(fixture.tempDir, 'concierge-print.jpg');
    await writeFile(image, await downloadTestImage());
    const master = await jsonCommand<{ key: string }>(adminHome, [
      'uploads', 'upload', image, '--access', 'private', '--content-type', 'image/jpeg',
    ]);
    const preview = await jsonCommand<{ url: string }>(adminHome, [
      'uploads', 'upload', image, '--access', 'public', '--content-type', 'image/jpeg',
    ]);
    const name = `Concierge print ${randomUUID()}`;
    const listingTerms = {
      availableQuantity: '3', maxQuantityPerCheckout: '2',
      deadline: String(Math.floor(Date.now() / 1000) + 3600),
    };
    const body = JSON.stringify({
      operatorUserId: operator.accountId,
      creatorUserId: creator.accountId,
      drop: {
        chainId: String(fixture.chainId), idempotencyKey: randomUUID(), name,
        print: { name, description: '', tags: ['test'], productionUploadKey: master.key,
          images: [preview.url], specificationId: 'GLOBAL-FAP-8X12', sourceUniversalTokenId },
      },
      displayPriceUsdCents: '100',
      listing: { ...listingTerms, listingSalt: `0x${randomBytes(32).toString('hex')}` },
    });
    const createDraft = async (): Promise<z.infer<typeof conciergeDraftSchema>['data']> => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-superrare-support-secret': supportKey },
        body, redirect: 'error', signal: AbortSignal.timeout(30_000),
      });
      expect(response.status).toBe(201);
      const payload: unknown = await response.json();
      return conciergeDraftSchema.parse(payload).data;
    };
    const draft = await createDraft();
    dropId = draft.dropId;
    expect(await createDraft()).toEqual(draft);
    const owned = await jsonCommand<PrintDrop>(creatorHome, ['prints', 'drops', 'get', '--id', dropId]);
    expect(owned.status).toBe('DRAFT');
    expect(owned.options).toEqual([draft.option]);
    expect(draft.option.metadata).toMatchObject({ displayPriceUsdCents: '100' });
    expect(draft.listing).toMatchObject({ ...listingTerms, optionId: draft.option.id });
    expect(draft.listing?.listingSalt).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(draft.listing?.seller.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());
    expect(draft.preparationId).toBeTruthy();
    expect(owned.metadata).toMatchObject({ productionUploadKey: master.key, images: [preview.url], sourceUniversalTokenId });
    await expect(jsonCommand(adminHome, ['prints', 'drops', 'get', '--id', dropId])).rejects.toThrow(/Status: 404/u);
    const review = ['prints', 'listing', 'review', '--preparation-id', draft.preparationId, '--chain', fixture.chain];
    await expect(jsonCommand(adminHome, review)).rejects.toThrow(/Status: 404/u);
    const preparation = await jsonCommand<{ id: string; option_id: string }>(creatorHome, review);
    expect(preparation).toMatchObject({ id: draft.preparationId, option_id: draft.option.id });
    const publish = [
      'prints', 'listing', 'publish', '--preparation-id', preparation.id, '--chain', fixture.chain, '--yes',
    ];
    await expect(jsonCommand(adminHome, publish)).rejects.toThrow(/Status: 404/u);
    const published = await jsonCommand<{ signedArtifact: { entries: { listingDigest: string }[] } }>(creatorHome, publish);
    expect(published.signedArtifact.entries).toHaveLength(1);
    await expect.poll(async () => (await jsonCommand<PrintDrop>(creatorHome, ['prints', 'drops', 'get', '--id', dropId ?? ''])).status)
      .toBe('PUBLISHED');
  } finally {
    try {
      if (dropId) await jsonCommand(creatorHome, ['prints', 'drops', 'archive', '--id', dropId]);
    } finally {
      await cleanupLiveFixture(fixture);
    }
  }
}, 360_000);
