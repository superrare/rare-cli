import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';
import { mintCommand } from '../../../src/commands/mint.js';

const printError = vi.hoisted(() => vi.fn());
const uploadMedia = vi.hoisted(() => vi.fn());
const pinMetadata = vi.hoisted(() => vi.fn());

vi.mock('../../../src/errors.js', () => ({
  printError,
}));

vi.mock('../../../src/sdk/api.js', () => {
  return {
    uploadMedia,
    pinMetadata,
  };
});

beforeEach(() => {
  printError.mockReset();
  uploadMedia.mockReset();
  pinMetadata.mockReset();
});

test('mint validates local write prerequisites before uploading generated metadata', async () => {
  const cmd = mintCommand();

  await cmd.parseAsync([
    '--contract',
    'not-an-address',
    '--name',
    'Test NFT',
    '--description',
    'Test description',
    '--image',
    './image.png',
    '--chain',
    'sepolia',
  ], { from: 'user' });

  assert.equal(uploadMedia.mock.calls.length, 0);
  assert.equal(pinMetadata.mock.calls.length, 0);
  assert.equal(printError.mock.calls.length, 1);
  const error = printError.mock.calls[0]?.[0];
  assert.ok(error instanceof Error);
  assert.match(error.message, /--contract must be a valid EVM address/);
});
