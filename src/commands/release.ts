import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { Command } from 'commander';
import { formatUnits, isAddress, type Address, type Hex } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { printError } from '../errors.js';
import {
  buildReleaseAllowlistArtifactFromInput,
  collectReleaseSplit,
  createRareClient,
  finalizeReleaseSplitAccumulator,
  getReleaseAllowlistProof,
  parseReleaseAllowlistArtifactJson,
  type ReleaseAllowlistArtifact,
  type ReleaseAllowlistInputFormat,
  type ReleaseSplitAccumulator,
} from '../sdk/index.js';
import { resolveCurrency } from '../contracts/addresses.js';
import { output, log } from '../output.js';

const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

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

function formatStakingAmount(amount: bigint): string {
  return `${formatUnits(amount, 18)} RARE`;
}

function readTextFile(filePath: string, label: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read ${label} "${filePath}": ${(error as Error).message}`);
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  try {
    writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  } catch (error) {
    throw new Error(`Unable to write allowlist artifact "${filePath}": ${(error as Error).message}`);
  }
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

function loadAllowlistArtifact(filePath: string): ReleaseAllowlistArtifact {
  return parseReleaseAllowlistArtifactJson(readTextFile(filePath, 'allowlist artifact'));
}

function releaseWriteClient(chain: ReturnType<typeof getActiveChain>) {
  const { client } = getWalletClient(chain);
  const publicClient = getPublicClient(chain);
  return createRareClient({ publicClient, walletClient: client });
}

export function releaseCommand(): Command {
  const cmd = new Command('release');
  cmd.description('RareMinter release subcommands (configure, allowlist, limits, status)');

  cmd
    .command('configure')
    .description('Configure a RareMinter direct sale release')
    .requiredOption('--contract <address>', 'collection contract address')
    .requiredOption('--price <amount>', 'price per mint in ETH or token units')
    .requiredOption('--max-mints <number>', 'max tokens per mint transaction (1-100)')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--start <time>', 'sale start time as unix seconds or an ISO date (defaults to now)')
    .option(
      '--split <addr=ratio>',
      'payout split recipient (repeatable). Format: 0xADDR=RATIO. Ratios must sum to 100. If omitted, 100% goes to the connected wallet.',
      collectReleaseSplit,
    )
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts) => {
      let splits: { addresses: Address[]; ratios: number[] } | undefined;
      try {
        splits = finalizeReleaseSplitAccumulator(opts.split as ReleaseSplitAccumulator | undefined);
      } catch (error) {
        printError(error);
        return;
      }

      if (!isAddress(opts.contract)) {
        printError(new Error(`Invalid contract address: "${opts.contract}".`));
        return;
      }

      const chain = getActiveChain(opts.chain, opts.chainId);
      const { client, account } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;

      log(`Configuring direct sale release on ${chain}...`);
      log(`  RareMinter: ${rare.contracts.rareMinter ?? '(unsupported chain)'}`);
      log(`  Collection: ${opts.contract}`);
      log(`  Price:      ${opts.price} ${isEth ? 'ETH' : currency}`);
      log(`  Max mints:  ${opts.maxMints}`);
      log(`  Start:      ${opts.start ?? 'now'}`);
      if (splits) {
        log('  Splits:');
        splits.addresses.forEach((address, index) => log(`    ${address} = ${splits!.ratios[index]}%`));
      } else {
        log(`  Splits:     ${account.address} = 100%`);
      }

      try {
        const result = await rare.listing.release.configure({
          contract: opts.contract as Address,
          currency,
          price: opts.price,
          startTime: opts.start,
          maxMints: opts.maxMints,
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

  const allowlist = new Command('allowlist');
  allowlist.description('Build allowlist proof artifacts and configure RareMinter allowlist roots');

  allowlist
    .command('build')
    .description('Build a reusable RareMinter allowlist proof artifact from CSV or JSON wallets')
    .requiredOption('--input <file>', 'CSV or JSON wallet allowlist input')
    .option('--format <format>', 'input format: csv or json (defaults from file extension)')
    .option('--output <file>', 'write the proof artifact JSON to a file')
    .action((opts) => {
      try {
        const format = detectAllowlistFormat(opts.input, opts.format);
        const raw = readTextFile(opts.input, 'allowlist input');
        const artifact = buildReleaseAllowlistArtifactFromInput(raw, format);

        if (opts.output) {
          writeJsonFile(opts.output, artifact);
        }

        output({ artifact, outputPath: opts.output ?? null }, () => {
          if (opts.output) {
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
    .action((opts) => {
      try {
        assertAddressOption(opts.account, 'account');
        const artifact = loadAllowlistArtifact(opts.input);
        const proof = getReleaseAllowlistProof({ artifact, address: opts.account });
        if (!proof) {
          throw new Error(`Account ${opts.account} is not present in allowlist artifact ${opts.input}.`);
        }

        if (opts.output) {
          writeJsonFile(opts.output, proof);
        }

        output({ root: artifact.root, ...proof, outputPath: opts.output ?? null }, () => {
          console.log('\nAllowlist proof:');
          console.log(`  Root:   ${artifact.root}`);
          console.log(`  Account: ${proof.address}`);
          console.log(`  Leaf:   ${proof.leaf}`);
          console.log(`  Proof:  ${proof.proof.length === 0 ? '[]' : proof.proof.join(', ')}`);
          if (opts.output) {
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
    .requiredOption('--end-timestamp <time>', 'allowlist end time as unix seconds or an ISO date')
    .option('--input <file>', 'allowlist proof artifact JSON; uses its root')
    .option('--root <bytes32>', 'allowlist Merkle root to set when no input is provided')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts) => {
      try {
        assertAddressOption(opts.contract, 'contract');
        if (!opts.input && !opts.root) {
          throw new Error('Pass --input or --root to set a release allowlist.');
        }
        if (opts.input && opts.root) {
          throw new Error('Pass either --input or --root, not both.');
        }

        const chain = getActiveChain(opts.chain, opts.chainId);
        const rare = releaseWriteClient(chain);
        const artifact = opts.input ? loadAllowlistArtifact(opts.input) : undefined;
        const root = opts.root as Hex | undefined;

        log(`Configuring release allowlist on ${chain}...`);
        log(`  RareMinter: ${rare.contracts.rareMinter ?? '(unsupported chain)'}`);
        log(`  Collection: ${opts.contract}`);
        log(`  Root:       ${artifact?.root ?? root}`);
        log(`  Ends:       ${opts.endTimestamp}`);

        const result = await rare.listing.release.setAllowlistConfig({
          contract: opts.contract,
          root,
          artifact,
          endTimestamp: opts.endTimestamp,
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
    .action(async (opts) => {
      try {
        assertAddressOption(opts.contract, 'contract');
        const chain = getActiveChain(opts.chain, opts.chainId);
        const rare = releaseWriteClient(chain);

        log(`Clearing release allowlist on ${chain}...`);
        log(`  RareMinter: ${rare.contracts.rareMinter ?? '(unsupported chain)'}`);
        log(`  Collection: ${opts.contract}`);

        const result = await rare.listing.release.clearAllowlistConfig({
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
    .requiredOption('--limit <number>', 'per-wallet mint limit; 0 disables the limit')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts) => {
      try {
        assertAddressOption(opts.contract, 'contract');
        const chain = getActiveChain(opts.chain, opts.chainId);
        const rare = releaseWriteClient(chain);

        log(`Configuring release mint limit on ${chain}...`);
        log(`  RareMinter: ${rare.contracts.rareMinter ?? '(unsupported chain)'}`);
        log(`  Collection: ${opts.contract}`);
        log(`  Limit:      ${opts.limit}`);

        const result = await rare.listing.release.setMintLimit({
          contract: opts.contract,
          limit: opts.limit,
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
    .requiredOption('--limit <number>', 'per-wallet mint transaction limit; 0 disables the limit')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts) => {
      try {
        assertAddressOption(opts.contract, 'contract');
        const chain = getActiveChain(opts.chain, opts.chainId);
        const rare = releaseWriteClient(chain);

        log(`Configuring release transaction limit on ${chain}...`);
        log(`  RareMinter: ${rare.contracts.rareMinter ?? '(unsupported chain)'}`);
        log(`  Collection: ${opts.contract}`);
        log(`  Limit:      ${opts.limit}`);

        const result = await rare.listing.release.setTxLimit({
          contract: opts.contract,
          limit: opts.limit,
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

  const staking = new Command('staking');
  staking.description('Configure RareMinter seller staking requirements');

  staking
    .command('set-minimum')
    .description('Set the RareMinter seller staking minimum for a release')
    .requiredOption('--contract <address>', 'collection contract address')
    .requiredOption('--minimum <rare>', 'minimum staked RARE amount; 0 disables the requirement')
    .option('--end-timestamp <time>', 'staking minimum end time as unix seconds or an ISO date; required unless minimum is 0')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts) => {
      try {
        assertAddressOption(opts.contract, 'contract');
        const chain = getActiveChain(opts.chain, opts.chainId);
        const rare = releaseWriteClient(chain);

        log(`Configuring release seller staking minimum on ${chain}...`);
        log(`  RareMinter: ${rare.contracts.rareMinter ?? '(unsupported chain)'}`);
        log(`  Collection: ${opts.contract}`);
        log(`  Minimum:    ${opts.minimum} RARE`);
        log(`  Ends:       ${opts.endTimestamp ?? '(not set)'}`);

        const result = await rare.listing.release.setSellerStakingMinimum({
          contract: opts.contract,
          amount: opts.minimum,
          endTimestamp: opts.endTimestamp,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            config: result.config,
          },
          () => {
            console.log(`\nTransaction sent: ${result.txHash}`);
            console.log(`Seller staking minimum configured! Block: ${result.receipt.blockNumber}`);
            console.log(`  Amount: ${formatStakingAmount(result.config.amount)}`);
            console.log(`  Ends:   ${formatTimestamp(result.config.endTimestamp)}`);
            console.log(`  Active: ${result.config.active ? 'yes' : 'no'}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  cmd.addCommand(staking);

  cmd
    .command('status')
    .description('Get RareMinter direct sale release details (read-only)')
    .requiredOption('--contract <address>', 'collection contract address')
    .option('--account <address>', 'account address to include mint and transaction usage')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts) => {
      if (!isAddress(opts.contract)) {
        printError(new Error(`Invalid contract address: "${opts.contract}".`));
        return;
      }
      if (opts.account && !isAddress(opts.account)) {
        printError(new Error(`Invalid account address: "${opts.account}".`));
        return;
      }

      const chain = getActiveChain(opts.chain, opts.chainId);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient });

      try {
        const result = await rare.listing.release.getStatus({
          contract: opts.contract as Address,
          account: opts.account as Address | undefined,
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
          if (result.stakingMinimumAmount > 0n) {
            console.log(`  Staking minimum:    ${formatStakingAmount(result.stakingMinimumAmount)}`);
            console.log(`  Staking ends:       ${formatTimestamp(result.stakingMinimumEndTimestamp)}`);
          }
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
