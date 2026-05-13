import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import { isAddressEqual, isHex, type Address } from 'viem';
import { getPublicClient, getWalletClient } from '../client.js';
import { getActiveChain } from '../config.js';
import { ETH_ADDRESS, resolveCurrency } from '../contracts/addresses.js';
import { printError } from '../errors.js';
import { output, log } from '../output.js';
import { createRareClient } from '../sdk/client.js';
import {
  buildProofArtifact,
  loadProofArtifact,
  loadRootArtifact,
  writeArtifact,
} from '../sdk/merkle.js';
import {
  getBatchTokenProof,
  normalizeBytes32,
  parseBatchTokenListArtifactOrBuild,
  parseBatchTokenProofInput,
  validateBatchTokenProofInputMatchesTarget,
  verifyBatchTokenProof,
  type BatchTokenListArtifact,
  type BatchTokenListInputFormat,
  type BatchTokenProofInput,
} from '../sdk/batch-core.js';
import { parseAddress } from '../sdk/validation.js';
import { formatBatchAmount, parseBatchAmount } from './batch-amounts.js';

type ChainOptions = {
  chain?: string;
  chainId?: string;
};

type MerkleProofOptions = {
  root: string;
  contract: string;
  tokenId: string;
  buyer?: string;
  output?: string;
};

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

type BatchListingCreateOptions = ChainOptions & {
  root: string;
  yes?: boolean;
};

type BatchListingRootOptions = ChainOptions & {
  root: string;
};

type BatchListingBuyOptions = ChainOptions & {
  proof: string;
  creator: string;
  currency: string;
  amount: string;
};

type BatchListingSetAllowListOptions = ChainOptions & {
  root: string;
  allowlistRoot?: string;
  endTimestamp?: string;
};

type BatchListingStatusOptions = ChainOptions & {
  root: string;
  creator: string;
  contract?: string;
  tokenId?: string;
  proof?: string;
};

async function resolveRootInput(input: string): Promise<`0x${string}`> {
  if (isHex(input) && input.length === 66) return input;
  if (existsSync(input)) {
    const artifact = await loadRootArtifact(input);
    return artifact.root;
  }
  throw new Error(`--root must be a 0x-prefixed bytes32 or a path to a root artifact JSON file. Got: ${input}`);
}

export function batchCommand(): Command {
  const cmd = new Command('batch');
  cmd.description('Batch listing subcommands (tree, merkle, create, cancel, buy, status, set-allowlist)');
  cmd.addCommand(createTreeCommand());
  cmd.addCommand(merkleCommand());
  addBatchListingCommands(cmd);
  return cmd;
}

function createTreeBuildCommand(): Command {
  const cmd = new Command('build');
  cmd.description('Build a batch marketplace token Merkle artifact from CSV or JSON');

  cmd
    .requiredOption('--input <path>', 'CSV, JSON, or artifact token list')
    .option('--format <format>', 'input format (csv, json)')
    .option('--chain-id <id>', 'chain ID to store in the artifact')
    .option('--output <path>', 'write the generated artifact JSON to a file')
    .action(async (opts: TreeInputOptions): Promise<void> => {
      try {
        const artifact = await readBatchTreeArtifact(opts);
        if (opts.output !== undefined) {
          await writeJson(opts.output, artifact);
        }

        output(
          opts.output === undefined
            ? artifact
            : {
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
    .action(async (opts: TreeProofOptions): Promise<void> => {
      try {
        const artifact = await readBatchTreeArtifact(opts);
        const contractAddress = parseAddress(opts.contract, '--contract');
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
          opts.output === undefined
            ? proof
            : {
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
    .option('--proof <path>', 'proof JSON from rare listing batch tree proof')
    .option('--root <bytes32>', 'expected Merkle root; defaults to the input or proof root')
    .option('--format <format>', 'input format (csv, json)')
    .option('--chain-id <id>', 'chain ID to use for artifact/proof checks')
    .action(async (opts: TreeVerifyOptions): Promise<void> => {
      try {
        const artifact = await readBatchTreeArtifact(opts);
        const contractAddress = parseAddress(opts.contract, '--contract');
        const proofInput = opts.proof === undefined ? undefined : await readBatchProofFile(opts.proof);
        const generatedProof =
          proofInput === undefined
            ? getBatchTokenProof({
                artifact,
                contractAddress,
                tokenId: opts.tokenId,
                chainId: opts.chainId,
              })
            : undefined;
        const proof = proofInput?.proof ?? generatedProof?.proof ?? [];
        const root =
          opts.root === undefined
            ? proofInput?.root ?? generatedProof?.root ?? artifact.root
            : normalizeBytes32(opts.root, '--root');

        validateBatchTokenProofInputMatchesTarget(proofInput, {
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

function merkleCommand(): Command {
  const cmd = new Command('merkle');
  cmd.description('Merkle proof artifact generation for batch listings');

  cmd
    .command('proof')
    .description('Generate a proof artifact for one token from a root artifact')
    .requiredOption('--root <path>', 'path to a root artifact JSON file')
    .requiredOption('--contract <address>', 'NFT contract address (must be in the root)')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--buyer <address>', 'buyer address (required if the root has an allowlist)')
    .option('--output <path>', 'write artifact to this path (otherwise stdout)')
    .action(async (opts: MerkleProofOptions): Promise<void> => {
      try {
        const rootArtifact = await loadRootArtifact(opts.root);
        const proof = buildProofArtifact(
          rootArtifact,
          parseAddress(opts.contract, '--contract'),
          opts.tokenId,
          parseOptionalAddress(opts.buyer, '--buyer'),
        );

        if (opts.output !== undefined) {
          await writeArtifact(opts.output, proof);
          log(`Proof artifact written to ${opts.output}`);
        }

        output(proof, () => {
          console.log('\nProof artifact:');
          console.log(`  root:        ${proof.root}`);
          console.log(`  contract:    ${proof.contract}`);
          console.log(`  tokenId:     ${proof.tokenId}`);
          console.log(`  proof depth: ${proof.proof.length}`);
          if (proof.allowListProof !== undefined) {
            console.log(`  allowList:   ${proof.allowListAddress} (depth ${proof.allowListProof.length})`);
          }
          if (opts.output === undefined) {
            console.log('\n(use --output <path> to save the artifact)');
          }
        });
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function addBatchListingCommands(cmd: Command): void {
  cmd
    .command('create')
    .description('Register a sale-price Merkle root from a root artifact')
    .requiredOption('--root <path>', 'path to a root artifact JSON file')
    .option('--yes', 'automatically approve required NFT transfer permissions')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts: BatchListingCreateOptions): Promise<void> => {
      try {
        const chain = getActiveChain(opts.chain, opts.chainId);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const artifact = await loadRootArtifact(opts.root);

        log(`Registering batch listing on ${chain}...`);
        log(`  Marketplace contract: ${rare.contracts.batchListing}`);
        log(`  Root: ${artifact.root}`);
        log(`  Tokens in set: ${artifact.tokens.length}`);
        log(
          `  Amount: ${await formatBatchAmount(publicClient, chain, artifact.currency, BigInt(artifact.amount))}` +
            ` ${isAddressEqual(artifact.currency, ETH_ADDRESS) ? 'ETH' : artifact.currency}`,
        );
        log(`  Auto-approve NFTs: ${opts.yes === true ? 'yes' : 'no'}`);

        const result = await rare.batchListing.create({
          artifact,
          autoApprove: opts.yes === true,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            approvalTxHashes: result.approvalTxHashes ?? null,
            root: artifact.root,
          },
          () => {
            if (result.approvalTxHashes !== undefined && result.approvalTxHashes.length > 0) {
              console.log(`Approval txs: ${result.approvalTxHashes.join(', ')}`);
            }
            console.log(`\nTransaction sent: ${result.txHash}`);
            console.log(`Batch listing registered! Block: ${result.receipt.blockNumber}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  cmd
    .command('cancel')
    .description('Cancel a sale-price Merkle root (by hex root or path to artifact)')
    .requiredOption('--root <hexOrPath>', '0x-prefixed bytes32 root, or path to a root artifact JSON')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts: BatchListingRootOptions): Promise<void> => {
      try {
        const chain = getActiveChain(opts.chain, opts.chainId);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const root = await resolveRootInput(opts.root);

        log(`Cancelling batch listing on ${chain}...`);
        log(`  Root: ${root}`);

        const result = await rare.batchListing.cancel({ root });

        output(
          { txHash: result.txHash, blockNumber: result.receipt.blockNumber.toString(), root },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Batch listing cancelled! Block: ${result.receipt.blockNumber}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  cmd
    .command('buy')
    .description('Buy one token from a batch listing using a proof artifact')
    .requiredOption('--proof <path>', 'path to a proof artifact JSON')
    .requiredOption('--creator <address>', 'address of the listing creator (seller)')
    .requiredOption('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address')
    .requiredOption('--amount <amount>', 'purchase amount in ETH (or token units)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts: BatchListingBuyOptions): Promise<void> => {
      try {
        const chain = getActiveChain(opts.chain, opts.chainId);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const currency = resolveCurrency(opts.currency, chain);
        const proofArtifact = await loadProofArtifact(opts.proof);
        const amount = await parseBatchAmount(publicClient, chain, currency, opts.amount);

        log(`Buying batch-listed token on ${chain}...`);
        log(`  Marketplace contract: ${rare.contracts.batchListing}`);
        log(`  Token: ${proofArtifact.contract}/${proofArtifact.tokenId}`);
        log(`  Root: ${proofArtifact.root}`);
        log(
          `  Amount: ${await formatBatchAmount(publicClient, chain, currency, amount)}` +
            `${isAddressEqual(currency, ETH_ADDRESS) ? ' ETH' : ` ${currency}`}`,
        );

        const result = await rare.batchListing.buy({
          proofArtifact,
          creator: parseAddress(opts.creator, '--creator'),
          currency,
          amount,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            tokenContract: proofArtifact.contract,
            tokenId: proofArtifact.tokenId,
          },
          () => {
            console.log(`\nTransaction sent: ${result.txHash}`);
            console.log(`Token purchased! Block: ${result.receipt.blockNumber}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  cmd
    .command('set-allowlist')
    .description('Attach an allowlist config to an existing batch listing root')
    .requiredOption('--root <hexOrPath>', '0x-prefixed bytes32 root, or path to a root artifact JSON')
    .option('--allowlist-root <hex>', '0x-prefixed bytes32 allowlist root (defaults to root artifact allowList.root)')
    .option('--end-timestamp <unix>', 'allowlist expiry (defaults to root artifact allowList.endTimestamp)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts: BatchListingSetAllowListOptions): Promise<void> => {
      try {
        const chain = getActiveChain(opts.chain, opts.chainId);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const rootArtifact = existsSync(opts.root) ? await loadRootArtifact(opts.root) : undefined;
        const root = rootArtifact?.root ?? await resolveRootInput(opts.root);
        const allowListRoot = opts.allowlistRoot === undefined
          ? rootArtifact?.allowList?.root
          : parseBytes32(opts.allowlistRoot, '--allowlist-root');
        const endTimestamp = opts.endTimestamp ?? rootArtifact?.allowList?.endTimestamp;
        if (allowListRoot === undefined) {
          throw new Error('--allowlist-root is required when --root is not a root artifact with allowList.root');
        }
        if (endTimestamp === undefined) {
          throw new Error('--end-timestamp is required when --root is not a root artifact with allowList.endTimestamp');
        }

        log(`Setting allowlist for batch listing on ${chain}...`);

        const result = await rare.batchListing.setAllowList({
          root,
          allowListRoot,
          endTimestamp,
        });

        output(
          { txHash: result.txHash, blockNumber: result.receipt.blockNumber.toString(), root, allowListRoot },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Allowlist set! Block: ${result.receipt.blockNumber}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  cmd
    .command('status')
    .description('Get batch listing status (read-only). Optionally narrow by token+proof.')
    .requiredOption('--root <hexOrPath>', '0x-prefixed bytes32 root, or path to a root artifact JSON')
    .requiredOption('--creator <address>', 'address of the listing creator')
    .option('--contract <address>', 'NFT contract (with --token-id and --proof, populates tokenInRoot)')
    .option('--token-id <id>', 'token ID')
    .option('--proof <path>', 'path to a proof artifact JSON (its proof[] is used)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts: BatchListingStatusOptions): Promise<void> => {
      try {
        const chain = getActiveChain(opts.chain, opts.chainId);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient });
        const root = await resolveRootInput(opts.root);
        const proofArtifact = opts.proof === undefined ? undefined : await loadProofArtifact(opts.proof);
        const result = await rare.batchListing.getStatus({
          root,
          creator: parseAddress(opts.creator, '--creator'),
          contract: parseOptionalAddress(opts.contract, '--contract'),
          tokenId: opts.tokenId,
          proof: proofArtifact?.proof,
        });
        const formattedAmount = result.hasListing
          ? await formatBatchAmount(publicClient, chain, result.currencyAddress, result.amount)
          : undefined;

        output(result, () => {
          console.log('\nBatch Listing Details:');
          console.log(`  Root:     ${result.root}`);
          console.log(`  Seller:   ${result.seller}`);
          if (!result.hasListing) {
            console.log('  No active listing for this (creator, root) pair.');
          } else {
            console.log(`  Currency: ${result.isEth ? 'ETH' : result.currencyAddress}`);
            console.log(
              `  Amount:   ${formattedAmount ?? ''}${result.isEth ? ' ETH' : ` ${result.currencyAddress}`}`,
            );
            console.log(`  Splits:   ${result.splitRecipients.length} recipient(s) [${result.splitRatios.join(', ')}]`);
            console.log(`  Nonce:    ${result.nonce}`);
          }
          if (result.allowList !== undefined) {
            console.log(`  Allowlist root: ${result.allowList.root}`);
            console.log(`  Allowlist ends: ${result.allowList.endTimestamp}`);
          }
          if (result.tokenInRoot !== undefined) {
            console.log(`  Token in root: ${result.tokenInRoot}`);
            if (result.tokenNonce !== undefined) console.log(`  Token nonce:   ${result.tokenNonce}`);
          }
        });
      } catch (error) {
        printError(error);
      }
    });

}

function parseOptionalAddress(value: string | undefined, field: string): Address | undefined {
  return value === undefined ? undefined : parseAddress(value, field);
}

function parseBytes32(value: string, field: string): `0x${string}` {
  if (!isHex(value) || value.length !== 66) {
    throw new Error(`${field} must be a 0x-prefixed bytes32 hex string`);
  }
  return value;
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

async function readBatchProofFile(inputPath: string): Promise<BatchTokenProofInput> {
  const content = await readFile(inputPath, 'utf8');
  return parseBatchTokenProofInput(content);
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

async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
