import { isHex, type Address } from 'viem';
import type { SupportedChain } from '../contracts/addresses.js';
import type { TimestampInput } from './types/common.js';
import { toPositiveInteger } from './amounts-core.js';

const ISO_DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[Tt]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[+-]\d{2}:?\d{2})?)?$/;
const ISO_DATE_TIME_WITHOUT_TIMEZONE_PATTERN = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

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

export function requireConfiguredAddress(address: Address | undefined, label: string, chain: SupportedChain): Address {
  if (!address) {
    throw new Error(`${label} is not configured for "${chain}". Supported chains: mainnet, sepolia`);
  }
  return address;
}

export function validateRouterPayload(commands: `0x${string}`, inputs: readonly `0x${string}`[]): void {
  if (!isEvenLengthHex(commands)) {
    throw new Error('Router commands must be an even-length hex string.');
  }
  const byteLength = (commands.length - 2) / 2;
  if (byteLength <= 0) {
    throw new Error('Router commands must not be empty.');
  }
  const invalidInputIndex = inputs.findIndex((input) => !isEvenLengthHex(input));
  if (invalidInputIndex !== -1) {
    throw new Error(`Router input at index ${invalidInputIndex} must be an even-length hex string.`);
  }
  if (byteLength !== inputs.length) {
    throw new Error(`Router commands/input mismatch: commands has ${byteLength} byte(s) but ${inputs.length} input(s) were provided.`);
  }
}

function isEvenLengthHex(value: `0x${string}`): boolean {
  return isHex(value) && value.length % 2 === 0;
}

function normalizeIsoDateString(value: string): string {
  return ISO_DATE_TIME_WITHOUT_TIMEZONE_PATTERN.test(value) ? `${value}Z` : value;
}
