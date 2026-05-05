import { test } from 'vitest';
import assert from 'node:assert/strict';
import { toInteger, toSafeIntegerNumber, toWei } from '../src/sdk/helpers.js';

test('toInteger rejects unsafe numeric integers', () => {
  assert.equal(toInteger(Number.MAX_SAFE_INTEGER, 'tokenId'), 9_007_199_254_740_991n);
  assert.equal(toInteger('9007199254740993', 'tokenId'), 9_007_199_254_740_993n);
  assert.throws(() => toInteger(Number.MAX_SAFE_INTEGER + 1, 'tokenId'), /string or bigint/i);
});

test('toSafeIntegerNumber rejects integer strings that cannot round-trip through number', () => {
  assert.equal(toSafeIntegerNumber('1714500000', 'deadline'), 1_714_500_000);
  assert.throws(() => toSafeIntegerNumber('9007199254740993', 'deadline'), /safe JavaScript integer/i);
});

test('toWei rejects unsafe numeric amounts', () => {
  assert.equal(toWei('1.000000000000000001'), 1_000_000_000_000_000_001n);
  assert.equal(toWei(0.1), 100_000_000_000_000_000n);
  assert.throws(() => toWei(Number.MAX_SAFE_INTEGER + 1), /string or bigint/i);
});
