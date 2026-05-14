import { Command } from 'commander';
import { formatUnits, isAddressEqual, type Address } from 'viem';
import { getActiveChain } from '../config.js';
import { getConfiguredWalletAddress, getPublicClient, getWalletClient, tryGetWalletClient } from '../client.js';
import { printError } from '../errors.js';
import { createRareClient } from '../sdk/client.js';
import { ETH_ADDRESS, PUBLIC_LISTING_TARGET, resolveCurrency } from '../contracts/addresses.js';
import { parseAddress } from '../sdk/validation.js';
import { output, log } from '../output.js';
import { resolveCurrencyDecimals } from '../sdk/helpers.js';
import { collectSplit, finalizeSplits, formatSplitLines, type SplitAccumulator } from './splits-core.js';
import { batchCommand } from './batch.js';
import { releaseCommand } from './release.js';

type ListingCreateOptions = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  price?: string;
  amount?: string;
  currency?: string;
  target?: string;
  split?: SplitAccumulator;
  autoApprove?: boolean;
  chain?: string;
};

type ListingCancelOptions = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  target?: string;
  chain?: string;
};

type ListingBuyOptions = {
  contract?: string;
  collection?: string;
  seller?: string;
  tokenId: string;
  amount: string;
  currency?: string;
  autoApprove?: boolean;
  chain?: string;
};

type ListingStatusOptions = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  seller?: string;
  account?: string;
  target?: string;
  chain?: string;
};

export function listingCommand(): Command {
  const cmd = new Command('listing');
  cmd.description('Listing subcommands (create, cancel, buy, status, batch, release)');
  cmd.addCommand(batchCommand());
  cmd.addCommand(releaseCommand());

  cmd
    .command('create')
    .description('Create a token-specific or collection-wide listing')
    .option('--contract <address>', 'NFT contract address for a token-specific listing')
    .option('--token-id <id>', 'token ID for a token-specific listing')
    .option('--collection <address>', 'origin collection contract address for a collection-wide listing')
    .option('--price <amount>', 'token-specific listing price in ETH or token units')
    .option('--amount <amount>', 'collection-wide sale price in ETH or token units')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--target <address>', 'target buyer address for token-specific listings (defaults to public listing)')
    .option(
      '--split <addr=ratio>',
      'payout split recipient (repeatable). Format: 0xADDR=RATIO. Ratios must sum to 100. If omitted, 100% goes to the connected wallet.',
      collectSplit,
    )
    .option('--no-auto-approve', 'do not auto-approve required NFT transfer permissions')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: ListingCreateOptions): Promise<void> => {
      try {
        const chain = getActiveChain(opts.chain);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
        const isEth = currency === ETH_ADDRESS;
        const splits = finalizeSplits(opts.split);

        if (hasOption(opts.collection)) {
          rejectTokenScopeOptions(opts, 'create');
          if (hasOption(opts.price)) {
            throw new Error('--price is only supported with --contract and --token-id; use --amount with --collection.');
          }
          if (hasOption(opts.target)) {
            throw new Error('--target is only supported with --contract and --token-id.');
          }
          if (!hasOption(opts.amount)) {
            throw new Error('--amount is required with --collection.');
          }
          const collection = parseAddress(opts.collection, '--collection');

          log(`Creating collection listing on ${chain}...`);
          log(`  CollectionMarket: ${rare.contracts.collectionMarket ?? 'not configured'}`);
          log(`  Collection: ${collection}`);
          log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);
          if (splits) {
            log('  Splits:');
            formatSplitLines(splits).forEach((line) => {
              log(line);
            });
          }

          const result = await rare.collectionMarket.listing.set({
            originCollection: collection,
            amount: opts.amount,
            currency,
            splitAddresses: splits?.addresses,
            splitRatios: splits?.ratios,
            autoApprove: opts.autoApprove,
          });

          output(
            {
              txHash: result.txHash,
              blockNumber: result.receipt.blockNumber.toString(),
              collectionMarket: result.collectionMarket,
              seller: result.seller,
              originCollection: result.originCollection,
              amount: result.amount,
              currency: result.currency,
              splitRecipients: result.splitRecipients,
              splitRatios: result.splitRatios,
              approvalTxHash: result.approvalTxHash ?? null,
            },
            () => {
              if (result.approvalTxHash) {
                console.log(`Approval tx sent: ${result.approvalTxHash}`);
              }
              console.log(`\nTransaction sent: ${result.txHash}`);
              console.log(`Collection listing created! Block: ${result.receipt.blockNumber}`);
            },
          );
          return;
        }

        requireTokenScopeOptions(opts, 'create');
        if (!hasOption(opts.price)) {
          throw new Error('--price is required with --contract and --token-id.');
        }
        if (hasOption(opts.amount)) {
          throw new Error('--amount is only supported with --collection; use --price with --contract and --token-id.');
        }
        const contract = parseAddress(opts.contract, '--contract');
        const target = opts.target ? parseAddress(opts.target, '--target') : PUBLIC_LISTING_TARGET;

        log(`Creating listing on ${chain}...`);
        log(`  Marketplace contract: ${rare.contracts.auction}`);
        log(`  NFT contract: ${contract}`);
        log(`  Token ID: ${opts.tokenId}`);
        log(`  Price: ${opts.price} ${isEth ? 'ETH' : currency}`);
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
          price: opts.price,
          currency,
          target,
          splitAddresses: splits?.addresses,
          splitRatios: splits?.ratios,
          autoApprove: opts.autoApprove,
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
    .description('Cancel a token-specific or collection-wide listing')
    .option('--contract <address>', 'NFT contract address for a token-specific listing')
    .option('--token-id <id>', 'token ID for a token-specific listing')
    .option('--collection <address>', 'origin collection contract address for a collection-wide listing')
    .option('--target <address>', 'target buyer address for token-specific listings (defaults to public listing)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: ListingCancelOptions): Promise<void> => {
      try {
        const chain = getActiveChain(opts.chain);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });

        if (hasOption(opts.collection)) {
          rejectTokenScopeOptions(opts, 'cancel');
          if (hasOption(opts.target)) {
            throw new Error('--target is only supported with --contract and --token-id.');
          }
          const collection = parseAddress(opts.collection, '--collection');

          log(`Cancelling collection listing on ${chain}...`);
          log(`  CollectionMarket: ${rare.contracts.collectionMarket ?? 'not configured'}`);

          const result = await rare.collectionMarket.listing.cancel({
            originCollection: collection,
          });

          output(
            {
              txHash: result.txHash,
              blockNumber: result.receipt.blockNumber.toString(),
              collectionMarket: result.collectionMarket,
              seller: result.seller,
              originCollection: result.originCollection,
              hadListing: result.hadListing,
              amount: result.amount,
              currency: result.currency,
            },
            () => {
              console.log(`Transaction sent: ${result.txHash}`);
              console.log(`Collection listing cancelled! Block: ${result.receipt.blockNumber}`);
            },
          );
          return;
        }

        requireTokenScopeOptions(opts, 'cancel');
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
    .description('Buy a token-specific or collection-wide listing')
    .option('--contract <address>', 'NFT contract address for a token-specific listing')
    .option('--collection <address>', 'origin collection contract address for a collection-wide listing')
    .option('--seller <address>', 'seller address that set the collection-wide listing')
    .requiredOption('--token-id <id>', 'token ID to buy')
    .requiredOption('--amount <amount>', 'purchase amount in ETH or token units')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--no-auto-approve', 'do not auto-approve ERC20 allowance when needed for collection-wide listings')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: ListingBuyOptions): Promise<void> => {
      try {
        const chain = getActiveChain(opts.chain);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
        const isEth = currency === ETH_ADDRESS;

        if (hasOption(opts.collection)) {
          if (hasOption(opts.contract)) {
            throw new Error('rare listing buy accepts either --collection or --contract, not both.');
          }
          if (!hasOption(opts.seller)) {
            throw new Error('--seller is required with --collection.');
          }
          const collection = parseAddress(opts.collection, '--collection');
          const seller = parseAddress(opts.seller, '--seller');

          log(`Buying from collection listing on ${chain}...`);
          log(`  CollectionMarket: ${rare.contracts.collectionMarket ?? 'not configured'}`);
          log(`  Collection: ${collection}`);
          log(`  Seller: ${seller}`);
          log(`  Token ID: ${opts.tokenId}`);
          log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);

          const result = await rare.collectionMarket.listing.buy({
            originCollection: collection,
            seller,
            tokenId: opts.tokenId,
            amount: opts.amount,
            currency,
            autoApprove: opts.autoApprove,
          });

          output(
            {
              txHash: result.txHash,
              blockNumber: result.receipt.blockNumber.toString(),
              collectionMarket: result.collectionMarket,
              seller: result.seller,
              buyer: result.buyer,
              originCollection: result.originCollection,
              tokenId: result.tokenId,
              amount: result.amount,
              currency: result.currency,
              requiredPayment: result.requiredPayment,
              approvalTxHash: result.approvalTxHash ?? null,
            },
            () => {
              if (result.approvalTxHash) {
                console.log(`Approval tx sent: ${result.approvalTxHash}`);
              }
              console.log(`\nTransaction sent: ${result.txHash}`);
              console.log(`Collection listing bought! Block: ${result.receipt.blockNumber}`);
            },
          );
          return;
        }

        if (!hasOption(opts.contract)) {
          throw new Error('rare listing buy requires --contract unless --collection is provided.');
        }
        if (hasOption(opts.seller)) {
          throw new Error('--seller is only supported with --collection.');
        }
        const contract = parseAddress(opts.contract, '--contract');

        log(`Buying token on ${chain}...`);
        log(`  Marketplace contract: ${rare.contracts.auction}`);
        log(`  NFT contract: ${contract}`);
        log(`  Token ID: ${opts.tokenId}`);
        log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);

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

  cmd
    .command('status')
    .description('Get token-specific or collection-wide listing details')
    .option('--contract <address>', 'NFT contract address for a token-specific listing')
    .option('--token-id <id>', 'token ID for a token-specific listing or collection-wide buyability checks')
    .option('--collection <address>', 'origin collection contract address for a collection-wide listing')
    .option('--seller <address>', 'seller address that set the collection-wide listing')
    .option('--account <address>', 'account address for collection-wide can-buy/can-cancel checks')
    .option('--target <address>', 'target buyer address for token-specific listings (defaults to public listing)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: ListingStatusOptions): Promise<void> => {
      try {
        const chain = getActiveChain(opts.chain);
        const publicClient = getPublicClient(chain);

        if (hasOption(opts.collection)) {
          if (hasOption(opts.contract)) {
            throw new Error('rare listing status accepts either --collection or --contract, not both.');
          }
          if (hasOption(opts.target)) {
            throw new Error('--target is only supported with --contract and --token-id.');
          }
          if (!hasOption(opts.seller)) {
            throw new Error('--seller is required with --collection.');
          }

          const account = opts.account
            ? parseAddress(opts.account, '--account')
            : getConfiguredAccount(chain);
          const collection = parseAddress(opts.collection, '--collection');
          const seller = parseAddress(opts.seller, '--seller');
          const rare = createRareClient({ publicClient, account });

          const result = await rare.collectionMarket.listing.getStatus({
            originCollection: collection,
            seller,
            tokenId: opts.tokenId,
            account,
          });
          const amount = formatUnits(
            result.amount,
            await resolveCurrencyDecimals(publicClient, chain, result.currency),
          );
          const requiredPayment = formatUnits(
            result.requiredPayment,
            await resolveCurrencyDecimals(publicClient, chain, result.currency),
          );

          output(result, () => {
            console.log('\nCollection Listing Details:');
            console.log(`  State:            ${result.state}`);
            console.log(`  Seller:           ${result.seller}`);
            console.log(`  Collection:       ${result.originCollection}`);
            console.log(`  Amount:           ${amount} ${result.isEth ? 'ETH' : result.currency}`);
            console.log(`  Currency:         ${result.isEth ? 'ETH' : result.currency}`);
            console.log(`  Marketplace fee:  ${result.marketplaceFee}%`);
            console.log(`  Required payment: ${requiredPayment} ${result.isEth ? 'ETH' : result.currency}`);
            console.log(`  Can cancel:       ${result.canCancel ? 'yes' : 'no'}`);
            console.log(`  Can buy:          ${result.canBuy ? 'yes' : 'no'}`);
            if (result.currentWallet) {
              console.log(`  Wallet:           ${result.currentWallet}`);
            }
            if (result.tokenId !== undefined) {
              console.log(`  Token ID:         ${result.tokenId}`);
              console.log(`  Token owner:      ${result.tokenOwner ?? 'unknown'}`);
            }
          });
          return;
        }

        requireTokenScopeOptions(opts, 'status');
        if (hasOption(opts.seller)) {
          throw new Error('--seller is only supported with --collection.');
        }
        if (hasOption(opts.account)) {
          throw new Error('--account is only supported with --collection.');
        }

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
    throw new Error(`rare listing ${command} requires --contract and --token-id unless --collection is provided.`);
  }
}

function rejectTokenScopeOptions(opts: { contract?: string; tokenId?: string }, command: string): void {
  if (hasOption(opts.contract) || hasOption(opts.tokenId)) {
    throw new Error(`rare listing ${command} accepts either --collection or --contract/--token-id, not both.`);
  }
}

function getConfiguredAccount(chain: ReturnType<typeof getActiveChain>): Address | undefined {
  return getConfiguredWalletAddress(chain);
}
