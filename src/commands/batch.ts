import { readFile, writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import { getAddress, isAddress, type Address, type Hex } from 'viem';
import { printError } from '../errors.js';
import { output } from '../output.js';
import {
  getBatchTokenProof,
  normalizeBytes32,
  parseBatchTokenListArtifactOrBuild,
  parseBatchTokenProofArtifact,
  verifyBatchTokenProof,
  type BatchTokenListArtifact,
  type BatchTokenListInputFormat,
} from '../sdk/batch-core.js';

type TreeInputOptions = {
  input: string;
  format?: string;
  output?: string;
  chainId?: string;
};

type TreeProofOptions = TreeInputOptions & {
  contract: string;
  tokenId: string;
};

type TreeVerifyOptions = TreeProofOptions & {
  proof?: string;
  root?: string;
};

type BatchProofInput = {
  root?: Hex;
  contractAddress?: Address;
  tokenId?: string;
  chainId?: number;
  proof: Hex[];
};

function createTreeBuildCommand(): Command {
  const cmd = new Command('build');
  cmd.description('Build a batch marketplace token Merkle artifact from CSV or JSON');

  cmd
    .requiredOption('--input <path>', 'CSV, JSON, or artifact token list')
    .option('--format <format>', 'input format (csv, json)')
    .option('--chain-id <id>', 'chain ID to store in the artifact')
    .option('--output <path>', 'write the generated artifact JSON to a file')
    .action(async (opts: TreeInputOptions) => {
      try {
        const artifact = await readBatchTreeArtifact(opts);
        if (opts.output !== undefined) {
          await writeJson(opts.output, artifact);
        }

        output(
          opts.output === undefined ? artifact : {
            root: artifact.root,
            count: artifact.count,
            chainId: artifact.chainId ?? null,
            output: opts.output,
          },
          () => {
            console.log(`Batch token root: ${artifact.root}`);
            console.log(`Tokens: ${artifact.count}`);
            if (artifact.chainId !== undefined) {
              console.log(`Chain ID: ${artifact.chainId}`);
            }
            if (opts.output !== undefined) {
              console.log(`Artifact written to: ${opts.output}`);
            }
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createTreeProofCommand(): Command {
  const cmd = new Command('proof');
  cmd.description('Generate a batch marketplace Merkle proof for one token');

  cmd
    .requiredOption('--input <path>', 'batch token artifact, CSV, or JSON token list')
    .requiredOption('--contract <address>', 'token contract address')
    .requiredOption('--token-id <id>', 'token ID to prove')
    .option('--format <format>', 'input format (csv, json)')
    .option('--chain-id <id>', 'chain ID to store in the proof')
    .option('--output <path>', 'write the proof JSON to a file')
    .action(async (opts: TreeProofOptions) => {
      try {
        const artifact = await readBatchTreeArtifact(opts);
        const contractAddress = parseAddressOption(opts.contract, '--contract');
        const proof = getBatchTokenProof({
          artifact,
          contractAddress,
          tokenId: opts.tokenId,
          chainId: opts.chainId,
        });

        if (opts.output !== undefined) {
          await writeJson(opts.output, proof);
        }

        output(
          opts.output === undefined ? proof : {
            root: proof.root,
            contractAddress: proof.contractAddress,
            tokenId: proof.tokenId,
            chainId: proof.chainId ?? null,
            proofLength: proof.proof.length,
            valid: proof.valid,
            output: opts.output,
          },
          () => {
            console.log(`Batch token root: ${proof.root}`);
            console.log(`Token: ${proof.contractAddress} #${proof.tokenId}`);
            if (proof.chainId !== undefined) {
              console.log(`Chain ID: ${proof.chainId}`);
            }
            console.log(`Proof entries: ${proof.proof.length}`);
            console.log(`Valid: ${proof.valid ? 'yes' : 'no'}`);
            if (opts.output !== undefined) {
              console.log(`Proof written to: ${opts.output}`);
            }
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createTreeVerifyCommand(): Command {
  const cmd = new Command('verify');
  cmd.description('Verify a batch marketplace token proof');

  cmd
    .requiredOption('--input <path>', 'batch token artifact, CSV, or JSON token list')
    .requiredOption('--contract <address>', 'token contract address')
    .requiredOption('--token-id <id>', 'token ID to verify')
    .option('--proof <path>', 'proof JSON from rare batch tree proof')
    .option('--root <bytes32>', 'expected Merkle root; defaults to the input or proof root')
    .option('--format <format>', 'input format (csv, json)')
    .option('--chain-id <id>', 'chain ID to use for artifact/proof checks')
    .action(async (opts: TreeVerifyOptions) => {
      try {
        const artifact = await readBatchTreeArtifact(opts);
        const contractAddress = parseAddressOption(opts.contract, '--contract');
        const proofInput = opts.proof === undefined ? undefined : await readBatchProofFile(opts.proof);
        const generatedProof = proofInput === undefined
          ? getBatchTokenProof({
              artifact,
              contractAddress,
              tokenId: opts.tokenId,
              chainId: opts.chainId,
            })
          : undefined;
        const proof = proofInput?.proof ?? generatedProof?.proof ?? [];
        const root = opts.root === undefined
          ? proofInput?.root ?? generatedProof?.root ?? artifact.root
          : normalizeBytes32(opts.root, '--root');

        validateProofInputMatchesTarget(proofInput, {
          artifact,
          contractAddress,
          tokenId: opts.tokenId,
          root,
          allowRootOverride: opts.root !== undefined,
        });

        const valid = verifyBatchTokenProof({
          root,
          contractAddress,
          tokenId: opts.tokenId,
          proof,
        });

        output(
          {
            root,
            contractAddress,
            tokenId: generatedProof?.tokenId ?? proofInput?.tokenId ?? opts.tokenId,
            valid,
          },
          () => {
            console.log(`Batch token root: ${root}`);
            console.log(`Token: ${contractAddress} #${generatedProof?.tokenId ?? proofInput?.tokenId ?? opts.tokenId}`);
            console.log(`Valid: ${valid ? 'yes' : 'no'}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createTreeCommand(): Command {
  const cmd = new Command('tree');
  cmd.description('Build, prove, and verify batch marketplace token trees');
  cmd.addCommand(createTreeBuildCommand());
  cmd.addCommand(createTreeProofCommand());
  cmd.addCommand(createTreeVerifyCommand());
  return cmd;
}

export function batchCommand(): Command {
  const cmd = new Command('batch');
  cmd.description('Build batch marketplace artifacts');
  cmd.addCommand(createTreeCommand());
  return cmd;
}

async function readBatchTreeArtifact(opts: TreeInputOptions): Promise<BatchTokenListArtifact> {
  const format = parseFormatOption(opts.format);
  const content = await readFile(opts.input, 'utf8');
  return parseBatchTokenListArtifactOrBuild({
    content,
    format,
    sourceName: opts.input,
    chainId: opts.chainId,
  });
}

async function readBatchProofFile(inputPath: string): Promise<BatchProofInput> {
  const content = await readFile(inputPath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid JSON';
    throw new Error(`Could not parse --proof JSON: ${message}`);
  }

  if (isRecord(parsed) && parsed.type === 'rare-batch-token-proof') {
    const proof = parseBatchTokenProofArtifact(content);
    return {
      root: proof.root,
      contractAddress: proof.contractAddress,
      tokenId: proof.tokenId,
      chainId: proof.chainId,
      proof: proof.proof,
    };
  }

  const proof = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.proof)
      ? parsed.proof
      : undefined;

  if (proof === undefined) {
    throw new Error('--proof must be a JSON array or an object with a proof array.');
  }

  const root = isRecord(parsed) && typeof parsed.root === 'string'
    ? normalizeBytes32(parsed.root, 'proof root')
    : undefined;

  return {
    ...(root === undefined ? {} : { root }),
    proof: proof.map((entry, index) => {
      if (typeof entry !== 'string') {
        throw new Error(`proof[${index}] must be a bytes32 hex string.`);
      }
      return normalizeBytes32(entry, `proof[${index}]`);
    }),
  };
}

function validateProofInputMatchesTarget(
  proofInput: BatchProofInput | undefined,
  target: {
    artifact: BatchTokenListArtifact;
    contractAddress: Address;
    tokenId: string;
    root: Hex;
    allowRootOverride: boolean;
  },
): void {
  if (proofInput === undefined) {
    return;
  }
  if (
    proofInput.root !== undefined &&
    !target.allowRootOverride &&
    proofInput.root.toLowerCase() !== target.artifact.root.toLowerCase()
  ) {
    throw new Error('Proof root does not match the input token list root.');
  }
  if (
    proofInput.root !== undefined &&
    target.allowRootOverride &&
    proofInput.root.toLowerCase() !== target.root.toLowerCase()
  ) {
    throw new Error('Proof root does not match --root.');
  }
  if (
    proofInput.contractAddress !== undefined &&
    proofInput.contractAddress.toLowerCase() !== target.contractAddress.toLowerCase()
  ) {
    throw new Error('Proof artifact contractAddress does not match --contract.');
  }
  if (proofInput.tokenId !== undefined && proofInput.tokenId !== parseTokenIdOption(target.tokenId)) {
    throw new Error('Proof artifact tokenId does not match --token-id.');
  }
  if (
    proofInput.chainId !== undefined &&
    target.artifact.chainId !== undefined &&
    proofInput.chainId !== target.artifact.chainId
  ) {
    throw new Error('Proof artifact chainId does not match the input token list chainId.');
  }
}

function parseFormatOption(value: string | undefined): BatchTokenListInputFormat | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === 'csv' || value === 'json') {
    return value;
  }
  throw new Error('--format must be "csv" or "json".');
}

function parseAddressOption(value: string, optionName: string): Address {
  if (!isAddress(value)) {
    throw new Error(`${optionName} must be a valid 0x address.`);
  }

  return getAddress(value);
}

function parseTokenIdOption(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error('--token-id must be an integer.');
  }

  try {
    const tokenId = BigInt(trimmed);
    if (tokenId < 0n) {
      throw new Error('--token-id must be greater than or equal to 0.');
    }
    return tokenId.toString();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('--token-id')) {
      throw error;
    }
    throw new Error('--token-id must be an integer.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
