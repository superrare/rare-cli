import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { deployLiquidEditionCommand } from '../../../src/commands/deploy.js';

const getPublicClient = vi.hoisted(() => vi.fn());
const getWalletClient = vi.hoisted(() => vi.fn());
const createRareClient = vi.hoisted(() => vi.fn());
const printError = vi.hoisted(() => vi.fn());

vi.mock('../../../src/client.js', () => ({
  getPublicClient,
  getWalletClient,
}));

vi.mock('../../../src/sdk/client.js', () => ({
  createRareClient,
}));

vi.mock('../../../src/errors.js', () => ({
  printError,
}));

const publicClient = { kind: 'public-client' };
const generatePresetCurves = vi.fn();
const mediaUpload = vi.fn();
const pinMetadata = vi.fn();
const deployMultiCurve = vi.fn();

beforeEach(() => {
  getPublicClient.mockReset();
  getWalletClient.mockReset();
  createRareClient.mockReset();
  printError.mockReset();
  generatePresetCurves.mockReset();
  mediaUpload.mockReset();
  pinMetadata.mockReset();
  deployMultiCurve.mockReset();

  getPublicClient.mockReturnValue(publicClient);
  getWalletClient.mockImplementation(() => {
    throw new Error('deploy confirmation should run before wallet setup');
  });
  createRareClient.mockReturnValue({
    media: {
      upload: mediaUpload,
      pinMetadata,
    },
    liquidEdition: {
      generatePresetCurves,
      deploy: {
        multiCurve: deployMultiCurve,
      },
    },
    contracts: {
      liquidFactory: '0x0000000000000000000000000000000000000001',
    },
    chainId: 11155111,
  });
  generatePresetCurves.mockResolvedValue({
    curves: [
      {
        spotPrice: '1',
        delta: '0',
        numItems: 1,
      },
    ],
    preview: {
      totalPositions: 1,
      totalShare: 1,
      curvePoolSupplyTokens: '900000',
      maxTotalSupplyTokens: '1000000',
      creatorLaunchRewardTokens: '100000',
      baseToken: '0xba5BDe662c17e2aDFF1075610382B9B691296350',
      segments: [],
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('liquid edition deploy requires confirmation before wallet setup and metadata upload', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'rare-cli-deploy-test-'));
  const imagePath = join(tempDir, 'image.png');
  const originalArgv = [...process.argv];
  // eslint-disable-next-line functional/immutable-data
  process.argv.push('--json');

  try {
    await writeFile(imagePath, 'image-bytes', 'utf8');

    await deployLiquidEditionCommand().parseAsync([
      'Test',
      'TST',
      '--curve-preset',
      'low-demand',
      '--description',
      'Test description',
      '--image',
      imagePath,
      '--chain',
      'sepolia',
    ], { from: 'user' });
  } finally {
    // eslint-disable-next-line functional/immutable-data
    process.argv.splice(0, process.argv.length, ...originalArgv);
    await rm(tempDir, { recursive: true, force: true });
  }

  const error = printError.mock.calls[0]?.[0];
  assert.ok(error instanceof Error);
  assert.match(error.message, /rare liquid-edition deploy multicurve requires --yes when --json is enabled/);
  assert.equal(getWalletClient.mock.calls.length, 0);
  assert.equal(mediaUpload.mock.calls.length, 0);
  assert.equal(pinMetadata.mock.calls.length, 0);
  assert.equal(deployMultiCurve.mock.calls.length, 0);
});
