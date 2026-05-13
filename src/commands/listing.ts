import { Command } from 'commander';
import { formatEther, isAddressEqual } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient, tryGetWalletClient } from '../client.js';
import { printError } from '../errors.js';
import { createRareClient } from '../sdk/client.js';
import { ETH_ADDRESS, PUBLIC_LISTING_TARGET, resolveCurrency } from '../contracts/addresses.js';
import { parseAddress } from '../sdk/validation.js';
import { output, log } from '../output.js';
import { collectSplit, finalizeSplits, formatSplitLines, type SplitAccumulator } from './splits-core.js';
import { batchCommand } from './batch.js';
import { releaseCommand } from './release.js';

type ListingCreateOptions = {
  contract: string;
  tokenId: string;
  price: string;
  currency?: string;
  target?: string;
  split?: SplitAccumulator;
  chain?: string;
};

type ListingCancelOptions = {
  contract: string;
  tokenId: string;
  target?: string;
  chain?: string;
};

type ListingBuyOptions = {
  contract: string;
  tokenId: string;
  amount: string;
  currency?: string;
  chain?: string;
};

export function listingCommand(): Command {
  const cmd = new Command('listing');
  cmd.description('Listing subcommands (create, cancel, buy, status, batch, release)');
  cmd.addCommand(batchCommand());
  cmd.addCommand(releaseCommand());

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
    .action(async (opts: ListingCreateOptions): Promise<void> => {
      const splits = finalizeSplits(opts.split);
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;
      const contract = parseAddress(opts.contract, '--contract');
      const target = opts.target ? parseAddress(opts.target, '--target') : PUBLIC_LISTING_TARGET;

      log(`Creating listing on ${chain}...`);
      log(`  Marketplace contract: ${rare.contracts.auction}`);
      log(`  NFT contract: ${contract}`);
      log(`  Token ID: ${opts.tokenId}`);
      log(`  Price: ${opts.price} ${isEth ? 'ETH' : currency}`);
      log(`  Target: ${isAddressEqual(target, PUBLIC_LISTING_TARGET) ? 'public' : target}`);
      if (splits) {
        log(`  Splits:`);
        formatSplitLines(splits).forEach((line) => {
          log(line);
        });
      }

      try {
        const result = await rare.listing.create({
          contract,
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
    .action(async (opts: ListingCancelOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const contract = parseAddress(opts.contract, '--contract');
      const target = opts.target ? parseAddress(opts.target, '--target') : PUBLIC_LISTING_TARGET;

      log(`Cancelling listing on ${chain}...`);

      try {
        const result = await rare.listing.cancel({
          contract,
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
    .action(async (opts: ListingBuyOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;
      const contract = parseAddress(opts.contract, '--contract');

      log(`Buying token on ${chain}...`);
      log(`  Marketplace contract: ${rare.contracts.auction}`);
      log(`  NFT contract: ${contract}`);
      log(`  Token ID: ${opts.tokenId}`);
      log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);

      try {
        const result = await rare.listing.buy({
          contract,
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
    .action(async (opts: ListingCancelOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain);
      const publicClient = getPublicClient(chain);
      const wallet = tryGetWalletClient(chain);
      const rare = createRareClient({
        publicClient,
        walletClient: wallet?.client,
      });
      const contract = parseAddress(opts.contract, '--contract');
      const target = opts.target ? parseAddress(opts.target, '--target') : PUBLIC_LISTING_TARGET;

      const result = await rare.listing.getStatus({
        contract,
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
          console.log(`  Target:   ${isAddressEqual(result.target, PUBLIC_LISTING_TARGET) ? 'public' : result.target}`);
          if (result.splitAddresses.length > 0) {
            console.log('  Splits:');
            formatSplitLines({ addresses: result.splitAddresses, ratios: result.splitRatios }).forEach((line) => {
              console.log(line);
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
