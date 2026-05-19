import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parsePositiveInteger } from '../../../src/commands/pagination-core.js';

test('parsePositiveInteger accepts decimal positive integers', () => {
  assert.equal(parsePositiveInteger('1', '--page'), 1);
  assert.equal(parsePositiveInteger('24', '--per-page'), 24);
  assert.equal(parsePositiveInteger('001', '--page'), 1);
});

test('parsePositiveInteger rejects malformed and non-positive values', () => {
  for (const value of ['abc', '10abc', '1.5', '1e2', '0', '-1', String(Number.MAX_SAFE_INTEGER + 1)]) {
    assert.throws(
      () => parsePositiveInteger(value, '--page'),
      /--page must be a positive integer\./,
    );
  }
});
