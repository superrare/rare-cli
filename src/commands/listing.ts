import { Command } from 'commander';
import { formatEther, type Address } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient, tryGetWalletClient } from '../client.js';
import { printError } from '../errors.js';
import { createRareClient } from '../sdk/client.js';
import { resolveCurrency } from '../contracts/addresses.js';
import { output, log } from '../output.js';

const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

interface SplitAccumulator {
  addresses: Address[];
  ratios: number[];
}

function collectSplit(value: string, prev: SplitAccumulator | undefined): SplitAccumulator {
  const acc: SplitAccumulator = prev ?? { addresses: [], ratios: [] };
  const idx = value.indexOf('=');
  if (idx <= 0 || idx === value.length - 1) {
    throw new Error(`Invalid --split format: "${value}". Expected ADDRESS=RATIO (e.g. 0xabc...=70).`);
  }
  const addr = value.slice(0, idx).trim();
  const ratioStr = value.slice(idx + 1).trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    throw new Error(`Invalid address in --split: "${addr}".`);
  }
  if (acc.addresses.some((a) => a.toLowerCase() === addr.toLowerCase())) {
    throw new Error(`Duplicate address in --split: "${addr}".`);
  }
  const ratio = Number(ratioStr);
  if (!Number.isInteger(ratio) || ratio < 1 || ratio > 100) {
    throw new Error(`Invalid ratio in --split: "${ratioStr}". Must be an integer between 1 and 100.`);
  }
  acc.addresses.push(addr as Address);
  acc.ratios.push(ratio);
  return acc;
}

function finalizeSplits(acc: SplitAccumulator | undefined):
  | { addresses: Address[]; ratios: number[] }
  | undefined {
  if (!acc || acc.addresses.length === 0) return undefined;
  const sum = acc.ratios.reduce((a, b) => a + b, 0);
  if (sum !== 100) {
    throw new Error(`--split ratios must sum to 100 (got ${sum}).`);
  }
  return { addresses: acc.addresses, ratios: acc.ratios };
}

export function listingCommand(): Command {
  const cmd = new Command('listing');
  cmd.description('Listing subcommands (create, cancel, buy, status)');

  // listing create
  cmd
    .command('create')
    .description('Create a listing (set sale price) for a token')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--price <amount>', 'listing price in ETH (or token units)')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--target <address>', 'target buyer address (defaults to public listing)')
    .option(
      '--split <addr=ratio>',
      'payout split recipient (repeatable). Format: 0xADDR=RATIO. Ratios must sum to 100. If omitted, 100% goes to the connected wallet.',
      collectSplit,
    )
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      let splits: { addresses: Address[]; ratios: number[] } | undefined;
      try {
        splits = finalizeSplits(opts.split as SplitAccumulator);
      } catch (error) {
        printError(error);
        return;
      }

      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;
      const target = (opts.target ?? ETH_ADDRESS) as `0x${string}`;

      log(`Creating listing on ${chain}...`);
      log(`  Marketplace contract: ${rare.contracts.auction}`);
      log(`  NFT contract: ${opts.contract}`);
      log(`  Token ID: ${opts.tokenId}`);
      log(`  Price: ${opts.price} ${isEth ? 'ETH' : currency}`);
      log(`  Target: ${target === ETH_ADDRESS ? 'public' : target}`);
      if (splits) {
        log(`  Splits:`);
        splits.addresses.forEach((a, i) => log(`    ${a} = ${splits!.ratios[i]}%`));
      }

      try {
        const result = await rare.listing.create({
          contract: opts.contract as `0x${string}`,
          tokenId: opts.tokenId,
          price: opts.price,
          currency,
          target,
          splitAddresses: splits?.addresses,
          splitRatios: splits?.ratios,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            approvalTxHash: result.approvalTxHash ?? null,
          },
          () => {
            if (result.approvalTxHash) {
              console.log(`Approval tx sent: ${result.approvalTxHash}`);
            }
            console.log(`\nTransaction sent: ${result.txHash}`);
            console.log(`Listing created! Block: ${result.receipt.blockNumber}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  // listing cancel
  cmd
    .command('cancel')
    .description('Cancel a listing (remove sale price)')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--target <address>', 'target buyer address (defaults to public listing)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const target = (opts.target ?? ETH_ADDRESS) as `0x${string}`;

      log(`Cancelling listing on ${chain}...`);

      try {
        const result = await rare.listing.cancel({
          contract: opts.contract as `0x${string}`,
          tokenId: opts.tokenId,
          target,
        });

        output(
          { txHash: result.txHash, blockNumber: result.receipt.blockNumber.toString() },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Listing cancelled! Block: ${result.receipt.blockNumber}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  // listing buy
  cmd
    .command('buy')
    .description('Buy a listed token')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--amount <amount>', 'purchase amount in ETH (or token units)')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;

      log(`Buying token on ${chain}...`);
      log(`  Marketplace contract: ${rare.contracts.auction}`);
      log(`  NFT contract: ${opts.contract}`);
      log(`  Token ID: ${opts.tokenId}`);
      log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);

      try {
        const result = await rare.listing.buy({
          contract: opts.contract as `0x${string}`,
          tokenId: opts.tokenId,
          amount: opts.amount,
          currency,
        });

        output(
          { txHash: result.txHash, blockNumber: result.receipt.blockNumber.toString() },
          () => {
            console.log(`\nTransaction sent: ${result.txHash}`);
            console.log(`Token purchased! Block: ${result.receipt.blockNumber}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  // listing status
  cmd
    .command('status')
    .description('Get listing details (read-only)')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--target <address>', 'target buyer address (defaults to public listing)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const publicClient = getPublicClient(chain);
      const wallet = tryGetWalletClient(chain);
      const rare = createRareClient({
        publicClient,
        walletClient: wallet?.client,
      });
      const target = (opts.target ?? ETH_ADDRESS) as `0x${string}`;

      const result = await rare.listing.getStatus({
        contract: opts.contract as `0x${string}`,
        tokenId: opts.tokenId,
        target,
      });

      output(result, () => {
        console.log('\nListing Details:');
        if (!result.hasListing) {
          console.log('  No active listing found.');
        } else {
          console.log(`  Seller:   ${result.seller}`);
          console.log(`  Amount:   ${formatEther(result.amount)} ${result.isEth ? 'ETH' : result.currencyAddress}`);
          console.log(`  Currency: ${result.isEth ? 'ETH' : result.currencyAddress}`);
          console.log(`  Target:   ${result.target === ETH_ADDRESS ? 'public' : result.target}`);
          if (result.splitAddresses.length > 0) {
            console.log('  Splits:');
            result.splitAddresses.forEach((a, i) => {
              console.log(`    ${a} = ${result.splitRatios[i]}%`);
            });
          }
          if (result.canBuy !== null) {
            console.log(`  Can buy:  ${result.canBuy ? 'yes' : 'no'}`);
          }
        }
      });
    });

  return cmd;
}
