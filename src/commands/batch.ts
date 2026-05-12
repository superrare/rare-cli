import { existsSync } from 'node:fs';
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
  buildRootArtifact,
  loadAllowList,
  loadProofArtifact,
  loadRootArtifact,
  loadTokenSet,
  writeArtifact,
} from '../sdk/merkle.js';
import { parseAddress } from '../sdk/validation.js';
import { formatBatchAmount, parseBatchAmount } from './batch-amounts.js';

type ChainOptions = {
  chain?: string;
  chainId?: string;
};

type MerkleRootOptions = ChainOptions & {
  tokens: string;
  currency: string;
  amount: string;
  split?: string[];
  allowlist?: string;
  endTimestamp?: string;
  output?: string;
};

type MerkleProofOptions = {
  root: string;
  contract: string;
  tokenId: string;
  buyer?: string;
  output?: string;
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
  allowlistRoot: string;
  endTimestamp: string;
};

type BatchListingStatusOptions = ChainOptions & {
  root: string;
  creator: string;
  contract?: string;
  tokenId?: string;
  proof?: string;
};

type ParsedSplits = {
  splitAddresses: Address[];
  splitRatios: number[];
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
  cmd.description('Batch subcommands (merkle, listing)');
  cmd.addCommand(merkleCommand());
  cmd.addCommand(batchListingCommand());
  return cmd;
}

function merkleCommand(): Command {
  const cmd = new Command('merkle');
  cmd.description('Merkle artifact generation (root, proof) for batch listings');

  cmd
    .command('root')
    .description('Generate a root artifact JSON from a token-set file')
    .requiredOption('--tokens <path>', 'JSON file with token set: [{contract, tokenId}] or {tokens: [...]}')
    .requiredOption('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address')
    .requiredOption('--amount <amount>', 'sale amount in ETH (or token units)')
    .option('--split <addr=ratio>', 'payout split recipient and ratio; repeatable', collect)
    .option('--allowlist <path>', 'optional allowlist file (string[] or {addresses, root?})')
    .option('--end-timestamp <unix>', 'optional allowlist expiry (unix seconds)')
    .option('--output <path>', 'write artifact to this path (otherwise stdout)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts: MerkleRootOptions): Promise<void> => {
      try {
        const chain = getActiveChain(opts.chain, opts.chainId);
        const publicClient = getPublicClient(chain);
        const tokens = await loadTokenSet(opts.tokens);
        const currency = resolveCurrency(opts.currency, chain);
        const amount = await parseBatchAmount(publicClient, chain, currency, opts.amount);
        const { splitAddresses, splitRatios } = parseSplitOptions(opts.split);
        const allowList = opts.allowlist === undefined ? undefined : await loadAllowList(opts.allowlist);

        const artifact = buildRootArtifact({
          tokens,
          currency,
          amount,
          splitAddresses,
          splitRatios,
          allowListAddresses: allowList?.addresses,
          allowListEndTimestamp: opts.endTimestamp ?? allowList?.endTimestamp?.toString(),
        });

        if (opts.output !== undefined) {
          await writeArtifact(opts.output, artifact);
          log(`Root artifact written to ${opts.output}`);
        }

        const formattedAmount = await formatBatchAmount(publicClient, chain, artifact.currency, BigInt(artifact.amount));
        output(artifact, () => {
          console.log('\nRoot artifact:');
          console.log(`  root:           ${artifact.root}`);
          console.log(`  currency:       ${artifact.currency}`);
          console.log(
            `  amount:         ${formattedAmount} ${isAddressEqual(artifact.currency, ETH_ADDRESS) ? 'ETH' : artifact.currency}`,
          );
          console.log(`  tokens:         ${artifact.tokens.length}`);
          if (artifact.allowList !== undefined) {
            console.log(`  allowlist root: ${artifact.allowList.root}`);
            console.log(`  allowlist size: ${artifact.allowList.addresses.length}`);
          }
          if (opts.output === undefined) {
            console.log('\n(use --output <path> to save the artifact)');
          }
        });
      } catch (error) {
        printError(error);
      }
    });

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

function batchListingCommand(): Command {
  const cmd = new Command('listing');
  cmd.description('Batch listing subcommands (create, cancel, buy, status, set-allowlist)');

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
    .requiredOption('--allowlist-root <hex>', '0x-prefixed bytes32 allowlist root')
    .requiredOption('--end-timestamp <unix>', 'allowlist expiry (unix seconds)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts: BatchListingSetAllowListOptions): Promise<void> => {
      try {
        const chain = getActiveChain(opts.chain, opts.chainId);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const root = await resolveRootInput(opts.root);
        const allowListRoot = parseBytes32(opts.allowlistRoot, '--allowlist-root');

        log(`Setting allowlist for batch listing on ${chain}...`);

        const result = await rare.batchListing.setAllowList({
          root,
          allowListRoot,
          endTimestamp: opts.endTimestamp,
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

  return cmd;
}

function collect(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
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

function parseSplitOptions(values: string[] | undefined): ParsedSplits {
  return (values ?? []).reduce<ParsedSplits>(
    (splits, value) => {
      const { address, ratio } = parseSplitOption(value);
      return {
        splitAddresses: [...splits.splitAddresses, address],
        splitRatios: [...splits.splitRatios, ratio],
      };
    },
    { splitAddresses: [], splitRatios: [] },
  );
}

function parseSplitOption(value: string): { address: Address; ratio: number } {
  const separatorIndex = value.indexOf('=');
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    throw new Error(`--split entries must use addr=ratio format, got: ${value}`);
  }

  const address = parseAddress(value.slice(0, separatorIndex), '--split');
  const ratio = Number(value.slice(separatorIndex + 1));
  if (!Number.isInteger(ratio)) {
    throw new Error(`--split ratio entries must be integers, got: ${value}`);
  }

  return { address, ratio };
}
