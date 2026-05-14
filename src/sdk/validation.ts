import { isAddress, type Address } from 'viem';

export function parseAddress(input: string, field: string): Address {
  if (!isAddress(input)) {
    throw new Error(`${field} must be a valid EVM address.`);
  }

  return input;
}

export function parseOptionalAddress(input: string | undefined, field: string): Address | undefined {
  return input === undefined ? undefined : parseAddress(input, field);
}

export function isHexString(value: string): value is `0x${string}` {
  return value.startsWith('0x');
}

export function parseHexString(input: string, field: string): `0x${string}` {
  if (!isHexString(input)) {
    throw new Error(`${field} must be 0x-prefixed.`);
  }

  return input;
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
