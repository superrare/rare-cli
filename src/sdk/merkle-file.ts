import { readFile, writeFile } from 'node:fs/promises';
import type {
  BatchListingProofArtifact,
  BatchListingRootArtifact,
} from './types/batch-listing.js';
import {
  validateProofArtifact,
  validateRootArtifact,
} from './merkle-core.js';

function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

export async function loadMerkleRootArtifact(path: string): Promise<BatchListingRootArtifact> {
  const parsed = parseJson(await readFile(path, 'utf8'));
  validateRootArtifact(parsed);
  return parsed;
}

export async function loadMerkleProofArtifact(path: string): Promise<BatchListingProofArtifact> {
  const parsed = parseJson(await readFile(path, 'utf8'));
  validateProofArtifact(parsed);
  return parsed;
}

export async function writeMerkleArtifact(path: string, data: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}
