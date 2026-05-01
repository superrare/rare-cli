import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePacked, keccak256, type Address } from 'viem';
import {
  buildAllowListTree,
  buildBatchListingTree,
  buildProofArtifact,
  buildRootArtifact,
  loadAllowList,
  validateProofArtifact,
  validateRootArtifact,
} from '../src/sdk/merkle.js';

function tokenLeaf(contract: Address, tokenId: bigint): `0x${string}` {
  return keccak256(encodePacked(['address', 'uint256'], [contract, tokenId]));
}

test('buildBatchListingTree matches the verified token root fixture and lexicographic token ordering', () => {
  const tokens = [
    { contract: '0x1111111111111111111111111111111111111111' as Address, tokenId: '2' },
    { contract: '0x1111111111111111111111111111111111111111' as Address, tokenId: '10' },
    { contract: '0x2222222222222222222222222222222222222222' as Address, tokenId: '1' },
  ];

  const { root, sortedTokens, tree } = buildBatchListingTree(tokens);
  assert.equal(root, '0x24308bf799ea8e4df4b97cb602aa99887edcb9b6a138adb435665a81057cf832');
  assert.deepEqual(sortedTokens.map((token) => `${token.contract}:${token.tokenId}`), [
    '0x1111111111111111111111111111111111111111:10',
    '0x1111111111111111111111111111111111111111:2',
    '0x2222222222222222222222222222222222222222:1',
  ]);

  const includedProof = tree.getHexProof(Buffer.from(tokenLeaf(tokens[0]!.contract, 2n).slice(2), 'hex'));
  assert.equal(tree.verify(includedProof, Buffer.from(tokenLeaf(tokens[0]!.contract, 2n).slice(2), 'hex'), root), true);
  assert.equal(
    tree.verify(includedProof, Buffer.from(tokenLeaf(tokens[0]!.contract, 3n).slice(2), 'hex'), root),
    false,
  );
});

test('buildAllowListTree matches the verified allowlist root fixture', () => {
  const addresses = [
    '0x1000000000000000000000000000000000000000',
    '0x3000000000000000000000000000000000000000',
    '0x2000000000000000000000000000000000000000',
  ] as Address[];

  const { root, tree } = buildAllowListTree(addresses);
  const buyerLeaf = Buffer.from(keccak256(addresses[0]!).slice(2), 'hex');
  const proof = tree.getHexProof(buyerLeaf);

  assert.equal(root, '0x8a59aac261c3066e225d58ffa0cbc412b401df7c92d4772fb8a59177fc8f53e3');
  assert.equal(tree.verify(proof, buyerLeaf, root), true);
  assert.equal(tree.verify(proof, Buffer.from(keccak256('0x4000000000000000000000000000000000000000').slice(2), 'hex'), root), false);
});

test('root artifacts are structured, omit target, and include allowlist metadata', () => {
  const artifact = buildRootArtifact({
    tokens: [
      { contract: '0x1111111111111111111111111111111111111111' as Address, tokenId: '2' },
      { contract: '0x1111111111111111111111111111111111111111' as Address, tokenId: '10' },
    ],
    currency: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    amount: 1500000n,
    splitAddresses: ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address],
    splitRatios: [100],
    allowListAddresses: ['0x1000000000000000000000000000000000000000' as Address],
    allowListEndTimestamp: '1234',
  });

  assert.equal('target' in artifact, false);
  assert.equal(artifact.amount, '1500000');
  assert.equal(artifact.allowList?.endTimestamp, '1234');
});

test('artifact validation catches structural errors and root mismatches', async () => {
  assert.throws(
    () =>
      validateRootArtifact({
        root: '0x' + '11'.repeat(32),
        currency: '0x1111111111111111111111111111111111111111',
        amount: '1',
        splitAddresses: [],
        splitRatios: [],
        tokens: [],
      }),
    /tokens must be a non-empty array/,
  );

  assert.throws(
    () =>
      validateProofArtifact({
        root: '0x' + '11'.repeat(32),
        contract: '0x1111111111111111111111111111111111111111',
        tokenId: '1',
        proof: ['0x1234'],
      }),
    /proof entries must be 0x-prefixed bytes32 hex strings/,
  );

  const artifact = buildRootArtifact({
    tokens: [{ contract: '0x1111111111111111111111111111111111111111' as Address, tokenId: '1' }],
    currency: '0x0000000000000000000000000000000000000000',
    amount: 1n,
    splitAddresses: [],
    splitRatios: [],
  });

  assert.throws(
    () =>
      buildProofArtifact(
        { ...artifact, root: '0x' + '00'.repeat(32) as `0x${string}` },
        artifact.tokens[0]!.contract,
        artifact.tokens[0]!.tokenId,
      ),
    /does not match artifact root/,
  );

  const dir = await mkdtemp(join(tmpdir(), 'rare-batch-allowlist-'));
  const allowlistPath = join(dir, 'allowlist.json');

  try {
    await writeFile(
      allowlistPath,
      JSON.stringify({
        addresses: ['0x1000000000000000000000000000000000000000'],
        root: '0x' + '12'.repeat(32),
      }),
    );

    await assert.rejects(loadAllowList(allowlistPath), /Allowlist root mismatch/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('buildProofArtifact includes allowListProof for an allowlisted buyer', async () => {
  const artifact = buildRootArtifact({
    tokens: [{ contract: '0x1111111111111111111111111111111111111111' as Address, tokenId: '1' }],
    currency: '0x0000000000000000000000000000000000000000',
    amount: 1n,
    splitAddresses: [],
    splitRatios: [],
    allowListAddresses: ['0x1000000000000000000000000000000000000000' as Address],
  });

  const proof = buildProofArtifact(
    artifact,
    '0x1111111111111111111111111111111111111111',
    '1',
    '0x1000000000000000000000000000000000000000',
  );

  assert.ok(proof.allowListProof);
  assert.equal(proof.allowListAddress, '0x1000000000000000000000000000000000000000');

  const dir = await mkdtemp(join(tmpdir(), 'rare-batch-proof-artifact-'));
  const path = join(dir, 'artifact.json');
  try {
    await writeFile(path, JSON.stringify(artifact, null, 2));
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    validateRootArtifact(parsed);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
