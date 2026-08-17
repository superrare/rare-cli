import { readFile, writeFile } from 'node:fs/promises';
import type { BatchListingProofArtifact, BatchListingRootArtifact } from '@rareprotocol/rare-sdk';
import { validateMerkleProofArtifact, validateMerkleRootArtifact } from '@rareprotocol/rare-sdk/utils';

function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

export async function loadMerkleRootArtifact(path: string): Promise<BatchListingRootArtifact> {
  const parsed = parseJson(await readFile(path, 'utf8'));
  validateMerkleRootArtifact(parsed);
  return parsed;
}

export async function loadMerkleProofArtifact(path: string): Promise<BatchListingProofArtifact> {
  const parsed = parseJson(await readFile(path, 'utf8'));
  validateMerkleProofArtifact(parsed);
  return parsed;
}

export async function writeMerkleArtifact(path: string, data: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}
