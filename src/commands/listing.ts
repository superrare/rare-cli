import { Command } from 'commander';
import { formatUnits, isAddressEqual } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient, tryGetWalletClient } from '../client.js';
import { printError } from '../errors.js';
import { createRareClient } from '../sdk/client.js';
import { ETH_ADDRESS, PUBLIC_LISTING_TARGET, resolveCurrency } from '../contracts/addresses.js';
import { parseAddress } from '../sdk/validation.js';
import { output, log } from '../output.js';
import { createListingListCommand } from './account-market-list.js';
import { resolveCurrencyDecimals } from '../sdk/helpers.js';
import { collectSplit, finalizeSplits, formatSplitLines, type SplitAccumulator } from './splits-core.js';
import { listingBatchCommand } from './batch.js';
import { releaseCommand } from './release.js';

type ListingCreateOptions = {
  contract?: string;
  tokenId?: string;
  price?: string;
  amount?: string;
  currency?: string;
  target?: string;
  split?: SplitAccumulator;
  yes?: boolean;
  chain?: string;
  chainId?: string;
};

type ListingCancelOptions = {
  contract?: string;
  tokenId?: string;
  target?: string;
  chain?: string;
  chainId?: string;
};

type ListingBuyOptions = {
  contract?: string;
  tokenId: string;
  price?: string;
  amount?: string;
  currency?: string;
  chain?: string;
  chainId?: string;
};

type ListingStatusOptions = {
  contract?: string;
  tokenId?: string;
  target?: string;
  chain?: string;
  chainId?: string;
};

export function listingCommand(): Command {
  const cmd = new Command('listing');
  cmd.description('Listing subcommands (list, create, cancel, buy, status, batch, release)');
  cmd.addCommand(createListingListCommand());
  cmd.addCommand(listingBatchCommand());
  cmd.addCommand(releaseCommand());

  cmd
    .command('create')
    .description('Create a token-specific listing')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--price <amount>', 'listing price in ETH or token units')
    .option('--amount <amount>', 'alias for --price')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--target <address>', 'target buyer address (defaults to public listing)')
    .option(
      '--split <addr=ratio>',
      'payout split recipient (repeatable). Format: 0xADDR=RATIO. Ratios must sum to 100. If omitted, 100% goes to the connected wallet.',
      collectSplit,
    )
    .option('--yes', 'yes to all prompts, including approval and transaction submission')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: ListingCreateOptions): Promise<void> => {
      try {
        requireTokenScopeOptions(opts, 'create');
        const price = opts.price ?? opts.amount;
        if (!hasOption(price)) {
          throw new Error('rare listing create requires --price.');
        }
        const chain = getActiveChain(opts.chain, opts.chainId);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
        const isEth = currency === ETH_ADDRESS;
        const splits = finalizeSplits(opts.split);
        const contract = parseAddress(opts.contract, '--contract');
        const target = opts.target ? parseAddress(opts.target, '--target') : PUBLIC_LISTING_TARGET;

        log(`Creating listing on ${chain}...`);
        log(`  Marketplace contract: ${rare.contracts.auction}`);
        log(`  NFT contract: ${contract}`);
        log(`  Token ID: ${opts.tokenId}`);
        log(`  Price: ${price} ${isEth ? 'ETH' : currency}`);
        log(`  Target: ${isAddressEqual(target, PUBLIC_LISTING_TARGET) ? 'public' : target}`);
        if (splits) {
          log('  Splits:');
          formatSplitLines(splits).forEach((line) => {
            log(line);
          });
        }

        const result = await rare.listing.create({
          contract,
          tokenId: opts.tokenId,
          price,
          currency,
          target,
          splitAddresses: splits?.addresses,
          splitRatios: splits?.ratios,
          autoApprove: opts.yes,
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

  cmd
    .command('cancel')
    .description('Cancel a token-specific listing')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--target <address>', 'target buyer address (defaults to public listing)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: ListingCancelOptions): Promise<void> => {
      try {
        requireTokenScopeOptions(opts, 'cancel');
        const chain = getActiveChain(opts.chain, opts.chainId);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const contract = parseAddress(opts.contract, '--contract');
        const target = opts.target ? parseAddress(opts.target, '--target') : PUBLIC_LISTING_TARGET;

        log(`Cancelling listing on ${chain}...`);

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

  cmd
    .command('buy')
    .description('Buy a token-specific listing')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID to buy')
    .option('--price <amount>', 'purchase price in ETH or token units')
    .option('--amount <amount>', 'alias for --price')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: ListingBuyOptions): Promise<void> => {
      try {
        const chain = getActiveChain(opts.chain, opts.chainId);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
        const isEth = currency === ETH_ADDRESS;
        if (!hasOption(opts.contract)) {
          throw new Error('rare listing buy requires --contract.');
        }
        const price = opts.price ?? opts.amount;
        if (!hasOption(price)) {
          throw new Error('rare listing buy requires --price.');
        }
        const contract = parseAddress(opts.contract, '--contract');

        log(`Buying token on ${chain}...`);
        log(`  Marketplace contract: ${rare.contracts.auction}`);
        log(`  NFT contract: ${contract}`);
        log(`  Token ID: ${opts.tokenId}`);
        log(`  Price: ${price} ${isEth ? 'ETH' : currency}`);

        const result = await rare.listing.buy({
          contract,
          tokenId: opts.tokenId,
          price,
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

  cmd
    .command('status')
    .description('Get token-specific listing details')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--target <address>', 'target buyer address (defaults to public listing)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: ListingStatusOptions): Promise<void> => {
      try {
        requireTokenScopeOptions(opts, 'status');
        const chain = getActiveChain(opts.chain, opts.chainId);
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
        const amount = formatUnits(
          result.amount,
          await resolveCurrencyDecimals(publicClient, chain, result.currencyAddress),
        );

        output(result, () => {
          console.log('\nListing Details:');
          if (!result.hasListing) {
            console.log('  No active listing found.');
          } else {
            console.log(`  Seller:   ${result.seller}`);
            console.log(`  Amount:   ${amount} ${result.isEth ? 'ETH' : result.currencyAddress}`);
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
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function hasOption(value: string | undefined | null): value is string {
  return value !== undefined && value !== null && value !== '';
}

function requireTokenScopeOptions<T extends { contract?: string; tokenId?: string }>(
  opts: T,
  command: string,
): asserts opts is T & { contract: string; tokenId: string } {
  if (!hasOption(opts.contract) || !hasOption(opts.tokenId)) {
    throw new Error(`rare listing ${command} requires --contract and --token-id.`);
  }
}
