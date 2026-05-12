import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  collectSplit,
  finalizeSplits,
  formatSplitLines,
} from '../../../src/commands/splits-core.js';

const sellerAddress = '0x0000000000000000000000000000000000000001' as const;
const collaboratorAddress = '0x0000000000000000000000000000000000000002' as const;

test('collectSplit parses repeatable ADDRESS=RATIO options', () => {
  const first = collectSplit(`${sellerAddress}=70`, undefined);
  const second = collectSplit(`${collaboratorAddress}=30`, first);

  assert.deepEqual(finalizeSplits(second), {
    addresses: [sellerAddress, collaboratorAddress],
    ratios: [70, 30],
  });
});

test('finalizeSplits preserves omitted splits as undefined so the SDK can apply defaults', () => {
  assert.equal(finalizeSplits(undefined), undefined);
});

test('collectSplit rejects invalid split option shape and addresses', () => {
  assert.throws(() => collectSplit('not-a-split', undefined), /Invalid --split format/);
  assert.throws(() => collectSplit('not-an-address=50', undefined), /valid EVM address/);
});

test('formatSplitLines renders split summaries consistently', () => {
  const splits = finalizeSplits(collectSplit(`${collaboratorAddress}=100`, undefined));
  if (splits === undefined) {
    throw new Error('Expected split options.');
  }

  assert.deepEqual(formatSplitLines(splits), [
    `    ${collaboratorAddress} = 100%`,
  ]);
});
