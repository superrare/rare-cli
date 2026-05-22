import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';
import { mintCommand } from '../../../src/commands/mint.js';

const uploadMedia = vi.hoisted(() => vi.fn());
const pinMetadata = vi.hoisted(() => vi.fn());

vi.mock('../../../src/sdk/api.js', () => {
  return {
    uploadMedia,
    pinMetadata,
  };
});

beforeEach(() => {
  uploadMedia.mockReset();
  pinMetadata.mockReset();
});

test('mint validates local write prerequisites before uploading generated metadata', async () => {
  const cmd = mintCommand();

  await assert.rejects(
    cmd.parseAsync([
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
    ], { from: 'user' }),
    /--contract must be a valid EVM address/,
  );

  assert.equal(uploadMedia.mock.calls.length, 0);
  assert.equal(pinMetadata.mock.calls.length, 0);
});
