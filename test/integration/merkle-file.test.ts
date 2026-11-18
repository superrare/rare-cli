import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import { ETH_ADDRESS } from '@rareprotocol/rare-sdk/contracts';
import {
  loadMerkleProofArtifact,
  loadMerkleRootArtifact,
  writeMerkleArtifact,
} from '../../src/merkle-file-shell.js';
import type { BatchListingRootArtifact } from '@rareprotocol/rare-sdk';

const contract = '0x1111111111111111111111111111111111111111' satisfies Address;
const buyer = '0x1000000000000000000000000000000000000000' satisfies Address;
const otherBuyer = '0x2000000000000000000000000000000000000000' satisfies Address;

const allowListedRootArtifact = {
  root: '0xa01f005c90f56c0f2b981e045caf4949f489bf82e5d3c49effb1334cab26043a',
  currency: ETH_ADDRESS,
  amount: '1',
  splitAddresses: [],
  splitRatios: [],
  tokens: [
    { contract, tokenId: '1' },
    { contract, tokenId: '2' },
  ],
  allowList: {
    root: '0x27544996534742c5e4c082fa1ed524eea6991a4d0325902124bc233e8d7379af',
    addresses: [buyer, otherBuyer],
    endTimestamp: '1234',
  },
} satisfies BatchListingRootArtifact;

describe('CLI Merkle artifact file shell', () => {
  it('loads and validates root artifacts from disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rare-batch-root-artifact-'));
    const path = join(dir, 'artifact.json');
    try {
      await writeFile(path, JSON.stringify(allowListedRootArtifact, null, 2));
      await expect(loadMerkleRootArtifact(path)).resolves.toEqual(allowListedRootArtifact);

      await writeFile(path, JSON.stringify({ ...allowListedRootArtifact, root: 'bad' }));
      await expect(loadMerkleRootArtifact(path)).rejects.toThrow('root must be a 0x-prefixed bytes32 hex string');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes formatted artifacts and validates proof artifacts when loading', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rare-batch-proof-artifact-'));
    const path = join(dir, 'proof.json');
    const proofArtifact = {
      root: allowListedRootArtifact.root,
      contract,
      tokenId: '1',
      proof: ['0xfde38319eec56e703ba771c1e2abddca86188674940372bdfed26cec392ec314'],
    };

    try {
      await writeMerkleArtifact(path, proofArtifact);
      expect(await readFile(path, 'utf8')).toBe(`${JSON.stringify(proofArtifact, null, 2)}\n`);
      await expect(loadMerkleProofArtifact(path)).resolves.toEqual(proofArtifact);

      await writeFile(path, JSON.stringify({ ...proofArtifact, proof: ['bad'] }));
      await expect(loadMerkleProofArtifact(path)).rejects.toThrow('proof entry must be a 0x-prefixed bytes32 hex string');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
