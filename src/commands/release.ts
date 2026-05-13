import { Command } from 'commander';
import { formatUnits, isAddress, type Address } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { printError } from '../errors.js';
import { createRareClient } from '../sdk/client.js';
import { resolveCurrency } from '../contracts/addresses.js';
import { output, log } from '../output.js';
import {
  collectReleaseSplit,
  finalizeReleaseSplitAccumulator,
  type ReleaseSplitAccumulator,
} from '../sdk/release-core.js';

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

export function releaseCommand(): Command {
  const cmd = new Command('release');
  cmd.description('Direct sale release subcommands (configure, status)');

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
        const result = await rare.release.configure({
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
        const result = await rare.release.getStatus({
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
            console.log(`  Staking minimum:    ${result.stakingMinimumAmount}`);
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
