import { Command } from 'commander';
import { formatEther, getAddress, isAddress, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getActiveChain, readConfig } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { printError } from '../errors.js';
import { createRareClient } from '../sdk/client.js';
import { resolveCurrency } from '../contracts/addresses.js';
import { output, log } from '../output.js';

const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export function listingCommand(): Command {
  const cmd = new Command('listing');
  cmd.description('Listing subcommands (create, cancel, buy, status)');

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
    .option('--split-recipient <address>', 'seller split recipient; repeat with --split-ratio', collect, [])
    .option('--split-ratio <percent>', 'seller split ratio percentage; repeat with --split-recipient', collect, [])
    .option('--no-auto-approve', 'do not auto-approve required NFT transfer permissions')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      try {
        const chain = getActiveChain(opts.chain);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
        const isEth = currency === ETH_ADDRESS;
        const splitAddresses = parseSplitRecipients(opts.splitRecipient);
        const splitRatios = parseSplitRatios(opts.splitRatio);

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

          log(`Creating collection listing on ${chain}...`);
          log(`  CollectionMarket: ${rare.contracts.collectionMarket ?? 'not configured'}`);
          log(`  Collection: ${opts.collection}`);
          log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);
          if (splitAddresses !== undefined) {
            log(`  Split recipients: ${splitAddresses.join(', ')}`);
            log(`  Split ratios: ${splitRatios?.join(', ') ?? ''}`);
          }

          const result = await rare.collectionMarket.listing.set({
            originCollection: opts.collection as Address,
            amount: opts.amount,
            currency,
            splitAddresses,
            splitRatios,
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
        const target = (opts.target ?? ETH_ADDRESS) as `0x${string}`;

        log(`Creating listing on ${chain}...`);
        log(`  Marketplace contract: ${rare.contracts.auction}`);
        log(`  NFT contract: ${opts.contract}`);
        log(`  Token ID: ${opts.tokenId}`);
        log(`  Price: ${opts.price} ${isEth ? 'ETH' : currency}`);
        log(`  Target: ${target === ETH_ADDRESS ? 'public' : target}`);

        const result = await rare.listing.create({
          contract: opts.contract as `0x${string}`,
          tokenId: opts.tokenId,
          price: opts.price,
          currency,
          target,
          splitAddresses,
          splitRatios,
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
    .action(async (opts) => {
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

          log(`Cancelling collection listing on ${chain}...`);
          log(`  CollectionMarket: ${rare.contracts.collectionMarket ?? 'not configured'}`);

          const result = await rare.collectionMarket.listing.cancel({
            originCollection: opts.collection as Address,
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
        const target = (opts.target ?? ETH_ADDRESS) as `0x${string}`;

        log(`Cancelling listing on ${chain}...`);

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
    .action(async (opts) => {
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

          log(`Buying from collection listing on ${chain}...`);
          log(`  CollectionMarket: ${rare.contracts.collectionMarket ?? 'not configured'}`);
          log(`  Collection: ${opts.collection}`);
          log(`  Seller: ${opts.seller}`);
          log(`  Token ID: ${opts.tokenId}`);
          log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);

          const result = await rare.collectionMarket.listing.buy({
            originCollection: opts.collection as Address,
            seller: opts.seller as Address,
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

        log(`Buying token on ${chain}...`);
        log(`  Marketplace contract: ${rare.contracts.auction}`);
        log(`  NFT contract: ${opts.contract}`);
        log(`  Token ID: ${opts.tokenId}`);
        log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);

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

  cmd
    .command('status')
    .description('Get token-specific or collection-wide listing details')
    .option('--contract <address>', 'NFT contract address for a token-specific listing')
    .option('--token-id <id>', 'token ID for a token-specific listing or collection-wide buyability checks')
    .option('--collection <address>', 'origin collection contract address for a collection-wide listing')
    .option('--seller <address>', 'seller address that set the collection-wide listing')
    .option('--account <address>', 'wallet address for collection-wide can-buy/can-cancel checks')
    .option('--target <address>', 'target buyer address for token-specific listings (defaults to public listing)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
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
            ? getAddress(opts.account)
            : getConfiguredAccount(chain);
          const rare = createRareClient({ publicClient, account });

          const result = await rare.collectionMarket.listing.getStatus({
            originCollection: opts.collection as Address,
            seller: opts.seller as Address,
            tokenId: opts.tokenId,
            account,
          });

          output(result, () => {
            console.log('\nCollection Listing Details:');
            console.log(`  State:            ${result.state}`);
            console.log(`  Seller:           ${result.seller}`);
            console.log(`  Collection:       ${result.originCollection}`);
            console.log(`  Amount:           ${formatEther(result.amount)} ${result.isEth ? 'ETH' : result.currency}`);
            console.log(`  Currency:         ${result.isEth ? 'ETH' : result.currency}`);
            console.log(`  Marketplace fee:  ${result.marketplaceFee}%`);
            console.log(`  Required payment: ${formatEther(result.requiredPayment)} ${result.isEth ? 'ETH' : result.currency}`);
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

        const rare = createRareClient({ publicClient });
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
          }
        });
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function hasOption(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function requireTokenScopeOptions(opts: { contract?: string; tokenId?: string }, command: string): void {
  if (!hasOption(opts.contract) || !hasOption(opts.tokenId)) {
    throw new Error(`rare listing ${command} requires --contract and --token-id unless --collection is provided.`);
  }
}

function rejectTokenScopeOptions(opts: { contract?: string; tokenId?: string }, command: string): void {
  if (hasOption(opts.contract) || hasOption(opts.tokenId)) {
    throw new Error(`rare listing ${command} accepts either --collection or --contract/--token-id, not both.`);
  }
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseSplitRecipients(values: string[] | undefined): Address[] | undefined {
  if (values === undefined || values.length === 0) {
    return undefined;
  }

  return values.map((value, index) => {
    if (!isAddress(value)) {
      throw new Error(`--split-recipient at index ${index} must be a valid 0x address.`);
    }
    return getAddress(value);
  });
}

function parseSplitRatios(values: string[] | undefined): number[] | undefined {
  if (values === undefined || values.length === 0) {
    return undefined;
  }

  return values.map((value, index) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw new Error(`--split-ratio at index ${index} must be an integer.`);
    }
    return parsed;
  });
}

function getConfiguredAccount(chain: ReturnType<typeof getActiveChain>): Address | undefined {
  const privateKey = readConfig().chains[chain]?.privateKey;
  return privateKey ? privateKeyToAccount(privateKey as `0x${string}`).address : undefined;
}
