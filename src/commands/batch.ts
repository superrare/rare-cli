import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import { getAddress, isAddress, isAddressEqual, isHex, type Address, type Hex, type PublicClient } from 'viem';
import { getPublicClient, getWalletClient } from '../client.js';
import { getActiveChain } from '../config.js';
import { ETH_ADDRESS, chainIds, resolveCurrency, type SupportedChain } from '../contracts/addresses.js';
import { printError } from '../errors.js';
import { output, log } from '../output.js';
import { createRareClient } from '../sdk/client.js';
import type { RareClient } from '../sdk/types.js';
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
import {
  buildMerkleProofArtifact,
  loadMerkleProofArtifact,
  loadMerkleRootArtifact,
  writeMerkleArtifact,
} from '../sdk/merkle.js';
import { parseAddress } from '../sdk/validation.js';
import { createBatchListingListCommand } from './account-market-list.js';
import { runWithNftApprovalConsent, runWithPaymentApprovalConsent } from './approval-consent.js';
import { formatBatchAmount, parseBatchAmount } from './batch-amounts.js';
import { collectSplit, finalizeSplits, formatSplitLines, type SplitAccumulator } from './splits-core.js';

type ChainOptions = {
  chain?: string;
  chainId?: string;
};

type BatchCommandClient = {
  chain: SupportedChain;
  publicClient: PublicClient;
  rare: RareClient;
};

type TreeInputOptions = {
  input: string;
  format?: string;
  output?: string;
  chain?: string;
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

type MerkleProofOptions = {
  input: string;
  contract: string;
  tokenId: string;
  buyer?: string;
  output?: string;
};

type BatchListingCreateOptions = ChainOptions & {
  input: string;
  yes?: boolean;
};

type BatchListingRootOptions = ChainOptions & {
  input?: string;
  root?: string;
  contract?: string;
  tokenId?: string;
};

type BatchListingBuyOptions = ChainOptions & {
  proof?: string;
  root?: string;
  contract?: string;
  tokenId?: string;
  creator: string;
  currency: string;
  price: string;
  amount?: string;
  yes?: boolean;
};

type BatchListingSetAllowListOptions = ChainOptions & {
  input?: string;
  root?: string;
  contract?: string;
  tokenId?: string;
  allowlistRoot?: string;
  endTime?: string;
};

type BatchListingStatusOptions = ChainOptions & {
  root?: string;
  creator: string;
  contract?: string;
  tokenId?: string;
  proof?: string;
};

async function resolveRootInput(input: string): Promise<`0x${string}`> {
  if (isHex(input) && input.length === 66) return input;
  if (existsSync(input)) {
    const artifact = await loadMerkleRootArtifact(input);
    return artifact.root;
  }
  throw new Error(`--root must be a 0x-prefixed bytes32 or a path to a root artifact JSON file. Got: ${input}`);
}

export function listingBatchCommand(): Command {
  const cmd = new Command('batch');
  cmd.description('Batch listing subcommands');
  addBatchListingCommands(cmd);
  return cmd;
}

type OfferRootOptions = {
  root?: string;
  input?: string;
  format?: string;
  chain?: string;
  chainId?: string;
};

type OfferCreateOptions = OfferRootOptions & {
  price: string;
  amount?: string;
  currency?: string;
  endTime: string;
  expiry?: string;
  yes?: boolean;
  chain?: string;
  chainId?: string;
};

type OfferRevokeOptions = OfferRootOptions & {
  chain?: string;
  chainId?: string;
};

type OfferAcceptOptions = {
  creator: string;
  proof?: string;
  root?: string;
  contract: string;
  tokenId: string;
  split?: SplitAccumulator;
  chain?: string;
  chainId?: string;
  yes?: boolean;
};

type OfferStatusOptions = OfferRootOptions & {
  creator: string;
  chain?: string;
  chainId?: string;
};

type AuctionRootInput = {
  root: Hex;
  artifact?: BatchTokenListArtifact;
};

type AuctionCreateOptions = OfferRootOptions & {
  price: string;
  reserve?: string;
  currency?: string;
  endTime: string;
  duration?: string;
  split?: SplitAccumulator;
  chain?: string;
  chainId?: string;
  yes?: boolean;
};

type AuctionCancelOptions = OfferRootOptions & {
  chain?: string;
  chainId?: string;
};

type AuctionBidOptions = {
  creator: string;
  proof?: string;
  root?: string;
  contract: string;
  tokenId: string;
  price: string;
  amount?: string;
  currency?: string;
  chain?: string;
  chainId?: string;
  yes?: boolean;
};

type AuctionSettleOptions = {
  contract: string;
  tokenId: string;
  chain?: string;
  chainId?: string;
};

type AuctionStatusOptions = OfferRootOptions & {
  creator?: string;
  proof?: string;
  contract: string;
  tokenId: string;
  chain?: string;
  chainId?: string;
};

function createUtilsTreeBuildCommand(): Command {
  const cmd = new Command('build');
  cmd.description('Build a token Merkle tree artifact from CSV or JSON');

  cmd
    .requiredOption('--input <path>', 'CSV, JSON, or artifact token list')
    .option('--format <format>', 'input format (csv, json)')
    .option('--chain <chain>', 'chain name to store in the artifact')
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

function createUtilsTreeProofCommand(): Command {
  const cmd = new Command('proof');
  cmd.description('Generate a Merkle tree proof for one token');

  cmd
    .requiredOption('--input <path>', 'token tree artifact, CSV, or JSON token list')
    .requiredOption('--contract <address>', 'token contract address')
    .requiredOption('--token-id <id>', 'token ID to prove')
    .option('--format <format>', 'input format (csv, json)')
    .option('--chain <chain>', 'chain name to store in the proof')
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
          chainId: resolveTreeChainId(opts),
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

function createUtilsTreeVerifyCommand(): Command {
  const cmd = new Command('verify');
  cmd.description('Verify a token Merkle tree proof');

  cmd
    .requiredOption('--input <path>', 'token tree artifact, CSV, or JSON token list')
    .requiredOption('--contract <address>', 'token contract address')
    .requiredOption('--token-id <id>', 'token ID to verify')
    .option('--proof <path>', 'proof JSON from rare utils tree proof')
    .option('--root <bytes32>', 'expected Merkle root; defaults to the input or proof root')
    .option('--format <format>', 'input format (csv, json)')
    .option('--chain <chain>', 'chain name to use for artifact/proof checks')
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
              chainId: resolveTreeChainId(opts),
            })
          : undefined;
        const proof = proofInput?.proof ?? generatedProof?.proof ?? [];
        const root = opts.root === undefined
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

function createOfferCreateCommand(): Command {
  const cmd = new Command('create');
  cmd.description('Create a batch marketplace offer from a token Merkle root');

  cmd
    .option('--root <bytes32>', 'batch token Merkle root override')
    .option('--input <path>', 'batch token artifact, CSV, or JSON token list')
    .option('--format <format>', 'input format for --input (csv, json)')
    .option('--chain-id <id>', 'chain ID to use when building --input')
    .requiredOption('--price <amount>', 'offer price in ETH or token units')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .requiredOption('--end-time <time>', 'unix timestamp or ISO date when the offer expires')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--yes', 'yes to all prompts, including approval and transaction submission')
    .action(async (opts: OfferCreateOptions) => {
      try {
        const root = await resolveOfferRoot(opts);
        const { chain, rare } = createWriteBatchClient(opts.chain, opts.chainId);
        const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;

        log(`Creating batch offer on ${chain}...`);
        log(`  BatchOfferCreator: ${rare.contracts.batchOfferCreator}`);
        log(`  Root: ${root}`);
        log(`  Price: ${opts.price} ${currency === ETH_ADDRESS ? 'ETH' : currency}`);
        log(`  Currency: ${currency === ETH_ADDRESS ? 'ETH' : currency}`);
        log(`  End time: ${opts.endTime}`);
        log('Waiting for confirmation...');

        const createParams = {
          root,
          price: opts.price,
          currency,
          endTime: opts.endTime,
        };
        const result = await runWithPaymentApprovalConsent({
          commandName: 'rare offer batch create',
          approvalMessage: 'ERC20 approval is required before creating this batch offer.',
          runWithoutApproval: async () => rare.offer.batch.create({
            ...createParams,
            autoApprove: opts.yes === true,
          }),
          runWithApproval: async () => rare.offer.batch.create({
            ...createParams,
            autoApprove: true,
          }),
        });
        if (result === undefined) {
          return;
        }

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            approvalTxHash: result.approvalTxHash ?? null,
            batchOfferCreator: result.batchOfferCreator,
            creator: result.creator,
            root: result.root,
            amount: result.amount,
            currency: result.currency,
            expiry: result.expiry,
            requiredPayment: result.requiredPayment,
          },
          () => {
            if (result.approvalTxHash) {
              console.log(`Approval tx sent: ${result.approvalTxHash}`);
            }
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Batch offer created for root: ${result.root}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createOfferRevokeCommand(): Command {
  const cmd = new Command('revoke');
  cmd.description('Revoke a batch marketplace offer');

  cmd
    .option('--root <bytes32>', 'batch token Merkle root override')
    .option('--input <path>', 'batch token artifact, CSV, or JSON token list')
    .option('--format <format>', 'input format for --input (csv, json)')
    .option('--chain-id <id>', 'chain ID to use when building --input')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: OfferRevokeOptions) => {
      try {
        const root = await resolveOfferRoot(opts);
        const { chain, rare } = createWriteBatchClient(opts.chain, opts.chainId);

        log(`Revoking batch offer on ${chain}...`);
        log(`  BatchOfferCreator: ${rare.contracts.batchOfferCreator}`);
        log(`  Root: ${root}`);
        log('Waiting for confirmation...');

        const result = await rare.offer.batch.revoke({ root });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            batchOfferCreator: result.batchOfferCreator,
            creator: result.creator,
            root: result.root,
            amount: result.amount,
            currency: result.currency,
          },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Batch offer revoked for root: ${result.root}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createOfferAcceptCommand(): Command {
  const cmd = new Command('accept');
  cmd.description('Accept a batch marketplace offer for a proof-backed token');

  cmd
    .requiredOption('--creator <address>', 'batch offer creator/buyer address')
    .option('--proof <path>', 'proof JSON from rare utils tree proof')
    .option('--root <bytes32>', 'expected Merkle root; rare-api resolves it when omitted')
    .requiredOption('--contract <address>', 'token contract address')
    .requiredOption('--token-id <id>', 'token ID to accept with')
    .option(
      '--split <addr=ratio>',
      'seller payout split recipient (repeatable). Format: 0xADDR=RATIO. Ratios must sum to 100.',
      collectSplit,
    )
    .option('--yes', 'yes to all prompts, including approval and transaction submission')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: OfferAcceptOptions) => {
      try {
        const creator = parseAddressOption(opts.creator, '--creator');
        const contract = parseAddressOption(opts.contract, '--contract');
        const proofInput = opts.proof === undefined ? undefined : await readBatchProofFile(opts.proof);
        const root = proofInput === undefined
          ? opts.root === undefined ? undefined : parseBytes32(opts.root, '--root')
          : resolveProofRoot(proofInput, opts.root);
        if (proofInput !== undefined && root !== undefined) {
          validateBatchTokenProofInputMatchesTarget(proofInput, {
            artifact: createRootOnlyArtifact(root),
            contractAddress: contract,
            tokenId: opts.tokenId,
            root,
            allowRootOverride: opts.root !== undefined,
          });
        }
        const splits = finalizeSplits(opts.split);
        const { chain, rare } = createWriteBatchClient(opts.chain, opts.chainId);

        log(`Accepting batch offer on ${chain}...`);
        log(`  BatchOfferCreator: ${rare.contracts.batchOfferCreator}`);
        log(`  Creator: ${creator}`);
        log(`  Root: ${root ?? 'rare-api'}`);
        log(`  Token: ${contract} #${opts.tokenId}`);
        if (splits !== undefined) {
          log('  Splits:');
          formatSplitLines(splits).forEach((line) => {
            log(line);
          });
        }
        log('Waiting for confirmation...');

        const acceptParams = {
          creator,
          root,
          proof: proofInput?.proof,
          contract,
          tokenId: opts.tokenId,
          splitAddresses: splits?.addresses,
          splitRatios: splits?.ratios,
        };
        const result = await runWithNftApprovalConsent({
          commandName: 'rare offer batch accept',
          approvalMessage: 'NFT approval is required before accepting this batch offer.',
          runWithoutApproval: async () => rare.offer.batch.accept({
            ...acceptParams,
            autoApprove: opts.yes === true,
          }),
          runWithApproval: async () => rare.offer.batch.accept({
            ...acceptParams,
            autoApprove: true,
          }),
        });
        if (result === undefined) {
          return;
        }

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            approvalTxHash: result.approvalTxHash ?? null,
            batchOfferCreator: result.batchOfferCreator,
            seller: result.seller,
            buyer: result.buyer,
            creator: result.creator,
            contract: result.contract,
            tokenId: result.tokenId,
            root: result.root,
            amount: result.amount,
            currency: result.currency,
          },
          () => {
            if (result.approvalTxHash) {
              console.log(`Approval tx sent: ${result.approvalTxHash}`);
            }
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Batch offer accepted for token: ${result.contract} #${result.tokenId}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createOfferStatusCommand(): Command {
  const cmd = new Command('status');
  cmd.description('Read batch marketplace offer status');

  cmd
    .requiredOption('--creator <address>', 'batch offer creator/buyer address')
    .option('--root <bytes32>', 'batch token Merkle root override')
    .option('--input <path>', 'batch token artifact, CSV, or JSON token list')
    .option('--format <format>', 'input format for --input (csv, json)')
    .option('--chain-id <id>', 'chain ID to use when building --input')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: OfferStatusOptions) => {
      try {
        const root = await resolveOfferRoot(opts);
        const creator = parseAddressOption(opts.creator, '--creator');
        const { chain, publicClient, rare } = createReadBatchClient(opts.chain, opts.chainId);
        const result = await rare.offer.batch.status({ creator, root });
        const expiry = result.expiry > 0n ? new Date(Number(result.expiry) * 1000).toISOString() : 'none';
        const amount = await formatBatchAmount(publicClient, chain, result.currency, result.amount);

        output(result, () => {
          console.log('\nBatch Offer Details:');
          console.log(`  State:     ${result.state}`);
          console.log(`  Creator:   ${result.creator}`);
          console.log(`  Root:      ${result.root}`);
          console.log(`  Amount:    ${amount} ${result.isEth ? 'ETH' : result.currency}`);
          console.log(`  Currency:  ${result.isEth ? 'ETH' : result.currency}`);
          console.log(`  Expiry:    ${expiry}`);
          console.log(`  Fillable:  ${result.fillable ? 'yes' : 'no'}`);
          console.log(`  Revoked:   ${result.revoked === null ? 'unknown' : result.revoked ? 'yes' : 'no'}`);
        });
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createAuctionCreateCommand(): Command {
  const cmd = new Command('create');
  cmd.description('Create a batch reserve auction from a token Merkle root');

  cmd
    .option('--root <bytes32>', 'batch token Merkle root override')
    .option('--input <path>', 'batch token artifact, CSV, or JSON token list')
    .option('--format <format>', 'input format for --input (csv, json)')
    .option('--chain-id <id>', 'chain ID to use when building --input')
    .requiredOption('--price <amount>', 'reserve price in ETH or token units')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .requiredOption('--end-time <time>', 'unix timestamp or ISO date when the auction ends')
    .option(
      '--split <addr=ratio>',
      'seller payout split recipient (repeatable). Format: 0xADDR=RATIO. Ratios must sum to 100.',
      collectSplit,
    )
    .option('--yes', 'yes to all prompts, including approval and transaction submission')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: AuctionCreateOptions) => {
      try {
        const rootInput = await resolveAuctionRootInput(opts);
        const { chain, rare } = createWriteBatchClient(opts.chain, opts.chainId);
        const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
        const splits = finalizeSplits(opts.split);

        log(`Creating batch auction on ${chain}...`);
        log(`  BatchAuctionHouse: ${rare.contracts.batchAuctionHouse}`);
        log(`  Root: ${rootInput.root}`);
        log(`  Price: ${opts.price} ${currency === ETH_ADDRESS ? 'ETH' : currency}`);
        log(`  Currency: ${currency === ETH_ADDRESS ? 'ETH' : currency}`);
        log(`  End time: ${opts.endTime}`);
        if (splits !== undefined) {
          log('  Splits:');
          formatSplitLines(splits).forEach((line) => {
            log(line);
          });
        }
        log('Waiting for confirmation...');

        const createParams = {
          root: rootInput.root,
          artifact: rootInput.artifact,
          price: opts.price,
          currency,
          endTime: opts.endTime,
          splitAddresses: splits?.addresses,
          splitRatios: splits?.ratios,
        };
        const result = await runWithNftApprovalConsent({
          commandName: 'rare auction batch create',
          approvalMessage: 'NFT approval is required before creating this batch auction.',
          runWithoutApproval: async () => rare.auction.batch.create({
            ...createParams,
            autoApprove: opts.yes === true,
          }),
          runWithApproval: async () => rare.auction.batch.create({
            ...createParams,
            autoApprove: true,
          }),
        });
        if (result === undefined) {
          return;
        }

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            approvalTxHashes: result.approvalTxHashes,
            batchAuctionHouse: result.batchAuctionHouse,
            creator: result.creator,
            root: result.root,
            currency: result.currency,
            reserveAmount: result.reserveAmount,
            duration: result.duration,
            nonce: result.nonce,
          },
          () => {
            for (const approvalTxHash of result.approvalTxHashes) {
              console.log(`Approval tx sent: ${approvalTxHash}`);
            }
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Batch auction created for root: ${result.root}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createAuctionCancelCommand(): Command {
  const cmd = new Command('cancel');
  cmd.description('Cancel a batch reserve auction Merkle root');

  cmd
    .option('--root <bytes32>', 'batch token Merkle root override')
    .option('--input <path>', 'batch token artifact, CSV, or JSON token list')
    .option('--format <format>', 'input format for --input (csv, json)')
    .option('--chain-id <id>', 'chain ID to use when building --input')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: AuctionCancelOptions) => {
      try {
        const root = await resolveOfferRoot(opts);
        const { chain, rare } = createWriteBatchClient(opts.chain, opts.chainId);

        log(`Cancelling batch auction on ${chain}...`);
        log(`  BatchAuctionHouse: ${rare.contracts.batchAuctionHouse}`);
        log(`  Root: ${root}`);
        log('Waiting for confirmation...');

        const result = await rare.auction.batch.cancel({ root });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            batchAuctionHouse: result.batchAuctionHouse,
            creator: result.creator,
            root: result.root,
          },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Batch auction cancelled for root: ${result.root}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createAuctionBidCommand(): Command {
  const cmd = new Command('bid');
  cmd.description('Bid on a proof-backed batch reserve auction token');

  cmd
    .requiredOption('--creator <address>', 'batch auction creator/seller address')
    .option('--proof <path>', 'proof JSON from rare utils tree proof')
    .option('--root <bytes32>', 'expected Merkle root; rare-api resolves it when omitted')
    .requiredOption('--contract <address>', 'token contract address')
    .requiredOption('--token-id <id>', 'token ID to bid on')
    .requiredOption('--price <amount>', 'bid price in ETH or token units')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--yes', 'yes to all prompts, including approval and transaction submission')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: AuctionBidOptions) => {
      try {
        const creator = parseAddressOption(opts.creator, '--creator');
        const contract = parseAddressOption(opts.contract, '--contract');
        const proofInput = opts.proof === undefined ? undefined : await readBatchProofFile(opts.proof);
        const root = proofInput === undefined
          ? opts.root === undefined ? undefined : parseBytes32(opts.root, '--root')
          : resolveProofRoot(proofInput, opts.root);
        if (proofInput !== undefined && root !== undefined) {
          validateBatchTokenProofInputMatchesTarget(proofInput, {
            artifact: createRootOnlyArtifact(root),
            contractAddress: contract,
            tokenId: opts.tokenId,
            root,
            allowRootOverride: opts.root !== undefined,
          });
        }
        const { chain, rare } = createWriteBatchClient(opts.chain, opts.chainId);
        const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;

        log(`Bidding on batch auction token on ${chain}...`);
        log(`  BatchAuctionHouse: ${rare.contracts.batchAuctionHouse}`);
        log(`  Creator: ${creator}`);
        log(`  Root: ${root ?? 'rare-api'}`);
        log(`  Token: ${contract} #${opts.tokenId}`);
        log(`  Price: ${opts.price} ${currency === ETH_ADDRESS ? 'ETH' : currency}`);
        log('Waiting for confirmation...');

        const bidParams = {
          creator,
          root,
          proof: proofInput?.proof,
          contract,
          tokenId: opts.tokenId,
          currency,
          price: opts.price,
        };
        const result = await runWithPaymentApprovalConsent({
          commandName: 'rare auction batch bid',
          approvalMessage: 'ERC20 approval is required before placing this batch auction bid.',
          runWithoutApproval: async () => rare.auction.batch.bid({
            ...bidParams,
            autoApprove: opts.yes === true,
          }),
          runWithApproval: async () => rare.auction.batch.bid({
            ...bidParams,
            autoApprove: true,
          }),
        });
        if (result === undefined) {
          return;
        }

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            approvalTxHash: result.approvalTxHash ?? null,
            batchAuctionHouse: result.batchAuctionHouse,
            bidder: result.bidder,
            creator: result.creator,
            contract: result.contract,
            tokenId: result.tokenId,
            root: result.root,
            currency: result.currency,
            amount: result.amount,
            nonce: result.nonce,
            requiredPayment: result.requiredPayment,
          },
          () => {
            if (result.approvalTxHash) {
              console.log(`Approval tx sent: ${result.approvalTxHash}`);
            }
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Batch auction bid placed for token: ${result.contract} #${result.tokenId}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createAuctionSettleCommand(): Command {
  const cmd = new Command('settle');
  cmd.description('Settle a batch reserve auction token');

  cmd
    .requiredOption('--contract <address>', 'token contract address')
    .requiredOption('--token-id <id>', 'token ID to settle')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: AuctionSettleOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const { chain, rare } = createWriteBatchClient(opts.chain, opts.chainId);

        log(`Settling batch auction token on ${chain}...`);
        log(`  BatchAuctionHouse: ${rare.contracts.batchAuctionHouse}`);
        log(`  Token: ${contract} #${opts.tokenId}`);
        log('Waiting for confirmation...');

        const result = await rare.auction.batch.settle({
          contract,
          tokenId: opts.tokenId,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            batchAuctionHouse: result.batchAuctionHouse,
            seller: result.seller,
            bidder: result.bidder,
            contract: result.contract,
            tokenId: result.tokenId,
            currency: result.currency,
            amount: result.amount,
            marketplaceFee: result.marketplaceFee,
          },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Batch auction settled for token: ${result.contract} #${result.tokenId}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createAuctionStatusCommand(): Command {
  const cmd = new Command('status');
  cmd.description('Read batch reserve auction status');

  cmd
    .requiredOption('--contract <address>', 'token contract address')
    .requiredOption('--token-id <id>', 'token ID to inspect')
    .option('--creator <address>', 'batch auction creator/seller address for root config status')
    .option('--root <bytes32>', 'batch token Merkle root override')
    .option('--input <path>', 'batch token artifact, CSV, or JSON token list')
    .option('--proof <path>', 'proof JSON from rare utils tree proof')
    .option('--format <format>', 'input format for --input (csv, json)')
    .option('--chain-id <id>', 'chain ID to use when building --input')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: AuctionStatusOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const rootInput = await resolveOptionalAuctionRootInput(opts);
        const proofInput = opts.proof === undefined ? undefined : await readBatchProofFile(opts.proof);
        const root = proofInput === undefined
          ? rootInput?.root
          : resolveProofRoot(proofInput, rootInput?.root);
        if (proofInput !== undefined && root !== undefined) {
          validateBatchTokenProofInputMatchesTarget(proofInput, {
            artifact: createRootOnlyArtifact(root),
            contractAddress: contract,
            tokenId: opts.tokenId,
            root,
            allowRootOverride: opts.root !== undefined || rootInput !== undefined,
          });
        }
        const creator = opts.creator === undefined ? undefined : parseAddressOption(opts.creator, '--creator');
        const { chain, publicClient, rare } = createReadBatchClient(opts.chain, opts.chainId);
        const result = await rare.auction.batch.status({
          contract,
          tokenId: opts.tokenId,
          creator,
          root,
          artifact: rootInput?.artifact,
          proof: proofInput?.proof,
        });
        const endTime = result.endTime === null ? 'none' : new Date(Number(result.endTime) * 1000).toISOString();
        const startTime = result.startingTime === 0n ? 'not started' : new Date(Number(result.startingTime) * 1000).toISOString();
        const reserveAmount = await formatBatchAmount(publicClient, chain, result.currency, result.reserveAmount);
        const currentBid = await formatBatchAmount(publicClient, chain, result.currentBidCurrency, result.currentBid);

        output(result, () => {
          console.log('\nBatch Auction Details:');
          console.log(`  State:       ${result.state}`);
          console.log(`  Seller:      ${result.seller}`);
          console.log(`  Root:        ${result.root ?? 'unknown'}`);
          console.log(`  Reserve:     ${reserveAmount} ${result.isEth ? 'ETH' : result.currency}`);
          console.log(`  Current bid: ${currentBid} ${result.currentBidCurrency === ETH_ADDRESS ? 'ETH' : result.currentBidCurrency}`);
          console.log(`  Bidder:      ${result.currentBidder ?? 'none'}`);
          console.log(`  Starts:      ${startTime}`);
          console.log(`  Ends:        ${endTime}`);
          console.log(`  Settle:      ${result.settlementEligible ? 'yes' : 'no'}`);
        });
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

export function auctionBatchCommand(): Command {
  const cmd = new Command('batch');
  cmd.description('Create, cancel, bid, settle, and inspect batch reserve auctions');
  cmd.addCommand(createAuctionCreateCommand());
  cmd.addCommand(createAuctionCancelCommand());
  cmd.addCommand(createAuctionBidCommand());
  cmd.addCommand(createAuctionSettleCommand());
  cmd.addCommand(createAuctionStatusCommand());
  return cmd;
}

export function offerBatchCommand(): Command {
  const cmd = new Command('batch');
  cmd.description('Create, revoke, accept, and inspect batch marketplace offers');
  cmd.addCommand(createOfferCreateCommand());
  cmd.addCommand(createOfferRevokeCommand());
  cmd.addCommand(createOfferAcceptCommand());
  cmd.addCommand(createOfferStatusCommand());
  return cmd;
}

export function createUtilsTreeCommand(): Command {
  const cmd = new Command('tree');
  cmd.description('Build, prove, and verify token Merkle trees');
  cmd.addCommand(createUtilsTreeBuildCommand());
  cmd.addCommand(createUtilsTreeProofCommand());
  cmd.addCommand(createUtilsTreeVerifyCommand());
  return cmd;
}

export function createUtilsMerkleCommand(): Command {
  const cmd = new Command('merkle');
  cmd.description('Merkle proof artifact utilities');

  cmd
    .command('proof')
    .description('Generate a proof artifact for one token from a root artifact')
    .requiredOption('--input <path>', 'path to a root artifact JSON file')
    .requiredOption('--contract <address>', 'NFT contract address (must be in the root)')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--buyer <address>', 'buyer address (required if the root has an allowlist)')
    .option('--output <path>', 'write artifact to this path (otherwise stdout)')
    .action(async (opts: MerkleProofOptions): Promise<void> => {
      try {
        const rootArtifact = await loadMerkleRootArtifact(opts.input);
        const proof = buildMerkleProofArtifact(
          rootArtifact,
          parseAddress(opts.contract, '--contract'),
          opts.tokenId,
          parseOptionalAddress(opts.buyer, '--buyer'),
        );

        if (opts.output !== undefined) {
          await writeMerkleArtifact(opts.output, proof);
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
  cmd.addCommand(createBatchListingListCommand());

  cmd
    .command('create')
    .description('Register a sale-price Merkle root from a root artifact')
    .requiredOption('--input <path>', 'path to a root artifact JSON file')
    .option('--yes', 'yes to all prompts and required approvals')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts: BatchListingCreateOptions): Promise<void> => {
      try {
        const chain = getActiveChain(opts.chain, opts.chainId);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const artifact = await loadMerkleRootArtifact(opts.input);

        log(`Registering batch listing on ${chain}...`);
        log(`  Marketplace contract: ${rare.contracts.batchListing}`);
        log('  Root: rare-api canonical root from artifact');
        log(`  Tokens in set: ${artifact.tokens.length}`);
        log(
          `  Amount: ${await formatBatchAmount(publicClient, chain, artifact.currency, BigInt(artifact.amount))}` +
            ` ${isAddressEqual(artifact.currency, ETH_ADDRESS) ? 'ETH' : artifact.currency}`,
        );
        log(`  Auto-approve NFTs: ${opts.yes === true ? 'yes' : 'no'}`);

        const result = await runWithNftApprovalConsent({
          commandName: 'rare listing batch create',
          approvalMessage: 'NFT approval is required before creating this batch listing.',
          runWithoutApproval: async () => rare.listing.batch.create({
            artifact,
            autoApprove: opts.yes === true,
          }),
          runWithApproval: async () => rare.listing.batch.create({
            artifact,
            autoApprove: true,
          }),
        });
        if (result === undefined) {
          return;
        }

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            approvalTxHashes: result.approvalTxHashes ?? null,
            root: result.root,
          },
          () => {
            if (result.approvalTxHashes !== undefined && result.approvalTxHashes.length > 0) {
              console.log(`Approval txs: ${result.approvalTxHashes.join(', ')}`);
            }
            console.log(`\nTransaction sent: ${result.txHash}`);
            console.log(`Root: ${result.root}`);
            console.log(`Batch listing registered! Block: ${result.receipt.blockNumber}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  cmd
    .command('cancel')
    .description('Cancel a sale-price Merkle root')
    .option('--input <path>', 'path to a root artifact JSON')
    .option('--root <hex>', '0x-prefixed bytes32 root override')
    .option('--contract <address>', 'NFT contract address; used with --token-id when rare-api resolves the root')
    .option('--token-id <id>', 'token ID; used with --contract when rare-api resolves the root')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts: BatchListingRootOptions): Promise<void> => {
      try {
        const chain = getActiveChain(opts.chain, opts.chainId);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const artifact = opts.input === undefined ? undefined : await loadMerkleRootArtifact(opts.input);
        const root = opts.root === undefined ? undefined : parseBytes32(opts.root, '--root');
        const contract = parseOptionalAddress(opts.contract, '--contract');

        log(`Cancelling batch listing on ${chain}...`);
        log(`  Root: ${root ?? artifact?.root ?? 'rare-api'}`);

        const result = await rare.listing.batch.cancel({
          root,
          artifact,
          contract,
          tokenId: opts.tokenId,
        });

        output(
          { txHash: result.txHash, blockNumber: result.receipt.blockNumber.toString(), root: result.root },
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
    .description('Buy one token from a batch listing using a proof artifact or rare-api proof resolution')
    .option('--proof <path>', 'path to a proof artifact JSON')
    .option('--root <hex>', 'batch listing Merkle root; rare-api resolves it when omitted')
    .option('--contract <address>', 'NFT contract address; required when --proof is omitted')
    .option('--token-id <id>', 'token ID; required when --proof is omitted')
    .requiredOption('--creator <address>', 'address of the listing creator (seller)')
    .requiredOption('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address')
    .requiredOption('--price <amount>', 'purchase price in ETH (or token units)')
    .option('--yes', 'yes to all prompts and required approvals')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts: BatchListingBuyOptions): Promise<void> => {
      try {
        const proofArtifact = opts.proof === undefined ? undefined : await loadMerkleProofArtifact(opts.proof);
        const contract = proofArtifact?.contract ?? parseOptionalAddress(opts.contract, '--contract');
        const tokenId = proofArtifact?.tokenId ?? opts.tokenId;
        if (proofArtifact === undefined && (contract === undefined || tokenId === undefined)) {
          throw new Error('Pass --contract and --token-id so rare-api can resolve the batch listing proof, or pass --proof as an override.');
        }
        const chain = getActiveChain(opts.chain, opts.chainId);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const currency = resolveCurrency(opts.currency, chain);
        const amount = await parseBatchAmount(publicClient, chain, currency, opts.price);

        log(`Buying batch-listed token on ${chain}...`);
        log(`  Marketplace contract: ${rare.contracts.batchListing}`);
        log(`  Token: ${contract}/${tokenId}`);
        log(`  Root: ${proofArtifact?.root ?? opts.root ?? 'rare-api'}`);
        log(
          `  Amount: ${await formatBatchAmount(publicClient, chain, currency, amount)}` +
            `${isAddressEqual(currency, ETH_ADDRESS) ? ' ETH' : ` ${currency}`}`,
        );

        const buyParams = {
          proofArtifact,
          root: opts.root === undefined ? undefined : parseBytes32(opts.root, '--root'),
          contract,
          tokenId,
          creator: parseAddress(opts.creator, '--creator'),
          currency,
          price: amount,
        };
        const result = await runWithPaymentApprovalConsent({
          commandName: 'rare listing batch buy',
          approvalMessage: 'ERC20 approval is required before buying this batch listing token.',
          runWithoutApproval: async () => rare.listing.batch.buy({
            ...buyParams,
            autoApprove: opts.yes === true,
          }),
          runWithApproval: async () => rare.listing.batch.buy({
            ...buyParams,
            autoApprove: true,
          }),
        });
        if (result === undefined) {
          return;
        }

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            approvalTxHash: result.approvalTxHash ?? null,
            tokenContract: contract,
            tokenId,
          },
          () => {
            if (result.approvalTxHash) {
              console.log(`Approval tx sent: ${result.approvalTxHash}`);
            }
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
    .option('--input <path>', 'path to a root artifact JSON with allowList addresses')
    .option('--root <hex>', '0x-prefixed bytes32 root override')
    .option('--contract <address>', 'NFT contract address; used with --token-id when rare-api resolves the root')
    .option('--token-id <id>', 'token ID; used with --contract when rare-api resolves the root')
    .option('--allowlist-root <hex>', '0x-prefixed bytes32 allowlist root override')
    .option('--end-time <unix>', 'allowlist expiry (defaults to root artifact allowList.endTimestamp)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts: BatchListingSetAllowListOptions): Promise<void> => {
      try {
        const chain = getActiveChain(opts.chain, opts.chainId);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const artifact = opts.input === undefined ? undefined : await loadMerkleRootArtifact(opts.input);
        const root = opts.root === undefined ? undefined : parseBytes32(opts.root, '--root');
        const contract = parseOptionalAddress(opts.contract, '--contract');
        const allowListRoot = opts.allowlistRoot === undefined
          ? undefined
          : parseBytes32(opts.allowlistRoot, '--allowlist-root');
        const endTime = opts.endTime ?? artifact?.allowList?.endTimestamp;

        log(`Setting allowlist for batch listing on ${chain}...`);
        log(`  Root: ${root ?? artifact?.root ?? 'rare-api'}`);
        log(`  Allowlist root: ${allowListRoot ?? (artifact?.allowList === undefined ? 'missing' : 'rare-api')}`);

        const result = await rare.listing.batch.setAllowlist({
          root,
          artifact,
          contract,
          tokenId: opts.tokenId,
          allowListRoot,
          endTime,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            root: result.root,
            allowListRoot: result.allowListRoot,
            endTime: result.endTime,
          },
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
    .description('Get batch listing status (read-only). Optionally resolve root/proof from rare-api by token.')
    .option('--root <hexOrPath>', '0x-prefixed bytes32 root, or path to a root artifact JSON')
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
        const root = opts.root === undefined ? undefined : await resolveRootInput(opts.root);
        const proofArtifact = opts.proof === undefined ? undefined : await loadMerkleProofArtifact(opts.proof);
        const result = await rare.listing.batch.status({
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

async function readBatchTreeArtifact(opts: TreeInputOptions): Promise<BatchTokenListArtifact> {
  const format = parseFormatOption(opts.format);
  const content = await readFile(opts.input, 'utf8');
  return parseBatchTokenListArtifactOrBuild({
    content,
    format,
    sourceName: opts.input,
    chainId: resolveTreeChainId(opts),
  });
}

function resolveTreeChainId(opts: { chain?: string; chainId?: string }): string | undefined {
  if (opts.chain === undefined) {
    return opts.chainId;
  }

  const chain = getActiveChain(opts.chain, opts.chainId);
  return String(chainIds[chain]);
}

async function resolveOfferRoot(opts: OfferRootOptions): Promise<Hex> {
  return (await resolveAuctionRootInput(opts)).root;
}

async function resolveAuctionRootInput(opts: OfferRootOptions): Promise<AuctionRootInput> {
  const directRoot = opts.root === undefined ? undefined : normalizeBytes32(opts.root, '--root');
  if (opts.input === undefined) {
    if (directRoot === undefined) {
      throw new Error('Pass --input, or pass --root as an override.');
    }
    return { root: directRoot };
  }

  const artifact = await readBatchTreeArtifact({
    input: opts.input,
    format: opts.format,
    chain: opts.chain,
    chainId: opts.chainId,
  });
  if (directRoot !== undefined && directRoot !== artifact.root) {
    throw new Error('--root does not match --input artifact root.');
  }

  return {
    root: artifact.root,
    artifact,
  };
}

async function resolveOptionalAuctionRootInput(opts: OfferRootOptions): Promise<AuctionRootInput | undefined> {
  if (opts.root === undefined && opts.input === undefined) {
    return undefined;
  }

  return resolveAuctionRootInput(opts);
}

function resolveProofRoot(proofInput: BatchTokenProofInput, rawRoot: string | undefined): Hex {
  const root = rawRoot === undefined ? proofInput.root : normalizeBytes32(rawRoot, '--root');
  if (root === undefined) {
    throw new Error('Proof overrides must include a root field, or pass --root as an override.');
  }
  if (proofInput.root !== undefined && proofInput.root !== root) {
    throw new Error('Proof root does not match --root.');
  }
  return root;
}

function createRootOnlyArtifact(root: Hex): BatchTokenListArtifact {
  return {
    version: 1,
    type: 'rare-batch-token-list',
    root,
    count: 0,
    tokens: [],
    entries: [],
  };
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

function parseAddressOption(value: string, optionName: string): Address {
  if (!isAddress(value)) {
    throw new Error(`${optionName} must be a valid 0x address.`);
  }

  return getAddress(value);
}

function createReadBatchClient(chainInput: string | undefined, chainIdInput: string | undefined): BatchCommandClient {
  const chain = getActiveChain(chainInput, chainIdInput);
  const publicClient = getPublicClient(chain);
  return {
    chain,
    publicClient,
    rare: createRareClient({ publicClient }),
  };
}

function createWriteBatchClient(chainInput: string | undefined, chainIdInput: string | undefined): BatchCommandClient {
  const chain = getActiveChain(chainInput, chainIdInput);
  const { client } = getWalletClient(chain);
  const publicClient = getPublicClient(chain);
  return {
    chain,
    publicClient,
    rare: createRareClient({ publicClient, walletClient: client }),
  };
}
async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
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
