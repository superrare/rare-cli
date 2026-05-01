import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { type Address, isHex } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { printError } from '../errors.js';
import { createRareClient } from '../sdk/client.js';
import { resolveCurrency } from '../contracts/addresses.js';
import { output, log } from '../output.js';
import {
  buildRootArtifact,
  buildProofArtifact,
  loadRootArtifact,
  loadProofArtifact,
  loadTokenSet,
  loadAllowList,
  writeArtifact,
} from '../sdk/merkle.js';
import { formatBatchAmount, parseBatchAmount } from './batch-amounts.js';

const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

async function resolveRootInput(input: string): Promise<`0x${string}`> {
  if (isHex(input) && input.length === 66) return input as `0x${string}`;
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
    .option('--split-address <address>', 'split recipient (repeatable)', collect, [] as string[])
    .option('--split-ratio <ratio>', 'split ratio uint8 0-100 (repeatable; must sum to 100)', collect, [] as string[])
    .option('--allowlist <path>', 'optional allowlist file (string[] or {addresses, root?})')
    .option('--end-timestamp <unix>', 'optional allowlist expiry (unix seconds)')
    .option('--out <path>', 'write artifact to this path (otherwise stdout)')
    .option('--chain <chain>', 'chain to use (batch listing is deployed on mainnet and sepolia)')
    .action(async (opts) => {
      try {
        const chain = getActiveChain(opts.chain);
        const publicClient = getPublicClient(chain);
        const tokens = await loadTokenSet(opts.tokens);
        const currency = resolveCurrency(opts.currency, chain);
        const amount = await parseBatchAmount(publicClient, chain, currency, opts.amount);

        const splitAddresses = (opts.splitAddress as string[]).map((a) => a as Address);
        const splitRatios = (opts.splitRatio as string[]).map((r) => {
          const n = Number(r);
          if (!Number.isInteger(n)) throw new Error(`--split-ratio entries must be integers, got: ${r}`);
          return n;
        });

        let allowListAddresses: Address[] | undefined;
        let allowListEndTimestamp = opts.endTimestamp;
        if (opts.allowlist) {
          const al = await loadAllowList(opts.allowlist);
          allowListAddresses = al.addresses;
          allowListEndTimestamp ??= al.endTimestamp?.toString();
        }

        const artifact = buildRootArtifact({
          tokens,
          currency,
          amount,
          splitAddresses,
          splitRatios,
          allowListAddresses,
          allowListEndTimestamp,
        });

        if (opts.out) {
          await writeArtifact(opts.out, artifact);
          log(`Root artifact written to ${opts.out}`);
        }

        const formattedAmount = await formatBatchAmount(publicClient, chain, artifact.currency, BigInt(artifact.amount));
        output(artifact, () => {
          console.log('\nRoot artifact:');
          console.log(`  root:           ${artifact.root}`);
          console.log(`  currency:       ${artifact.currency}`);
          console.log(
            `  amount:         ${formattedAmount} ${artifact.currency === ETH_ADDRESS ? 'ETH' : artifact.currency}`,
          );
          console.log(`  tokens:         ${artifact.tokens.length}`);
          if (artifact.allowList) {
            console.log(`  allowlist root: ${artifact.allowList.root}`);
            console.log(`  allowlist size: ${artifact.allowList.addresses.length}`);
          }
          if (!opts.out) {
            console.log('\n(use --out <path> to save the artifact)');
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
    .option('--out <path>', 'write artifact to this path (otherwise stdout)')
    .action(async (opts) => {
      try {
        const rootArtifact = await loadRootArtifact(opts.root);
        const proof = buildProofArtifact(
          rootArtifact,
          opts.contract as Address,
          opts.tokenId,
          opts.buyer as Address | undefined,
        );

        if (opts.out) {
          await writeArtifact(opts.out, proof);
          log(`Proof artifact written to ${opts.out}`);
        }

        output(proof, () => {
          console.log('\nProof artifact:');
          console.log(`  root:        ${proof.root}`);
          console.log(`  contract:    ${proof.contract}`);
          console.log(`  tokenId:     ${proof.tokenId}`);
          console.log(`  proof depth: ${proof.proof.length}`);
          if (proof.allowListProof) {
            console.log(`  allowList:   ${proof.allowListAddress} (depth ${proof.allowListProof.length})`);
          }
          if (!opts.out) {
            console.log('\n(use --out <path> to save the artifact)');
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
    .description('Register a sale-price Merkle root from a root artifact (auto-approves NFT contracts)')
    .requiredOption('--root <path>', 'path to a root artifact JSON file')
    .option('--no-approve', 'skip the NFT setApprovalForAll step (you must approve manually)')
    .option('--chain <chain>', 'chain to use (batch listing is deployed on mainnet and sepolia)')
    .action(async (opts) => {
      try {
        const chain = getActiveChain(opts.chain);
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
            ` ${artifact.currency === ETH_ADDRESS ? 'ETH' : artifact.currency}`,
        );

        const result = await rare.batchListing.create({
          artifact,
          autoApprove: opts.approve !== false,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            approvalTxHashes: result.approvalTxHashes ?? null,
            root: artifact.root,
          },
          () => {
            if (result.approvalTxHashes?.length) {
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
    .option('--chain <chain>', 'chain to use (batch listing is deployed on mainnet and sepolia)')
    .action(async (opts) => {
      try {
        const chain = getActiveChain(opts.chain);
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
    .option('--chain <chain>', 'chain to use (batch listing is deployed on mainnet and sepolia)')
    .action(async (opts) => {
      try {
        const chain = getActiveChain(opts.chain);
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
            `${currency === ETH_ADDRESS ? ' ETH' : ` ${currency}`}`,
        );

        const result = await rare.batchListing.buy({
          proofArtifact,
          creator: opts.creator as Address,
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
    .option('--chain <chain>', 'chain to use (batch listing is deployed on mainnet and sepolia)')
    .action(async (opts) => {
      try {
        const chain = getActiveChain(opts.chain);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const root = await resolveRootInput(opts.root);

        if (!isHex(opts.allowlistRoot) || opts.allowlistRoot.length !== 66) {
          throw new Error('--allowlist-root must be a 0x-prefixed bytes32 hex string');
        }

        log(`Setting allowlist for batch listing on ${chain}...`);

        const result = await rare.batchListing.setAllowList({
          root,
          allowListRoot: opts.allowlistRoot as `0x${string}`,
          endTimestamp: opts.endTimestamp,
        });

        output(
          { txHash: result.txHash, blockNumber: result.receipt.blockNumber.toString(), root, allowListRoot: opts.allowlistRoot },
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
    .option('--chain <chain>', 'chain to use (batch listing is deployed on mainnet and sepolia)')
    .action(async (opts) => {
      try {
        const chain = getActiveChain(opts.chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient });
        const root = await resolveRootInput(opts.root);

        let proof: `0x${string}`[] | undefined;
        if (opts.proof) {
          const proofArtifact = await loadProofArtifact(opts.proof);
          proof = proofArtifact.proof;
        }

        const result = await rare.batchListing.getStatus({
          root,
          creator: opts.creator as Address,
          contract: opts.contract as Address | undefined,
          tokenId: opts.tokenId,
          proof,
        });
        const formattedAmount = result.hasListing
          ? await formatBatchAmount(publicClient, chain, result.currencyAddress, result.amount)
          : null;

        output(result, () => {
          console.log('\nBatch Listing Details:');
          console.log(`  Root:     ${result.root}`);
          console.log(`  Seller:   ${result.seller}`);
          if (!result.hasListing) {
            console.log('  No active listing for this (creator, root) pair.');
          } else {
            console.log(`  Currency: ${result.isEth ? 'ETH' : result.currencyAddress}`);
            console.log(
              `  Amount:   ${formattedAmount}${result.isEth ? ' ETH' : ` ${result.currencyAddress}`}`,
            );
            console.log(`  Splits:   ${result.splitRecipients.length} recipient(s) [${result.splitRatios.join(', ')}]`);
            console.log(`  Nonce:    ${result.nonce}`);
          }
          if (result.allowList) {
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

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}
