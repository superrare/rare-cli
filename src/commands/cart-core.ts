import { getAddress, isAddress, isHex, parseUnits, type Address, type Hex } from 'viem';

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
    paymentRecipient?: Address;
  }>;
};

export type CartListingSelection = {
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
    return invalid(`${field} must be a positive decimal amount.`);
  }
  const fractionalDigits = value.split('.')[1]?.length ?? 0;
  if (fractionalDigits > decimals) {
    return invalid(`${field} has more than ${decimals} decimal places.`);
  }
  try {
    const amount = parseUnits(value, decimals);
    return amount > 0n
      ? { isValid: true, value: amount }
      : invalid(`${field} must be greater than zero.`);
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
  const allowedFields = new Set(['sku', 'settlementCurrency', 'unitPrice', 'quantity', 'paymentRecipient']);
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
  const paymentRecipient = typeof value.paymentRecipient === 'string' || value.paymentRecipient === undefined
    ? parseCartAddress(value.paymentRecipient, `${field}.paymentRecipient`)
    : invalid<Address | undefined>(`${field}.paymentRecipient must be an address string.`);
  const issues = [
    ...(sku.isValid ? [] : sku.issues),
    ...(currency.isValid ? [] : currency.issues),
    ...(unitPrice === undefined ? [`${field}.unitPrice must be a positive decimal amount string.`] : []),
    ...(quantity.isValid ? [] : quantity.issues),
    ...(paymentRecipient.isValid ? [] : paymentRecipient.issues),
  ];
  if (issues.length > 0 || !sku.isValid || !currency.isValid || unitPrice === undefined || !quantity.isValid || !paymentRecipient.isValid) {
    return { isValid: false, issues };
  }

  return {
    isValid: true,
    value: {
      sku: sku.value,
      settlementCurrency: currency.value,
      unitPrice,
      quantity: quantity.value,
      ...(paymentRecipient.value === undefined ? {} : { paymentRecipient: paymentRecipient.value }),
    },
  };
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
  return { isValid: true, value: { listingDigest: digest.value, quantity: quantity.value } };
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
