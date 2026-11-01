import { describe, expect, it } from 'vitest';
import { zeroAddress } from 'viem';
import { printDropInput, printListingInput } from '../../src/commands/print-input-core.js';

const draft = {
  idempotencyKey: '00000000-0000-4000-8000-000000000001', chainId: '11155111', name: 'Print edition',
  print: { name: 'Print edition', description: 'Archival print', tags: [],
    productionUploadKey: 'a'.repeat(64), images: ['https://example.com/preview.png'], specificationId: 'GLOBAL-FAP-8X12' },
};

describe('print draft input', () => {
  it('accepts canonical decimal Product IDs and rejects unrelated identities', () => {
    const input: unknown = { ...draft, productId: '12345678901234567890' };
    expect(printDropInput.parse(input).productId).toBe('12345678901234567890');
    for (const productId of ['0', '-1', '1.5', '01', draft.idempotencyKey]) {
      const candidate: unknown = { ...draft, productId };
      expect(printDropInput.safeParse(candidate).success).toBe(false);
    }
  });
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

  it('uses the same canonical Product IDs for ordered mint mappings', () => {
    const mintSource = { chainId: '11155111', contract: terms.seller, productIds: ['1', '2345678901234567890'] };
    const input: unknown = { ...terms, mintSource };
    expect(printListingInput.parse(input).mintSource).toEqual(mintSource);
    for (const productIds of [[], ['0'], [terms.optionId]]) {
      const candidate: unknown = { ...terms, mintSource: { ...mintSource, productIds } };
      expect(printListingInput.safeParse(candidate).success).toBe(false);
    }
  });

  it('accepts optional seller-signed splits using basis points', () => {
    const input: unknown = { ...terms, splits: [
      { recipient: terms.seller, basisPoints: 6667 },
      { recipient: `0x${'3'.repeat(40)}`, basisPoints: 3333 },
    ] };
    expect(printListingInput.parse(input)).toEqual(input);
    const unsplit: unknown = { ...terms, splits: [] };
    expect(printListingInput.parse(unsplit)).toEqual(unsplit);
  });

  it.each([
    [{ recipient: 'not-an-address', basisPoints: 10000 }],
    [{ recipient: zeroAddress, basisPoints: 10000 }],
    [{ recipient: terms.seller, basisPoints: 0 }],
    [{ recipient: terms.seller, basisPoints: 10000.1 }],
    [{ recipient: terms.seller, basisPoints: 9999 }],
    [{ recipient: terms.seller, basisPoints: 5000 }, { recipient: terms.seller, basisPoints: 5000 }],
    [{ recipient: `0x${'3'.repeat(40)}`, basisPoints: 10000 }],
    Array.from({ length: 17 }, (_, index) => ({ recipient: `0x${(index + 1).toString(16).padStart(40, '0')}`, basisPoints: 1000 })),
  ].map(splits => ({ splits })))('rejects invalid print payout splits: %j', ({ splits }) => {
    const input: unknown = { ...terms, splits };
    expect(printListingInput.safeParse(input).success).toBe(false);
  });

  it('uses physical print fulfillment without a caller-selected NFT kind', () => {
    const input: unknown = terms;
    expect(printListingInput.parse(input)).toEqual(terms);
    for (const fulfillmentKind of [1, 2, 3, 4, 5, 6]) {
      const candidate: unknown = { ...terms, fulfillmentKind };
      expect(printListingInput.safeParse(candidate).success).toBe(false);
    }
  });
});
