import { describe, expect, it } from 'vitest';
import {
  isPrivateKeyString,
  parseAddress,
  parseOptionalAddress,
  parsePrivateKey,
  requireInput,
  toInteger,
  toNonNegativeInteger,
  toPositiveInteger,
  toUnixTimestamp,
} from '../../src/input-core.js';

describe('CLI input core', () => {
  it('normalizes integer inputs without precision loss', () => {
    expect(toInteger(12n, 'tokenId')).toBe(12n);
    expect(toInteger('9007199254740993', 'tokenId')).toBe(9_007_199_254_740_993n);
    expect(() => toInteger(Number.MAX_SAFE_INTEGER + 1, 'tokenId')).toThrow('string or bigint');
    expect(() => toInteger('bad', 'tokenId')).toThrow('tokenId must be an integer.');
    expect(toNonNegativeInteger(0, 'tokenId')).toBe(0n);
    expect(() => toPositiveInteger(0, 'duration')).toThrow('duration must be greater than 0.');
  });

  it('parses required, optional, and private-key inputs', () => {
    const address = '0x1111111111111111111111111111111111111111';
    const privateKey = `0x${'1'.repeat(64)}`;
    expect(parseAddress(address, 'owner')).toBe(address);
    expect(parseOptionalAddress(undefined, 'owner')).toBeUndefined();
    expect(() => parseAddress('bad', 'owner')).toThrow('owner must be a valid EVM address.');
    expect(isPrivateKeyString(privateKey)).toBe(true);
    expect(parsePrivateKey(privateKey, 'private key')).toBe(privateKey);
    expect(requireInput('value', 'field')).toBe('value');
    expect(() => requireInput(undefined, 'field')).toThrow('field is required.');
  });

  it('normalizes unix timestamps and timezone-less ISO dates as UTC', () => {
    expect(toUnixTimestamp('1779366896', 'startTime')).toBe(1_779_366_896n);
    expect(toUnixTimestamp('2026-05-21T12:34:56', 'startTime')).toBe(1_779_366_896n);
    expect(() => toUnixTimestamp(new Date(Number.NaN), 'startTime')).toThrow('valid date');
  });
});
