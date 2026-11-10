import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { ConciergePrintDraft, PrintDrop } from '@rareprotocol/rare-sdk';
import { cleanupLiveFixture, createCartLiveFixture, jsonCommand, requireBuyerFixture } from './helpers/live-harness.js';
import { downloadTestImage } from './helpers/test-image.js';
import { deployErc721Collection, mintToken } from './helpers/live-erc721.js';

it('lets a Cart administrator set up a print that only its creator can publish', async () => {
  const fixture = requireBuyerFixture(await createCartLiveFixture({ buyer: true }));
  const adminHome = fixture.sellerHome;
  const creatorHome = fixture.buyerHome;
  let dropId: string | undefined;
  try {
    expect(fixture.chain).toBe('sepolia');
    const creator = await jsonCommand<{ accountId: string }>(creatorHome, ['profile', 'get']);
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
    const input = join(fixture.tempDir, 'concierge.json');
    const name = `Concierge print ${randomUUID()}`;
    const listingTerms = {
      availableQuantity: '3', maxQuantityPerCheckout: '2',
      deadline: String(Math.floor(Date.now() / 1000) + 3600),
    };
    await writeFile(input, JSON.stringify({
      creatorUserId: creator.accountId,
      drop: {
        chainId: String(fixture.chainId), name,
        print: { name, description: '', tags: ['test'], productionUploadKey: master.key,
          images: [preview.url], specificationId: 'GLOBAL-FAP-8X12', sourceUniversalTokenId },
      },
      displayPriceUsdCents: '100', listing: listingTerms,
    }));
    const setup = ['prints', 'concierge', 'create', '--input', input];
    await expect(jsonCommand(creatorHome, setup)).rejects.toThrow(/Status: 403/u);
    const draft = await jsonCommand<ConciergePrintDraft>(adminHome, setup);
    dropId = draft.dropId;
    expect(await jsonCommand(adminHome, setup)).toEqual(draft);
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
    const review = ['prints', 'listing', 'review', '--preparation-id', draft.preparationId ?? '', '--chain', fixture.chain];
    await expect(jsonCommand(adminHome, review)).rejects.toThrow(/Status: 404/u);
    const preparation = await jsonCommand<{ id: string; option_id: string }>(creatorHome, review);
    expect(preparation).toMatchObject({ id: draft.preparationId, option_id: draft.option.id });
    const published = await jsonCommand<{ signedArtifact: { entries: { listingDigest: string }[] } }>(creatorHome, [
      'prints', 'listing', 'publish', '--preparation-id', preparation.id, '--chain', fixture.chain, '--yes',
    ]);
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
