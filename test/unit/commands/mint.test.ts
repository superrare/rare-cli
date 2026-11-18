import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';
import { mintCommand } from '../../../src/commands/mint.js';

const createRareClient = vi.hoisted(() => vi.fn());

vi.mock('@rareprotocol/rare-sdk/client', () => ({ createRareClient }));

beforeEach(() => {
  createRareClient.mockReset();
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

  assert.equal(createRareClient.mock.calls.length, 0);
});
