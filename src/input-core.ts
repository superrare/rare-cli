import { isAddress, parseEther, type Address } from 'viem';

export type IntegerInput = bigint | number | string;
export type TimestampInput = Date | IntegerInput;

const ISO_DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[Tt]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[+-]\d{2}:?\d{2})?)?$/;
const ISO_DATE_TIME_WITHOUT_TIMEZONE_PATTERN = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

export function toInteger(value: IntegerInput, field: string): bigint {
  if (typeof value === 'bigint') return value;

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error(`${field} must be an integer.`);
    }
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${field} is too large to pass as a number. Pass it as a string or bigint to avoid precision loss.`);
    }
    return BigInt(value);
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${field} must be an integer.`);
  }

  try {
    return BigInt(normalized);
  } catch {
    throw new Error(`${field} must be an integer.`);
  }
}

export function toNonNegativeInteger(value: IntegerInput, field: string): bigint {
  const normalized = toInteger(value, field);
  if (normalized < 0n) {
    throw new Error(`${field} must be greater than or equal to 0.`);
  }
  return normalized;
}

export function toPositiveInteger(value: IntegerInput, field: string): bigint {
  const normalized = toInteger(value, field);
  if (normalized <= 0n) {
    throw new Error(`${field} must be greater than 0.`);
  }
  return normalized;
}

export function toNonNegativeWei(value: string, field: string): bigint {
  const normalized = parseEther(value);
  if (normalized < 0n) {
    throw new Error(`${field} must be greater than or equal to 0.`);
  }
  return normalized;
}

export function toPositiveWei(value: string, field: string): bigint {
  const normalized = parseEther(value);
  if (normalized <= 0n) {
    throw new Error(`${field} must be greater than 0.`);
  }
  return normalized;
}

export function parseAddress(input: string, field: string): Address {
  if (!isAddress(input)) {
    throw new Error(`${field} must be a valid EVM address.`);
  }
  return input;
}

export function parseOptionalAddress(input: string | undefined, field: string): Address | undefined {
  return input === undefined ? undefined : parseAddress(input, field);
}

export function isPrivateKeyString(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function parsePrivateKey(input: string, field: string): `0x${string}` {
  if (!isPrivateKeyString(input)) {
    throw new Error(`${field} must be a 0x-prefixed 32-byte private key.`);
  }
  return input;
}

export function requireInput<T>(value: T | undefined, field: string): T {
  if (value === undefined) {
    throw new Error(`${field} is required.`);
  }
  return value;
}

export function toUnixTimestamp(value: TimestampInput, field: string): bigint {
  if (value instanceof Date) {
    const millis = value.getTime();
    if (!Number.isFinite(millis)) {
      throw new Error(`${field} must be a valid date.`);
    }
    return BigInt(Math.floor(millis / 1000));
  }

  if (typeof value === 'string' && ISO_DATE_STRING_PATTERN.test(value)) {
    const millis = Date.parse(normalizeIsoDateString(value));
    if (Number.isNaN(millis)) {
      throw new Error(`${field} must be a unix timestamp or ISO date.`);
    }
    return BigInt(Math.floor(millis / 1000));
  }

  return toPositiveInteger(value, field);
}

function normalizeIsoDateString(value: string): string {
  return ISO_DATE_TIME_WITHOUT_TIMEZONE_PATTERN.test(value) ? `${value}Z` : value;
}
