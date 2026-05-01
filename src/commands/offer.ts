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

export function offerCommand(): Command {
  const cmd = new Command('offer');
  cmd.description('Offer subcommands (create, cancel, accept, convert-to-auction, status)');

  // offer create
  cmd
    .command('create')
    .description('Create an offer on a token')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--amount <amount>', 'offer amount in ETH (or token units)')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--convertible', 'mark offer as convertible (allows seller to convert it to an auction)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;

      log(`Creating offer on ${chain}...`);
      log(`  Marketplace contract: ${rare.contracts.auction}`);
      log(`  NFT contract: ${opts.contract}`);
      log(`  Token ID: ${opts.tokenId}`);
      log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);
      log(`  Convertible: ${opts.convertible ? 'yes' : 'no'}`);

      try {
        const result = await rare.offer.create({
          contract: opts.contract as `0x${string}`,
          tokenId: opts.tokenId,
          amount: opts.amount,
          currency,
          convertible: opts.convertible ?? false,
        });

        output(
          { txHash: result.txHash, blockNumber: result.receipt.blockNumber.toString() },
          () => {
            console.log(`\nTransaction sent: ${result.txHash}`);
            console.log(`Offer created! Block: ${result.receipt.blockNumber}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  // offer cancel
  cmd
    .command('cancel')
    .description('Cancel an existing offer')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;

      log(`Cancelling offer on ${chain}...`);

      try {
        const result = await rare.offer.cancel({
          contract: opts.contract as `0x${string}`,
          tokenId: opts.tokenId,
          currency,
        });

        output(
          { txHash: result.txHash, blockNumber: result.receipt.blockNumber.toString() },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Offer cancelled! Block: ${result.receipt.blockNumber}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  // offer accept
  cmd
    .command('accept')
    .description('Accept an offer on a token you own')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--amount <amount>', 'offer amount to accept in ETH (or token units) — slippage assertion against on-chain offer')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
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

      log(`Accepting offer on ${chain}...`);
      log(`  NFT contract: ${opts.contract}`);
      log(`  Token ID: ${opts.tokenId}`);
      log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);
      if (splits) {
        log(`  Splits:`);
        splits.addresses.forEach((a, i) => log(`    ${a} = ${splits!.ratios[i]}%`));
      }

      try {
        const result = await rare.offer.accept({
          contract: opts.contract as `0x${string}`,
          tokenId: opts.tokenId,
          amount: opts.amount,
          currency,
          splitAddresses: splits?.addresses,
          splitRatios: splits?.ratios,
        });

        output(
          { txHash: result.txHash, blockNumber: result.receipt.blockNumber.toString() },
          () => {
            console.log(`\nTransaction sent: ${result.txHash}`);
            console.log(`Offer accepted! Block: ${result.receipt.blockNumber}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  // offer convert-to-auction
  cmd
    .command('convert-to-auction')
    .description('Convert a convertible offer into a reserve auction (the offer becomes the opening bid)')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--amount <amount>', 'offer amount in ETH (or token units) — slippage assertion against on-chain offer')
    .requiredOption('--duration <seconds>', 'auction length in seconds')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
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

      log(`Converting offer to auction on ${chain}...`);
      log(`  NFT contract: ${opts.contract}`);
      log(`  Token ID: ${opts.tokenId}`);
      log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);
      log(`  Duration: ${opts.duration}s`);
      if (splits) {
        log(`  Splits:`);
        splits.addresses.forEach((a, i) => log(`    ${a} = ${splits!.ratios[i]}%`));
      }

      try {
        const result = await rare.offer.convertToAuction({
          contract: opts.contract as `0x${string}`,
          tokenId: opts.tokenId,
          amount: opts.amount,
          duration: opts.duration,
          currency,
          splitAddresses: splits?.addresses,
          splitRatios: splits?.ratios,
        });

        output(
          { txHash: result.txHash, blockNumber: result.receipt.blockNumber.toString() },
          () => {
            console.log(`\nTransaction sent: ${result.txHash}`);
            console.log(`Offer converted to auction! Block: ${result.receipt.blockNumber}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  // offer status
  cmd
    .command('status')
    .description('Get current offer details (read-only)')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const publicClient = getPublicClient(chain);
      const wallet = tryGetWalletClient(chain);
      const rare = createRareClient({
        publicClient,
        walletClient: wallet?.client,
      });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;

      const result = await rare.offer.getStatus({
        contract: opts.contract as `0x${string}`,
        tokenId: opts.tokenId,
        currency,
      });

      output(result, () => {
        console.log('\nOffer Details:');
        if (!result.hasOffer) {
          console.log('  No active offer found.');
          if (result.tokenOwner) {
            console.log(`  Token owner:       ${result.tokenOwner}`);
          }
        } else {
          console.log(`  Buyer:             ${result.buyer}`);
          if (result.tokenOwner) {
            console.log(`  Token owner:       ${result.tokenOwner}`);
          }
          console.log(`  Amount:            ${formatEther(result.amount)} ${isEth ? 'ETH' : currency}`);
          console.log(`  Currency:          ${result.currency}`);
          console.log(`  Placed at:         ${new Date(Number(result.timestamp) * 1000).toISOString()}`);
          if (result.cancellableAfter !== null) {
            console.log(
              `  Cancellable after: ${new Date(Number(result.cancellableAfter) * 1000).toISOString()}`,
            );
          }
          console.log(`  Marketplace fee:   ${result.marketplaceFee}%`);
          console.log(`  Convertible:       ${result.convertible ? 'yes' : 'no'}`);
          if (
            result.canAccept !== null ||
            result.canCancel !== null ||
            result.canConvertToAuction !== null
          ) {
            console.log('  For your wallet:');
            console.log(`    Can accept:      ${result.canAccept ? 'yes' : 'no'}`);
            console.log(`    Can cancel:      ${result.canCancel ? 'yes' : 'no'}`);
            console.log(`    Can convert:     ${result.canConvertToAuction ? 'yes' : 'no'}`);
          }
        }
      });
    });

  return cmd;
}
