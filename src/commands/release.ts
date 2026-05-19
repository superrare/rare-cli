import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { Command } from 'commander';
import { formatUnits, isAddress, zeroAddress, type Address, type Hex } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { printError } from '../errors.js';
import { createRareClient, type RareClient } from '../sdk/client.js';
import {
  buildReleaseAllowlistArtifactFromInput,
  getReleaseAllowlistProof,
  normalizeReleaseAllowlistProof,
  parseReleaseAllowlistArtifactJson,
} from '../sdk/release-core.js';
import type {
  ReleaseAllowlistArtifact,
  ReleaseAllowlistInputFormat,
} from '../sdk/types/release.js';
import { resolveCurrency } from '../contracts/addresses.js';
import { output, log } from '../output.js';
import { runWithPaymentApprovalConsent } from './approval-consent.js';
import { collectSplit, finalizeSplits, type SplitAccumulator } from './splits-core.js';

const ETH_ADDRESS = zeroAddress;

type ReleaseConfigureOptions = {
  contract: string;
  price: string;
  maxMints?: string;
  currency?: string;
  startTime?: string;
  start?: string;
  split?: SplitAccumulator;
  chain?: string;
  chainId?: string;
};

type AllowlistBuildOptions = {
  input: string;
  format?: string;
  output?: string;
};

type AllowlistProofOptions = {
  input: string;
  account: string;
  output?: string;
};

type AllowlistSetOptions = {
  contract: string;
  endTime?: string;
  input?: string;
  root?: string;
  chain?: string;
  chainId?: string;
};

type ReleaseContractOptions = {
  contract: string;
  chain?: string;
  chainId?: string;
};

type ReleaseLimitOptions = ReleaseContractOptions & {
  limit?: string;
};

type ReleaseStatusOptions = ReleaseContractOptions & {
  account?: string;
};

type ReleaseMintOptions = ReleaseContractOptions & {
  quantity?: string;
  currency?: string;
  price?: string;
  proof?: string;
  recipient?: string;
  yes?: boolean;
  autoApprove?: boolean;
};

function formatTokenAmount(amount: bigint, decimals: number | null): string {
  if (decimals === null) {
    return amount.toString();
  }
  return formatUnits(amount, decimals);
}

function formatTimestamp(timestamp: bigint): string {
  if (timestamp === 0n) {
    return 'not set';
  }
  return new Date(Number(timestamp) * 1000).toISOString();
}

function formatLimit(limit: bigint): string {
  return limit === 0n ? 'none' : limit.toString();
}

function readTextFile(filePath: string, label: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read ${label} "${filePath}": ${errorMessage(error)}`, { cause: error });
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  try {
    writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  } catch (error) {
    throw new Error(`Unable to write allowlist artifact "${filePath}": ${errorMessage(error)}`, { cause: error });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function detectAllowlistFormat(filePath: string, format?: string): ReleaseAllowlistInputFormat {
  if (format !== undefined) {
    if (format === 'csv' || format === 'json') {
      return format;
    }
    throw new Error(`Invalid allowlist format "${format}". Expected csv or json.`);
  }

  const extension = extname(filePath).toLowerCase();
  if (extension === '.csv') return 'csv';
  if (extension === '.json') return 'json';
  throw new Error('Unable to infer allowlist format from file extension. Pass --format csv or --format json.');
}

function assertAddressOption(value: string, label: string): asserts value is Address {
  if (!isAddress(value)) {
    throw new Error(`Invalid ${label} address: "${value}".`);
  }
}

function assertBytes32Option(value: string, label: string): asserts value is Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`Invalid ${label} bytes32 value: "${value}".`);
  }
}

function loadAllowlistArtifact(filePath: string): ReleaseAllowlistArtifact {
  return parseReleaseAllowlistArtifactJson(readTextFile(filePath, 'allowlist artifact'));
}

function readProofFile(filePath: string): Hex[] {
  const content = readTextFile(filePath, 'allowlist proof');
  const parsed: unknown = parseProofJson(content);
  const proof = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.proof)
      ? parsed.proof
      : undefined;

  if (proof === undefined) {
    throw new Error('--proof must be a JSON array or an object with a proof array.');
  }

  return normalizeReleaseAllowlistProof(proof);
}

function parseProofJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Unable to parse allowlist proof JSON: ${errorMessage(error)}`, { cause: error });
  }
}

function releaseWriteClient(chain: ReturnType<typeof getActiveChain>): RareClient {
  const { client } = getWalletClient(chain);
  const publicClient = getPublicClient(chain);
  return createRareClient({ publicClient, walletClient: client });
}

export function releaseCommand(): Command {
  const cmd = new Command('release');
  cmd.description('RareMinter release subcommands (configure, mint, allowlist, limits, status)');

  cmd
    .command('configure')
    .description('Configure a RareMinter direct sale release')
    .requiredOption('--contract <address>', 'collection contract address')
    .requiredOption('--price <amount>', 'price per mint in ETH or token units')
    .option('--max-mints <number>', 'max tokens per mint transaction (0 disables the per-tx cap, otherwise 1-100)')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--start-time <time>', 'sale start time as unix seconds or an ISO date (defaults to now)')
    .option(
      '--split <addr=ratio>',
      'payout split recipient (repeatable). Format: 0xADDR=RATIO. Ratios must sum to 100. If omitted, 100% goes to the connected wallet.',
      collectSplit,
    )
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts: ReleaseConfigureOptions): Promise<void> => {
      try {
        const splits = finalizeSplits(opts.split);
        assertAddressOption(opts.contract, 'contract');
        const maxMints = opts.maxMints;
        if (maxMints === undefined) {
          throw new Error('release configure requires --max-mints.');
        }

        const chain = getActiveChain(opts.chain, opts.chainId);
        const { client, account } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const currency = opts.currency === undefined ? ETH_ADDRESS : resolveCurrency(opts.currency, chain);
        const isEth = currency === ETH_ADDRESS;

        log(`Configuring direct sale release on ${chain}...`);
        log(`  RareMinter: ${rare.contracts.rareMinter ?? '(unsupported chain)'}`);
        log(`  Collection: ${opts.contract}`);
        log(`  Price:      ${opts.price} ${isEth ? 'ETH' : currency}`);
        log(`  Max mints:  ${maxMints}`);
        log(`  Start:      ${opts.startTime ?? 'now'}`);
        if (splits !== undefined) {
          log('  Splits:');
          splits.addresses.forEach((address, index) => {
            log(`    ${address} = ${splits.ratios[index]}%`);
          });
        } else {
          log(`  Splits:     ${account.address} = 100%`);
        }

        const result = await rare.listing.release.configure({
          contract: opts.contract,
          currency,
          price: opts.price,
          startTime: opts.startTime,
          maxMints,
          splitAddresses: splits?.addresses,
          splitRatios: splits?.ratios,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            rareMinter: result.rareMinter,
            contract: result.contract,
            currencyAddress: result.currencyAddress,
            price: result.price,
            startTime: result.startTime,
            maxMints: result.maxMints,
            splitRecipients: result.splitRecipients,
            splitRatios: result.splitRatios,
          },
          () => {
            console.log(`\nTransaction sent: ${result.txHash}`);
            console.log(`Release configured! Block: ${result.receipt.blockNumber}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  cmd
    .command('mint')
    .description('Mint from a RareMinter direct sale release')
    .requiredOption('--contract <address>', 'collection contract address')
    .option('--quantity <number>', 'number of tokens to mint')
    .option('--currency <currency>', 'expected currency: eth, usdc, rare, or ERC20 address (defaults to configured sale currency)')
    .option('--price <amount>', 'expected per-token price in ETH or token units (defaults to configured sale price)')
    .option('--proof <file>', 'allowlist proof JSON from rare listing release allowlist proof')
    .option('--recipient <address>', 'recipient when supported; RareMinter direct sales mint to the connected wallet')
    .option('--yes', 'yes to all prompts and required approvals')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts: ReleaseMintOptions): Promise<void> => {
      try {
        assertAddressOption(opts.contract, 'contract');
        if (opts.recipient !== undefined) {
          assertAddressOption(opts.recipient, 'recipient');
        }
        const proof = opts.proof === undefined ? undefined : readProofFile(opts.proof);
        const chain = getActiveChain(opts.chain, opts.chainId);
        const rare = releaseWriteClient(chain);
        const currency = opts.currency === undefined ? undefined : resolveCurrency(opts.currency, chain);
        const quantity = opts.quantity ?? '1';

        log(`Minting direct sale release on ${chain}...`);
        log(`  RareMinter: ${rare.contracts.rareMinter ?? '(unsupported chain)'}`);
        log(`  Collection: ${opts.contract}`);
        log(`  Quantity:   ${quantity}`);
        if (currency !== undefined) {
          log(`  Currency:   ${currency}`);
        }
        if (opts.price !== undefined) {
          log(`  Price:      ${opts.price}`);
        }
        if (proof !== undefined) {
          log(`  Proof:      ${proof.length} entries`);
        }

        const mintParams = {
          contract: opts.contract,
          quantity,
          currency,
          price: opts.price,
          proof,
          recipient: opts.recipient,
        };
        const result = await runWithPaymentApprovalConsent({
          commandName: 'rare listing release mint',
          approvalMessage: 'ERC20 approval is required before minting this release.',
          runWithoutApproval: async () => rare.listing.release.mint({
            ...mintParams,
            autoApprove: opts.yes === true,
          }),
          runWithApproval: async () => rare.listing.release.mint({
            ...mintParams,
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
            rareMinter: result.rareMinter,
            contract: result.contract,
            buyer: result.buyer,
            recipient: result.recipient,
            quantity: result.quantity,
            currencyAddress: result.currencyAddress,
            price: result.price,
            totalPrice: result.totalPrice,
            requiredPayment: result.requiredPayment,
            allowlistRequired: result.allowlistRequired,
            tokenIdStart: result.tokenIdStart,
            tokenIdEnd: result.tokenIdEnd,
            tokenIds: result.tokenIds,
          },
          () => {
            if (result.approvalTxHash !== undefined) {
              console.log(`\nApproval transaction sent: ${result.approvalTxHash}`);
            }
            console.log(`\nTransaction sent: ${result.txHash}`);
            console.log(`Release mint complete! Block: ${result.receipt.blockNumber}`);
            console.log(`  Token IDs: ${result.tokenIds.map((tokenId) => tokenId.toString()).join(', ')}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  const allowlist = new Command('allowlist');
  allowlist.description('Build allowlist proof artifacts and configure RareMinter allowlist roots');

  allowlist
    .command('build')
    .description('Build a reusable RareMinter allowlist proof artifact from CSV or JSON wallets')
    .requiredOption('--input <file>', 'CSV or JSON wallet allowlist input')
    .option('--format <format>', 'input format: csv or json (defaults from file extension)')
    .option('--output <file>', 'write the proof artifact JSON to a file')
    .action((opts: AllowlistBuildOptions): void => {
      try {
        const format = detectAllowlistFormat(opts.input, opts.format);
        const raw = readTextFile(opts.input, 'allowlist input');
        const artifact = buildReleaseAllowlistArtifactFromInput(raw, format);

        if (opts.output !== undefined) {
          writeJsonFile(opts.output, artifact);
        }

        output({ artifact, outputPath: opts.output ?? null }, () => {
          if (opts.output !== undefined) {
            console.log('\nAllowlist artifact written:');
            console.log(`  File:    ${opts.output}`);
            console.log(`  Root:    ${artifact.root}`);
            console.log(`  Wallets: ${artifact.wallets.length}`);
          } else {
            console.log(JSON.stringify(artifact, null, 2));
          }
        });
      } catch (error) {
        printError(error);
      }
    });

  allowlist
    .command('proof')
    .description('Read an account proof from a RareMinter allowlist artifact')
    .requiredOption('--input <file>', 'allowlist proof artifact JSON')
    .requiredOption('--account <address>', 'account address to prove')
    .option('--output <file>', 'write the proof JSON to a file')
    .action((opts: AllowlistProofOptions): void => {
      try {
        assertAddressOption(opts.account, 'account');
        const artifact = loadAllowlistArtifact(opts.input);
        const proof = getReleaseAllowlistProof({ artifact, address: opts.account });
        if (proof === null) {
          throw new Error(`Account ${opts.account} is not present in allowlist artifact ${opts.input}.`);
        }

        if (opts.output !== undefined) {
          writeJsonFile(opts.output, proof);
        }

        output({ root: artifact.root, ...proof, outputPath: opts.output ?? null }, () => {
          console.log('\nAllowlist proof:');
          console.log(`  Root:   ${artifact.root}`);
          console.log(`  Account: ${proof.address}`);
          console.log(`  Leaf:   ${proof.leaf}`);
          console.log(`  Proof:  ${proof.proof.length === 0 ? '[]' : proof.proof.join(', ')}`);
          if (opts.output !== undefined) {
            console.log(`  File:   ${opts.output}`);
          }
        });
      } catch (error) {
        printError(error);
      }
    });

  allowlist
    .command('set')
    .description('Set the RareMinter allowlist root and end time for a release')
    .requiredOption('--contract <address>', 'collection contract address')
    .option('--end-time <time>', 'allowlist end time as unix seconds or an ISO date')
    .option('--input <file>', 'allowlist proof artifact JSON; uses its root')
    .option('--root <bytes32>', 'allowlist Merkle root override')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts: AllowlistSetOptions): Promise<void> => {
      try {
        assertAddressOption(opts.contract, 'contract');
        if (opts.input === undefined && opts.root === undefined) {
          throw new Error('Pass --input or --root to set a release allowlist.');
        }
        if (opts.input !== undefined && opts.root !== undefined) {
          throw new Error('Pass either --input or --root, not both.');
        }
        const endTime = opts.endTime;
        if (endTime === undefined) {
          throw new Error('release allowlist set requires --end-time.');
        }

        const chain = getActiveChain(opts.chain, opts.chainId);
        const rare = releaseWriteClient(chain);
        const artifact = opts.input === undefined ? undefined : loadAllowlistArtifact(opts.input);
        if (opts.root !== undefined) {
          assertBytes32Option(opts.root, '--root');
        }
        const root = opts.root;

        log(`Configuring release allowlist on ${chain}...`);
        log(`  RareMinter: ${rare.contracts.rareMinter ?? '(unsupported chain)'}`);
        log(`  Collection: ${opts.contract}`);
        log(`  Root:       ${artifact?.root ?? root}`);
        log(`  Ends:       ${endTime}`);

        const result = await rare.listing.release.allowlist.setConfig({
          contract: opts.contract,
          root,
          artifact,
          endTime,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            config: result.config,
          },
          () => {
            console.log(`\nTransaction sent: ${result.txHash}`);
            console.log(`Allowlist configured! Block: ${result.receipt.blockNumber}`);
            console.log(`  Root:   ${result.config.root}`);
            console.log(`  Ends:   ${formatTimestamp(result.config.endTimestamp)}`);
            console.log(`  Active: ${result.config.active ? 'yes' : 'no'}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  allowlist
    .command('clear')
    .description('Clear the RareMinter allowlist config for a release')
    .requiredOption('--contract <address>', 'collection contract address')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts: ReleaseContractOptions): Promise<void> => {
      try {
        assertAddressOption(opts.contract, 'contract');
        const chain = getActiveChain(opts.chain, opts.chainId);
        const rare = releaseWriteClient(chain);

        log(`Clearing release allowlist on ${chain}...`);
        log(`  RareMinter: ${rare.contracts.rareMinter ?? '(unsupported chain)'}`);
        log(`  Collection: ${opts.contract}`);

        const result = await rare.listing.release.allowlist.clear({
          contract: opts.contract,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            config: result.config,
          },
          () => {
            console.log(`\nTransaction sent: ${result.txHash}`);
            console.log(`Allowlist cleared! Block: ${result.receipt.blockNumber}`);
            console.log(`  Root:   ${result.config.root}`);
            console.log(`  Ends:   ${formatTimestamp(result.config.endTimestamp)}`);
            console.log(`  Active: ${result.config.active ? 'yes' : 'no'}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  cmd.addCommand(allowlist);

  const limits = new Command('limits');
  limits.description('Configure RareMinter mint and transaction limits');

  limits
    .command('set-mint')
    .description('Set the RareMinter per-wallet mint limit for a release')
    .requiredOption('--contract <address>', 'collection contract address')
    .option('--limit <number>', 'per-wallet mint limit; 0 disables the limit')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts: ReleaseLimitOptions): Promise<void> => {
      try {
        assertAddressOption(opts.contract, 'contract');
        const limit = opts.limit;
        if (limit === undefined) {
          throw new Error('release limits set-mint requires --limit.');
        }
        const chain = getActiveChain(opts.chain, opts.chainId);
        const rare = releaseWriteClient(chain);

        log(`Configuring release mint limit on ${chain}...`);
        log(`  RareMinter: ${rare.contracts.rareMinter ?? '(unsupported chain)'}`);
        log(`  Collection: ${opts.contract}`);
        log(`  Limit:      ${limit}`);

        const result = await rare.listing.release.limits.setMint({
          contract: opts.contract,
          limit,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            config: result.config,
          },
          () => {
            console.log(`\nTransaction sent: ${result.txHash}`);
            console.log(`Mint limit configured! Block: ${result.receipt.blockNumber}`);
            console.log(`  Limit:   ${formatLimit(result.config.limit)}`);
            console.log(`  Enabled: ${result.config.enabled ? 'yes' : 'no'}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  limits
    .command('set-tx')
    .description('Set the RareMinter per-wallet transaction limit for a release')
    .requiredOption('--contract <address>', 'collection contract address')
    .option('--limit <number>', 'per-wallet mint transaction limit; 0 disables the limit')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts: ReleaseLimitOptions): Promise<void> => {
      try {
        assertAddressOption(opts.contract, 'contract');
        const limit = opts.limit;
        if (limit === undefined) {
          throw new Error('release limits set-tx requires --limit.');
        }
        const chain = getActiveChain(opts.chain, opts.chainId);
        const rare = releaseWriteClient(chain);

        log(`Configuring release transaction limit on ${chain}...`);
        log(`  RareMinter: ${rare.contracts.rareMinter ?? '(unsupported chain)'}`);
        log(`  Collection: ${opts.contract}`);
        log(`  Limit:      ${limit}`);

        const result = await rare.listing.release.limits.setTx({
          contract: opts.contract,
          limit,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            config: result.config,
          },
          () => {
            console.log(`\nTransaction sent: ${result.txHash}`);
            console.log(`Transaction limit configured! Block: ${result.receipt.blockNumber}`);
            console.log(`  Limit:   ${formatLimit(result.config.limit)}`);
            console.log(`  Enabled: ${result.config.enabled ? 'yes' : 'no'}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  cmd.addCommand(limits);

  cmd
    .command('status')
    .description('Get RareMinter direct sale release details (read-only)')
    .requiredOption('--contract <address>', 'collection contract address')
    .option('--account <address>', 'account address to include mint and transaction usage')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts: ReleaseStatusOptions): Promise<void> => {
      try {
        assertAddressOption(opts.contract, 'contract');
        if (opts.account !== undefined) {
          assertAddressOption(opts.account, 'account');
        }

        const chain = getActiveChain(opts.chain, opts.chainId);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient });
        const result = await rare.listing.release.status({
          contract: opts.contract,
          account: opts.account,
        });
        const currencyLabel = result.isEth ? 'ETH' : result.currencyAddress;
        const price = `${formatTokenAmount(result.price, result.currencyDecimals)} ${currencyLabel}`;

        output(result, () => {
          console.log('\nRelease Details:');
          console.log(`  RareMinter:         ${result.rareMinter}`);
          console.log(`  Collection:         ${result.contract}`);
          console.log(`  Configured:         ${result.configured ? 'yes' : 'no'}`);
          if (result.configured) {
            console.log(`  Seller:             ${result.seller}`);
            console.log(`  Price:              ${price}`);
            console.log(`  Currency:           ${currencyLabel}`);
            console.log(`  Starts at:          ${formatTimestamp(result.startTime)}`);
            console.log(`  Max mints per tx:   ${result.maxMints}`);
            console.log('  Splits:');
            result.splitRecipients.forEach((address, index) => {
              console.log(`    ${address} = ${result.splitRatios[index]}%`);
            });
          }

          console.log(`  Allowlist active:   ${result.allowlistActive ? 'yes' : 'no'}`);
          if (result.allowlistRoot !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
            console.log(`  Allowlist root:     ${result.allowlistRoot}`);
            console.log(`  Allowlist ends:     ${formatTimestamp(result.allowlistEndTimestamp)}`);
          }
          console.log(`  Mint limit:         ${result.mintLimit === 0n ? 'none' : result.mintLimit.toString()}`);
          console.log(`  Transaction limit:  ${result.txLimit === 0n ? 'none' : result.txLimit.toString()}`);
          if (result.totalSupply !== null || result.maxSupply !== null) {
            const total = result.totalSupply?.toString() ?? 'unknown';
            const max = result.maxSupply?.toString() ?? 'unknown';
            console.log(`  Minted supply:      ${total} / ${max}`);
            console.log(`  Remaining supply:   ${result.remainingSupply?.toString() ?? 'unknown'}`);
          }
          if (result.account) {
            console.log('  Account usage:');
            console.log(`    Account:          ${result.account}`);
            console.log(`    Mints:            ${result.accountMints?.toString() ?? 'unknown'}`);
            console.log(`    Transactions:     ${result.accountTxs?.toString() ?? 'unknown'}`);
          }
          console.log(`  Currently mintable: ${result.currentlyMintable ? 'yes' : 'no'}`);
        });
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}
