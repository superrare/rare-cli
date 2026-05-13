import { readFile, writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import { formatEther, getAddress, isAddress, type Address, type Hex } from 'viem';
import { getPublicClient, getWalletClient } from '../client.js';
import { getActiveChain } from '../config.js';
import { resolveCurrency, type SupportedChain } from '../contracts/addresses.js';
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
import { ETH_ADDRESS } from '../sdk/helpers.js';

type BatchCommandClient = {
  chain: SupportedChain;
  rare: RareClient;
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

type OfferRootOptions = {
  root?: string;
  input?: string;
  format?: string;
  chainId?: string;
};

type OfferCreateOptions = OfferRootOptions & {
  amount: string;
  currency?: string;
  expiry: string;
  chain?: string;
};

type OfferRevokeOptions = OfferRootOptions & {
  chain?: string;
};

type OfferAcceptOptions = {
  creator: string;
  proof: string;
  root?: string;
  contract: string;
  tokenId: string;
  splitRecipient?: string[];
  splitRatio?: string[];
  chain?: string;
  autoApprove?: boolean;
};

type OfferStatusOptions = OfferRootOptions & {
  creator: string;
  chain?: string;
};

type AuctionRootInput = {
  root: Hex;
  artifact?: BatchTokenListArtifact;
};

type AuctionCreateOptions = OfferRootOptions & {
  reserve: string;
  currency?: string;
  duration: string;
  splitRecipient?: string[];
  splitRatio?: string[];
  chain?: string;
  autoApprove?: boolean;
};

type AuctionCancelOptions = OfferRootOptions & {
  chain?: string;
};

type AuctionBidOptions = {
  creator: string;
  proof: string;
  root?: string;
  contract: string;
  tokenId: string;
  amount: string;
  currency?: string;
  chain?: string;
  autoApprove?: boolean;
};

type AuctionSettleOptions = {
  contract: string;
  tokenId: string;
  chain?: string;
};

type AuctionStatusOptions = OfferRootOptions & {
  creator?: string;
  proof?: string;
  contract: string;
  tokenId: string;
  chain?: string;
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
    .option('--root <bytes32>', 'batch token Merkle root')
    .option('--input <path>', 'batch token artifact, CSV, or JSON token list')
    .option('--format <format>', 'input format for --input (csv, json)')
    .option('--chain-id <id>', 'chain ID to use when building --input')
    .requiredOption('--amount <amount>', 'offer amount in ETH or token units')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .requiredOption('--expiry <seconds>', 'unix timestamp when the offer expires')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: OfferCreateOptions) => {
      try {
        const root = await resolveOfferRoot(opts);
        const { chain, rare } = createWriteBatchClient(opts.chain);
        const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;

        log(`Creating batch offer on ${chain}...`);
        log(`  BatchOfferCreator: ${rare.contracts.batchOfferCreator}`);
        log(`  Root: ${root}`);
        log(`  Amount: ${opts.amount} ${currency === ETH_ADDRESS ? 'ETH' : currency}`);
        log(`  Currency: ${currency === ETH_ADDRESS ? 'ETH' : currency}`);
        log(`  Expiry: ${opts.expiry}`);
        log('Waiting for confirmation...');

        const result = await rare.batch.offer.create({
          root,
          amount: opts.amount,
          currency,
          expiry: opts.expiry,
        });

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
    .option('--root <bytes32>', 'batch token Merkle root')
    .option('--input <path>', 'batch token artifact, CSV, or JSON token list')
    .option('--format <format>', 'input format for --input (csv, json)')
    .option('--chain-id <id>', 'chain ID to use when building --input')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: OfferRevokeOptions) => {
      try {
        const root = await resolveOfferRoot(opts);
        const { chain, rare } = createWriteBatchClient(opts.chain);

        log(`Revoking batch offer on ${chain}...`);
        log(`  BatchOfferCreator: ${rare.contracts.batchOfferCreator}`);
        log(`  Root: ${root}`);
        log('Waiting for confirmation...');

        const result = await rare.batch.offer.revoke({ root });

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
    .requiredOption('--proof <path>', 'proof JSON from rare batch tree proof')
    .option('--root <bytes32>', 'expected Merkle root; defaults to proof root')
    .requiredOption('--contract <address>', 'token contract address')
    .requiredOption('--token-id <id>', 'token ID to accept with')
    .option('--split-recipient <address>', 'seller split recipient; repeat with --split-ratio', collect, [])
    .option('--split-ratio <percent>', 'seller split ratio percentage; repeat with --split-recipient', collect, [])
    .option('--no-auto-approve', 'do not auto-approve the NFT transfer')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: OfferAcceptOptions) => {
      try {
        const creator = parseAddressOption(opts.creator, '--creator');
        const contract = parseAddressOption(opts.contract, '--contract');
        const proofInput = await readBatchProofFile(opts.proof);
        const root = resolveProofRoot(proofInput, opts.root);
        validateBatchTokenProofInputMatchesTarget(proofInput, {
          artifact: { root } as BatchTokenListArtifact,
          contractAddress: contract,
          tokenId: opts.tokenId,
          root,
          allowRootOverride: opts.root !== undefined,
        });
        const splitAddresses = parseSplitRecipients(opts.splitRecipient);
        const splitRatios = parseSplitRatios(opts.splitRatio);
        const { chain, rare } = createWriteBatchClient(opts.chain);

        log(`Accepting batch offer on ${chain}...`);
        log(`  BatchOfferCreator: ${rare.contracts.batchOfferCreator}`);
        log(`  Creator: ${creator}`);
        log(`  Root: ${root}`);
        log(`  Token: ${contract} #${opts.tokenId}`);
        if (splitAddresses !== undefined) {
          log(`  Split recipients: ${splitAddresses.join(', ')}`);
          log(`  Split ratios: ${splitRatios?.join(', ') ?? ''}`);
        }
        log('Waiting for confirmation...');

        const result = await rare.batch.offer.accept({
          creator,
          root,
          proof: proofInput.proof,
          contract,
          tokenId: opts.tokenId,
          splitAddresses,
          splitRatios,
          autoApprove: opts.autoApprove,
        });

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
    .option('--root <bytes32>', 'batch token Merkle root')
    .option('--input <path>', 'batch token artifact, CSV, or JSON token list')
    .option('--format <format>', 'input format for --input (csv, json)')
    .option('--chain-id <id>', 'chain ID to use when building --input')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: OfferStatusOptions) => {
      try {
        const root = await resolveOfferRoot(opts);
        const creator = parseAddressOption(opts.creator, '--creator');
        const { rare } = createReadBatchClient(opts.chain);
        const result = await rare.batch.offer.getStatus({ creator, root });
        const expiry = result.expiry > 0n ? new Date(Number(result.expiry) * 1000).toISOString() : 'none';

        output(result, () => {
          console.log('\nBatch Offer Details:');
          console.log(`  State:     ${result.state}`);
          console.log(`  Creator:   ${result.creator}`);
          console.log(`  Root:      ${result.root}`);
          console.log(`  Amount:    ${formatEther(result.amount)} ${result.isEth ? 'ETH' : result.currency}`);
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
    .option('--root <bytes32>', 'batch token Merkle root')
    .option('--input <path>', 'batch token artifact, CSV, or JSON token list')
    .option('--format <format>', 'input format for --input (csv, json)')
    .option('--chain-id <id>', 'chain ID to use when building --input')
    .requiredOption('--reserve <amount>', 'reserve amount in ETH or token units')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .requiredOption('--duration <seconds>', 'auction duration in seconds after reserve is met')
    .option('--split-recipient <address>', 'seller split recipient; repeat with --split-ratio', collect, [])
    .option('--split-ratio <percent>', 'seller split ratio percentage; repeat with --split-recipient', collect, [])
    .option('--no-auto-approve', 'do not auto-approve token contracts from --input')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: AuctionCreateOptions) => {
      try {
        const rootInput = await resolveAuctionRootInput(opts);
        const { chain, rare } = createWriteBatchClient(opts.chain);
        const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
        const splitAddresses = parseSplitRecipients(opts.splitRecipient);
        const splitRatios = parseSplitRatios(opts.splitRatio);

        log(`Creating batch auction on ${chain}...`);
        log(`  BatchAuctionHouse: ${rare.contracts.batchAuctionHouse}`);
        log(`  Root: ${rootInput.root}`);
        log(`  Reserve: ${opts.reserve} ${currency === ETH_ADDRESS ? 'ETH' : currency}`);
        log(`  Currency: ${currency === ETH_ADDRESS ? 'ETH' : currency}`);
        log(`  Duration: ${opts.duration}`);
        if (splitAddresses !== undefined) {
          log(`  Split recipients: ${splitAddresses.join(', ')}`);
          log(`  Split ratios: ${splitRatios?.join(', ') ?? ''}`);
        }
        log('Waiting for confirmation...');

        const result = await rare.batch.auction.create({
          root: rootInput.root,
          artifact: rootInput.artifact,
          reserveAmount: opts.reserve,
          currency,
          duration: opts.duration,
          splitAddresses,
          splitRatios,
          autoApprove: opts.autoApprove,
        });

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
    .option('--root <bytes32>', 'batch token Merkle root')
    .option('--input <path>', 'batch token artifact, CSV, or JSON token list')
    .option('--format <format>', 'input format for --input (csv, json)')
    .option('--chain-id <id>', 'chain ID to use when building --input')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: AuctionCancelOptions) => {
      try {
        const root = await resolveOfferRoot(opts);
        const { chain, rare } = createWriteBatchClient(opts.chain);

        log(`Cancelling batch auction on ${chain}...`);
        log(`  BatchAuctionHouse: ${rare.contracts.batchAuctionHouse}`);
        log(`  Root: ${root}`);
        log('Waiting for confirmation...');

        const result = await rare.batch.auction.cancel({ root });

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
    .requiredOption('--proof <path>', 'proof JSON from rare batch tree proof')
    .option('--root <bytes32>', 'expected Merkle root; defaults to proof root')
    .requiredOption('--contract <address>', 'token contract address')
    .requiredOption('--token-id <id>', 'token ID to bid on')
    .requiredOption('--amount <amount>', 'bid amount in ETH or token units')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--no-auto-approve', 'do not auto-approve ERC20 allowance')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: AuctionBidOptions) => {
      try {
        const creator = parseAddressOption(opts.creator, '--creator');
        const contract = parseAddressOption(opts.contract, '--contract');
        const proofInput = await readBatchProofFile(opts.proof);
        const root = resolveProofRoot(proofInput, opts.root);
        validateBatchTokenProofInputMatchesTarget(proofInput, {
          artifact: { root } as BatchTokenListArtifact,
          contractAddress: contract,
          tokenId: opts.tokenId,
          root,
          allowRootOverride: opts.root !== undefined,
        });
        const { chain, rare } = createWriteBatchClient(opts.chain);
        const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;

        log(`Bidding on batch auction token on ${chain}...`);
        log(`  BatchAuctionHouse: ${rare.contracts.batchAuctionHouse}`);
        log(`  Creator: ${creator}`);
        log(`  Root: ${root}`);
        log(`  Token: ${contract} #${opts.tokenId}`);
        log(`  Amount: ${opts.amount} ${currency === ETH_ADDRESS ? 'ETH' : currency}`);
        log('Waiting for confirmation...');

        const result = await rare.batch.auction.bid({
          creator,
          root,
          proof: proofInput.proof,
          contract,
          tokenId: opts.tokenId,
          currency,
          amount: opts.amount,
          autoApprove: opts.autoApprove,
        });

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
    .action(async (opts: AuctionSettleOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const { chain, rare } = createWriteBatchClient(opts.chain);

        log(`Settling batch auction token on ${chain}...`);
        log(`  BatchAuctionHouse: ${rare.contracts.batchAuctionHouse}`);
        log(`  Token: ${contract} #${opts.tokenId}`);
        log('Waiting for confirmation...');

        const result = await rare.batch.auction.settle({
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
    .option('--root <bytes32>', 'batch token Merkle root')
    .option('--input <path>', 'batch token artifact, CSV, or JSON token list')
    .option('--proof <path>', 'proof JSON from rare batch tree proof')
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
            artifact: { root } as BatchTokenListArtifact,
            contractAddress: contract,
            tokenId: opts.tokenId,
            root,
            allowRootOverride: opts.root !== undefined || rootInput !== undefined,
          });
        }
        const creator = opts.creator === undefined ? undefined : parseAddressOption(opts.creator, '--creator');
        const { rare } = createReadBatchClient(opts.chain);
        const result = await rare.batch.auction.getStatus({
          contract,
          tokenId: opts.tokenId,
          creator,
          root,
          artifact: rootInput?.artifact,
          proof: proofInput?.proof,
        });
        const endTime = result.endTime === null ? 'none' : new Date(Number(result.endTime) * 1000).toISOString();
        const startTime = result.startingTime === 0n ? 'not started' : new Date(Number(result.startingTime) * 1000).toISOString();

        output(result, () => {
          console.log('\nBatch Auction Details:');
          console.log(`  State:       ${result.state}`);
          console.log(`  Seller:      ${result.seller}`);
          console.log(`  Root:        ${result.root ?? 'unknown'}`);
          console.log(`  Reserve:     ${formatEther(result.reserveAmount)} ${result.isEth ? 'ETH' : result.currency}`);
          console.log(`  Current bid: ${formatEther(result.currentBid)} ${result.currentBidCurrency === ETH_ADDRESS ? 'ETH' : result.currentBidCurrency}`);
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

function createAuctionCommand(): Command {
  const cmd = new Command('auction');
  cmd.description('Create, cancel, bid, settle, and inspect batch reserve auctions');
  cmd.addCommand(createAuctionCreateCommand());
  cmd.addCommand(createAuctionCancelCommand());
  cmd.addCommand(createAuctionBidCommand());
  cmd.addCommand(createAuctionSettleCommand());
  cmd.addCommand(createAuctionStatusCommand());
  return cmd;
}

function createOfferCommand(): Command {
  const cmd = new Command('offer');
  cmd.description('Create, revoke, accept, and inspect batch marketplace offers');
  cmd.addCommand(createOfferCreateCommand());
  cmd.addCommand(createOfferRevokeCommand());
  cmd.addCommand(createOfferAcceptCommand());
  cmd.addCommand(createOfferStatusCommand());
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
  cmd.addCommand(createOfferCommand());
  cmd.addCommand(createAuctionCommand());
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

async function resolveOfferRoot(opts: OfferRootOptions): Promise<Hex> {
  return (await resolveAuctionRootInput(opts)).root;
}

async function resolveAuctionRootInput(opts: OfferRootOptions): Promise<AuctionRootInput> {
  const directRoot = opts.root === undefined ? undefined : normalizeBytes32(opts.root, '--root');
  if (opts.input === undefined) {
    if (directRoot === undefined) {
      throw new Error('Pass --root or --input.');
    }
    return { root: directRoot };
  }

  const artifact = await readBatchTreeArtifact({
    input: opts.input,
    format: opts.format,
    chainId: opts.chainId,
  });
  if (directRoot !== undefined && directRoot.toLowerCase() !== artifact.root.toLowerCase()) {
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
    throw new Error('Pass --root or a proof artifact with a root field.');
  }
  if (proofInput.root !== undefined && proofInput.root.toLowerCase() !== root.toLowerCase()) {
    throw new Error('Proof root does not match --root.');
  }
  return root;
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

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseSplitRecipients(values: string[] | undefined): Address[] | undefined {
  if (values === undefined || values.length === 0) {
    return undefined;
  }

  return values.map((value, index) => {
    if (!isAddress(value)) {
      throw new Error(`--split-recipient at index ${index} must be a valid 0x address.`);
    }
    return getAddress(value);
  });
}

function parseSplitRatios(values: string[] | undefined): number[] | undefined {
  if (values === undefined || values.length === 0) {
    return undefined;
  }

  return values.map((value, index) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw new Error(`--split-ratio at index ${index} must be an integer.`);
    }
    return parsed;
  });
}

function createReadBatchClient(chainInput: string | undefined): BatchCommandClient {
  const chain = getActiveChain(chainInput);
  const publicClient = getPublicClient(chain);
  return {
    chain,
    rare: createRareClient({ publicClient }),
  };
}

function createWriteBatchClient(chainInput: string | undefined): BatchCommandClient {
  const chain = getActiveChain(chainInput);
  const { client } = getWalletClient(chain);
  const publicClient = getPublicClient(chain);
  return {
    chain,
    rare: createRareClient({ publicClient, walletClient: client }),
  };
}
async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
