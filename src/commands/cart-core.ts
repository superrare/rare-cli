import { z } from 'zod';
import { cartFulfillmentKinds, type CartSellerFulfillmentKind, type CartSplit } from '@rareprotocol/rare-sdk';
import { getAddress, isAddress, isAddressEqual, isHex, parseUnits, zeroAddress, type Address, type Hex } from 'viem';

export type CartCliResult<T> =
  | { isValid: true; value: T }
  | { isValid: false; issues: string[] };

export type CartCliCurrency = 'eth' | 'rare' | 'usdc' | Address;

export type CartListingFile = {
  deadline: bigint;
  listings: Array<{
    sku: Hex;
    settlementCurrency: CartCliCurrency;
    unitPrice: string;
    quantity: bigint;
    fulfillmentKind?: CartSellerFulfillmentKind;
    paymentRecipient?: Address;
    splits?: CartSplit[];
  }>;
};

export type CartListingSelection = {
  kind: 'listing';
  listingDigest: Hex;
  quantity: bigint;
};

export function parseCartListingFile(content: string): CartCliResult<CartListingFile> {
  const document = parseJsonDocument(content);
  if (!document.isValid) return document;
  const parsed = document.value;

  if (!isRecord(parsed)) {
    return invalid('input must be a JSON object.');
  }

  const extraFields = Object.keys(parsed).filter((key) => key !== 'deadline' && key !== 'listings');
  if (extraFields.length > 0) {
    return invalid(`input contains unsupported field${extraFields.length === 1 ? '' : 's'}: ${extraFields.join(', ')}.`);
  }

  const deadline = parseDeadline(parsed.deadline);
  if (!deadline.isValid) return deadline;
  if (!Array.isArray(parsed.listings) || parsed.listings.length === 0) {
    return invalid('listings must be a non-empty array.');
  }

  const listings = parsed.listings.map((value, index) => parseListing(value, index));
  const issues = listings.flatMap((result) => result.isValid ? [] : result.issues);
  if (issues.length > 0) return { isValid: false, issues };

  return {
    isValid: true,
    value: {
      deadline: deadline.value,
      listings: listings.map((result) => {
        if (!result.isValid) throw new Error('unreachable: invalid Cart listing survived validation.');
        return result.value;
      }),
    },
  };
}

export function parseCartListingSelections(values: readonly string[]): CartCliResult<CartListingSelection[]> {
  if (values.length === 0) {
    return invalid('--listing must be provided at least once.');
  }

  const selections = values.map((value, index) => parseSelection(value, index));
  const issues = selections.flatMap((result) => result.isValid ? [] : result.issues);
  if (issues.length > 0) return { isValid: false, issues };

  const parsed = selections.map((result) => {
    if (!result.isValid) throw new Error('unreachable: invalid Cart selection survived validation.');
    return result.value;
  });
  const duplicate = parsed.find((selection, index) =>
    parsed.findIndex((candidate) => candidate.listingDigest === selection.listingDigest) !== index);
  if (duplicate !== undefined) {
    return invalid(`--listing contains duplicate listing ${duplicate.listingDigest}.`);
  }

  return { isValid: true, value: parsed };
}

export function parseCartCliCurrency(value: string, field: string): CartCliResult<CartCliCurrency> {
  const normalized = value.toLowerCase();
  if (normalized === 'eth' || normalized === 'rare' || normalized === 'usdc') {
    return { isValid: true, value: normalized };
  }
  if (!isAddress(value)) {
    return invalid(`${field} must be eth, rare, usdc, or a valid ERC-20 address.`);
  }
  return { isValid: true, value: getAddress(value) };
}

export function parseCartAmount(value: string, decimals: number, field: string): CartCliResult<bigint> {
  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    return invalid(`${field} must be a non-negative decimal amount.`);
  }
  const fractionalDigits = value.split('.')[1]?.length ?? 0;
  if (fractionalDigits > decimals) {
    return invalid(`${field} has more than ${decimals} decimal places.`);
  }
  try {
    return { isValid: true, value: parseUnits(value, decimals) };
  } catch {
    return invalid(`${field} has more than ${decimals} decimal places.`);
  }
}

export function parseCartAddress(value: string | undefined, field: string): CartCliResult<Address | undefined> {
  if (value === undefined) return { isValid: true, value: undefined };
  return isAddress(value)
    ? { isValid: true, value: getAddress(value) }
    : invalid(`${field} must be a valid EVM address.`);
}

export function unwrapCartCliResult<T>(result: CartCliResult<T>): T {
  if (result.isValid) return result.value;
  throw new Error(result.issues.join(' '));
}

function parseListing(value: unknown, index: number): CartCliResult<CartListingFile['listings'][number]> {
  const field = `listings[${index}]`;
  if (!isRecord(value)) return invalid(`${field} must be an object.`);
  const allowedFields = new Set([
    'sku',
    'settlementCurrency',
    'unitPrice',
    'quantity',
    'fulfillmentKind',
    'paymentRecipient',
    'splits',
  ]);
  const extraFields = Object.keys(value).filter((key) => !allowedFields.has(key));
  if (extraFields.length > 0) {
    return invalid(`${field} contains unsupported field${extraFields.length === 1 ? '' : 's'}: ${extraFields.join(', ')}.`);
  }

  const sku = parseCartBytes32(value.sku, `${field}.sku`);
  const currency = typeof value.settlementCurrency === 'string'
    ? parseCartCliCurrency(value.settlementCurrency, `${field}.settlementCurrency`)
    : invalid<CartCliCurrency>(`${field}.settlementCurrency must be a string.`);
  const unitPrice = typeof value.unitPrice === 'string' && /^\d+(?:\.\d+)?$/.test(value.unitPrice)
    ? value.unitPrice
    : undefined;
  const quantity = parsePositiveInteger(value.quantity ?? '1', `${field}.quantity`);
  const fulfillmentKind = parseCartSellerFulfillmentKind(value.fulfillmentKind, `${field}.fulfillmentKind`);
  const paymentRecipient = typeof value.paymentRecipient === 'string' || value.paymentRecipient === undefined
    ? parseCartAddress(value.paymentRecipient, `${field}.paymentRecipient`)
    : invalid<Address | undefined>(`${field}.paymentRecipient must be an address string.`);
  const splits = parseListingSplits(value.splits, `${field}.splits`);
  const firstSplit = splits.isValid ? splits.value?.[0] : undefined;
  const issues = [
    ...(firstSplit !== undefined && paymentRecipient.isValid && paymentRecipient.value !== undefined &&
      !isAddressEqual(firstSplit.recipient, paymentRecipient.value)
      ? [`${field}.splits must start with paymentRecipient.`] : []),
    ...(splits.isValid ? [] : splits.issues),
    ...(sku.isValid ? [] : sku.issues),
    ...(currency.isValid ? [] : currency.issues),
    ...(unitPrice === undefined ? [`${field}.unitPrice must be a non-negative decimal amount string.`] : []),
    ...(quantity.isValid ? [] : quantity.issues),
    ...(fulfillmentKind.isValid ? [] : fulfillmentKind.issues),
    ...(paymentRecipient.isValid ? [] : paymentRecipient.issues),
  ];
  if (issues.length > 0 || !sku.isValid || !currency.isValid || unitPrice === undefined ||
    !quantity.isValid || !fulfillmentKind.isValid || !paymentRecipient.isValid || !splits.isValid) {
    return { isValid: false, issues };
  }

  return {
    isValid: true,
    value: {
      sku: sku.value,
      settlementCurrency: currency.value,
      unitPrice,
      quantity: quantity.value,
      ...(fulfillmentKind.value === undefined ? {} : { fulfillmentKind: fulfillmentKind.value }),
      ...(paymentRecipient.value === undefined ? {} : { paymentRecipient: paymentRecipient.value }),
      ...(splits.value === undefined ? {} : { splits: splits.value }),
    },
  };
}

function parseListingSplits(value: unknown, field: string): CartCliResult<CartSplit[] | undefined> {
  if (value === undefined) return { isValid: true, value: undefined };
  if (!Array.isArray(value) || value.length > 16) return invalid(`${field} must be an array of at most 16 recipients.`);
  const splits = value.map((entry: unknown, index): CartCliResult<CartSplit> => {
    const path = `${field}[${index}]`;
    if (!isRecord(entry) || Object.keys(entry).some(key => key !== 'recipient' && key !== 'basisPoints')) {
      return invalid(`${path} must contain only recipient and basisPoints.`);
    }
    if (typeof entry.recipient !== 'string' || !isAddress(entry.recipient) || getAddress(entry.recipient) === zeroAddress) {
      return invalid(`${path}.recipient must be a nonzero EVM address.`);
    }
    if (typeof entry.basisPoints !== 'number' || !Number.isInteger(entry.basisPoints) || entry.basisPoints <= 0 || entry.basisPoints > 10000) {
      return invalid(`${path}.basisPoints must be an integer between 1 and 10000.`);
    }
    return { isValid: true, value: { recipient: getAddress(entry.recipient), basisPoints: entry.basisPoints } };
  });
  const issues = splits.flatMap(split => split.isValid ? [] : split.issues);
  if (issues.length > 0) return { isValid: false, issues };
  const parsed = splits.map(split => {
    if (!split.isValid) throw new Error('unreachable: invalid Cart split survived validation.');
    return split.value;
  });
  if (new Set(parsed.map(split => split.recipient.toLowerCase())).size !== parsed.length) return invalid(`${field} recipients must be unique.`);
  if (parsed.length > 0 && parsed.reduce((sum, split) => sum + split.basisPoints, 0) !== 10000) return invalid(`${field} basisPoints must sum to 10000.`);
  return { isValid: true, value: parsed };
}

export function parseCartSellerFulfillmentKind(
  value: unknown,
  field: string,
): CartCliResult<CartSellerFulfillmentKind | undefined> {
  if (value === undefined) return { isValid: true, value: undefined };
  if (value === 'ERC721_TRANSFER') {
    return { isValid: true, value: cartFulfillmentKinds.erc721Transfer };
  }
  if (value === 'ERC1155_TRANSFER') {
    return { isValid: true, value: cartFulfillmentKinds.erc1155Transfer };
  }
  if (value === 'ERC721_MINT_TO') {
    return { isValid: true, value: cartFulfillmentKinds.erc721MintTo };
  }
  if (value === 'ERC1155_MINT_TO') {
    return { isValid: true, value: cartFulfillmentKinds.erc1155MintTo };
  }
  return invalid(
    `${field} must be ERC721_TRANSFER, ERC1155_TRANSFER, ERC721_MINT_TO, or ERC1155_MINT_TO.`,
  );
}

function parseSelection(value: string, index: number): CartCliResult<CartListingSelection> {
  const [rawDigest, rawQuantity, extra] = value.split('=');
  if (rawDigest === undefined || extra !== undefined) {
    return invalid(`--listing at index ${index} must use listing-digest[=quantity].`);
  }
  const digest = parseCartBytes32(rawDigest, `--listing at index ${index}`);
  const quantity = parsePositiveInteger(rawQuantity ?? '1', `--listing quantity at index ${index}`);
  if (!digest.isValid || !quantity.isValid) {
    return {
      isValid: false,
      issues: [...(digest.isValid ? [] : digest.issues), ...(quantity.isValid ? [] : quantity.issues)],
    };
  }
  return { isValid: true, value: { kind: 'listing', listingDigest: digest.value, quantity: quantity.value } };
}

export type CartCheckoutFileItem =
  | (CartListingSelection & { recipient?: Address })
  | { kind: 'swap'; mode: 'exact-input'; outputCurrency: CartCliCurrency; inputAmount: string; recipient?: Address }
  | { kind: 'swap'; mode: 'exact-output'; outputCurrency: CartCliCurrency; outputAmount: string; recipient?: Address };

const mintSelectionSchema = z.object({
  preparationId: z.uuid(),
  listingDigest: z.templateLiteral(['0x', z.string()]).refine(value => /^0x[0-9a-fA-F]{64}$/u.test(value)),
  unitIndexes: z.array(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)).min(1)
    .refine(indexes => new Set(indexes).size === indexes.length, 'Mint unit indexes must be unique'),
}).strict();

export type CartCheckoutFile = {
  items: CartCheckoutFileItem[];
  mintSelections?: z.infer<typeof mintSelectionSchema>[];
};

export function parseCartCheckoutFile(content: string): CartCliResult<CartCheckoutFile> {
  const document = parseJsonDocument(content);
  if (!document.isValid) return document;
  if (!isRecord(document.value) || Object.keys(document.value).some(key => !['items', 'mintSelections'].includes(key)) ||
      !Array.isArray(document.value.items) || document.value.items.length === 0) {
    return invalid('checkout input must contain a non-empty items array and optional mintSelections.');
  }
  const mintSelections = z.array(mintSelectionSchema).min(1).optional().safeParse(document.value.mintSelections);
  if (!mintSelections.success) return invalid(`Invalid mintSelections: ${mintSelections.error.message}`);
  const items = document.value.items.map((value: unknown, index: number): CartCliResult<CartCheckoutFileItem> => {
    const field = `items[${index}]`;
    if (!isRecord(value)) return invalid(`${field} must be an object.`);
    const recipient = typeof value.recipient === 'string' || value.recipient === undefined
      ? parseCartAddress(value.recipient, `${field}.recipient`)
      : invalid<Address | undefined>(`${field}.recipient must be an address string.`);
    if (!recipient.isValid) return recipient;
    if (value.kind === 'listing') {
      if (Object.keys(value).some(key => !['kind', 'listingDigest', 'quantity', 'recipient'].includes(key))) return invalid(`${field} contains unsupported fields.`);
      const digest = parseCartBytes32(value.listingDigest, `${field}.listingDigest`);
      const quantity = parsePositiveInteger(value.quantity ?? '1', `${field}.quantity`);
      if (!digest.isValid) return digest;
      if (!quantity.isValid) return quantity;
      return { isValid: true, value: { kind: 'listing', listingDigest: digest.value, quantity: quantity.value,
        ...(recipient.value === undefined ? {} : { recipient: recipient.value }) } };
    }
    if (value.kind !== 'swap' || (value.mode !== 'exact-input' && value.mode !== 'exact-output')) return invalid(`${field} must be a listing or an exact-input/exact-output swap.`);
    const amountField = value.mode === 'exact-input' ? 'inputAmount' : 'outputAmount';
    if (Object.keys(value).some(key => !['kind', 'mode', 'outputCurrency', amountField, 'recipient'].includes(key))) return invalid(`${field} contains unsupported fields.`);
    const amount = value[amountField];
    if (typeof amount !== 'string' || !/^\d+(?:\.\d+)?$/.test(amount) || !/[1-9]/.test(amount)) return invalid(`${field}.${amountField} must be a positive decimal amount string.`);
    const currency = typeof value.outputCurrency === 'string' ? parseCartCliCurrency(value.outputCurrency, `${field}.outputCurrency`) : invalid<CartCliCurrency>(`${field}.outputCurrency must be a string.`);
    if (!currency.isValid) return currency;
    const common = { kind: 'swap', outputCurrency: currency.value, ...(recipient.value === undefined ? {} : { recipient: recipient.value }) } satisfies { kind: 'swap'; outputCurrency: CartCliCurrency; recipient?: Address };
    return { isValid: true, value: value.mode === 'exact-input' ? { ...common, mode: 'exact-input', inputAmount: amount } : { ...common, mode: 'exact-output', outputAmount: amount } };
  });
  const issues = items.flatMap(item => item.isValid ? [] : item.issues);
  if (issues.length > 0) return { isValid: false, issues };
  return { isValid: true, value: { items: items.map(item => {
    if (!item.isValid) throw new Error('unreachable: invalid checkout item survived validation.');
    return item.value;
  }), ...(mintSelections.data === undefined ? {} : { mintSelections: mintSelections.data }) } };
}

function parseDeadline(value: unknown): CartCliResult<bigint> {
  if (typeof value !== 'string' || value.length === 0) {
    return invalid('deadline must be an ISO-8601 date or unix timestamp string.');
  }
  if (/^\d+$/.test(value)) {
    return parsePositiveInteger(value, 'deadline');
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    return invalid('deadline must be an ISO-8601 date or unix timestamp string.');
  }
  return { isValid: true, value: BigInt(Math.floor(milliseconds / 1_000)) };
}

function parsePositiveInteger(value: unknown, field: string): CartCliResult<bigint> {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return invalid(`${field} must be a positive integer string.`);
  }
  const parsed = BigInt(value);
  return parsed > 0n
    ? { isValid: true, value: parsed }
    : invalid(`${field} must be greater than zero.`);
}

export function parseCartBytes32(value: unknown, field: string): CartCliResult<Hex> {
  return typeof value === 'string' && isHex(value) && value.length === 66
    ? { isValid: true, value }
    : invalid(`${field} must be a 0x-prefixed bytes32 value.`);
}

function invalid<T = never>(issue: string): CartCliResult<T> {
  return { isValid: false, issues: [issue] };
}

function parseJsonDocument(content: string): CartCliResult<unknown> {
  try {
    return { isValid: true, value: JSON.parse(content) as unknown };
  } catch {
    return invalid('input must contain valid JSON.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
