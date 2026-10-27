import { describe, expect, it } from 'vitest';
import { printDropInput, printListingInput } from '../../src/commands/print-input-core.js';

const draft = {
  idempotencyKey: '00000000-0000-4000-8000-000000000001', chainId: '11155111', name: 'Print edition',
  print: { name: 'Print edition', description: 'Archival print', tags: [],
    productionUploadKey: 'a'.repeat(64), images: ['https://example.com/preview.png'], specificationId: 'archival-a4' },
};

describe('print draft input', () => {
  it('accepts a private production file and optional NFT source attribution', () => {
    const input: unknown = draft;
    expect(printDropInput.parse(input)).toEqual(draft);
    const attributed: unknown = { ...draft, print: { ...draft.print, sourceUniversalTokenId: `11155111-0x${'1'.repeat(40)}-1` } };
    expect(printDropInput.parse(attributed)).toEqual(attributed);
  });

  it('requires the chain and physical print details for every draft', () => {
    const inputs: unknown[] = [{ ...draft, chainId: undefined }, { ...draft, print: undefined }];
    for (const input of inputs) expect(printDropInput.safeParse(input).success).toBe(false);
  });

  it('rejects NFT-only creation and public production master URLs', () => {
    const inputs: unknown[] = [
      { idempotencyKey: draft.idempotencyKey, name: draft.name, universalTokenId: `11155111-0x${'1'.repeat(40)}-1` },
      { ...draft, universalTokenId: 'legacy-source' },
      { ...draft, print: { ...draft.print, productionImageUri: 'https://example.com/master.png' } },
      { ...draft, print: { ...draft.print, productionUploadKey: 'https://example.com/master.png' } },
    ];
    for (const input of inputs) expect(printDropInput.safeParse(input).success).toBe(false);
  });
});

describe('print listing input', () => {
  const terms = { optionId: '00000000-0000-4000-8000-000000000001', seller: `0x${'1'.repeat(40)}`,
    listingSalt: `0x${'2'.repeat(64)}`, deadline: '2000000000', availableQuantity: '10' };

  it('uses physical print fulfillment without a caller-selected NFT kind', () => {
    const input: unknown = terms;
    expect(printListingInput.parse(input)).toEqual(terms);
    for (const fulfillmentKind of [1, 2, 3, 4, 5, 6]) {
      const candidate: unknown = { ...terms, fulfillmentKind };
      expect(printListingInput.safeParse(candidate).success).toBe(false);
    }
  });
});
