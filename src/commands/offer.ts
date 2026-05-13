import { Command } from 'commander';
import { formatEther } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient, tryGetWalletClient } from '../client.js';
import { printError } from '../errors.js';
import { createRareClient } from '../sdk/client.js';
import { ETH_ADDRESS, resolveCurrency } from '../contracts/addresses.js';
import { parseAddress } from '../sdk/validation.js';
import { output, log } from '../output.js';
import { collectSplit, finalizeSplits, formatSplitLines, type SplitAccumulator } from './splits-core.js';

type OfferCreateOptions = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  amount: string;
  currency?: string;
  autoApprove?: boolean;
  chain?: string;
};

type OfferTokenOptions = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  buyer?: string;
  account?: string;
  currency?: string;
  chain?: string;
};

type OfferAcceptOptions = OfferTokenOptions & {
  amount: string;
  split?: SplitAccumulator;
  autoApprove?: boolean;
};

export function offerCommand(): Command {
  const cmd = new Command('offer');
  cmd.description('Offer subcommands (create, cancel, accept, status)');

  // offer create
  cmd
    .command('create')
    .description('Create a token-specific or collection-wide offer')
    .option('--contract <address>', 'NFT contract address for a token-specific offer')
    .option('--token-id <id>', 'token ID for a token-specific offer')
    .option('--collection <address>', 'origin collection contract address for a collection-wide offer')
    .requiredOption('--amount <amount>', 'offer amount in ETH (or token units)')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--no-auto-approve', 'do not auto-approve ERC20 allowance when needed for collection-wide offers')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: OfferCreateOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;

      try {
        if (opts.collection !== undefined) {
          rejectTokenScopeOptions(opts, 'create');
          const collection = parseAddress(opts.collection, '--collection');

          log(`Creating collection offer on ${chain}...`);
          log(`  CollectionMarket: ${rare.contracts.collectionMarket ?? 'not configured'}`);
          log(`  Collection: ${collection}`);
          log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);

          const result = await rare.collectionMarket.offer.create({
            originCollection: collection,
            amount: opts.amount,
            currency,
            autoApprove: opts.autoApprove,
          });

          output(
            {
              txHash: result.txHash,
              blockNumber: result.receipt.blockNumber.toString(),
              approvalTxHash: result.approvalTxHash ?? null,
              collectionMarket: result.collectionMarket,
              buyer: result.buyer,
              originCollection: result.originCollection,
              amount: result.amount,
              currency: result.currency,
              requiredPayment: result.requiredPayment,
            },
            () => {
              if (result.approvalTxHash !== undefined) {
                console.log(`Approval tx sent: ${result.approvalTxHash}`);
              }
              console.log(`\nTransaction sent: ${result.txHash}`);
              console.log(`Collection offer created! Block: ${result.receipt.blockNumber}`);
            },
          );
          return;
        }

        requireTokenScopeOptions(opts, 'create');
        const contract = parseAddress(opts.contract, '--contract');

        log(`Creating offer on ${chain}...`);
        log(`  Marketplace contract: ${rare.contracts.auction}`);
        log(`  NFT contract: ${contract}`);
        log(`  Token ID: ${opts.tokenId}`);
        log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);

        const result = await rare.offer.create({
          contract,
          tokenId: opts.tokenId,
          amount: opts.amount,
          currency,
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
    .description('Cancel a token-specific or collection-wide offer')
    .option('--contract <address>', 'NFT contract address for a token-specific offer')
    .option('--token-id <id>', 'token ID for a token-specific offer')
    .option('--collection <address>', 'origin collection contract address for a collection-wide offer')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: OfferTokenOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;

      try {
        if (opts.collection !== undefined) {
          rejectTokenScopeOptions(opts, 'cancel');
          const collection = parseAddress(opts.collection, '--collection');

          log(`Cancelling collection offer on ${chain}...`);
          log(`  CollectionMarket: ${rare.contracts.collectionMarket ?? 'not configured'}`);

          const result = await rare.collectionMarket.offer.cancel({
            originCollection: collection,
          });

          output(
            {
              txHash: result.txHash,
              blockNumber: result.receipt.blockNumber.toString(),
              collectionMarket: result.collectionMarket,
              buyer: result.buyer,
              originCollection: result.originCollection,
              hadOffer: result.hadOffer,
              amount: result.amount,
              currency: result.currency,
            },
            () => {
              console.log(`Transaction sent: ${result.txHash}`);
              console.log(`Collection offer cancelled! Block: ${result.receipt.blockNumber}`);
            },
          );
          return;
        }

        requireTokenScopeOptions(opts, 'cancel');
        const contract = parseAddress(opts.contract, '--contract');

        log(`Cancelling offer on ${chain}...`);

        const result = await rare.offer.cancel({
          contract,
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
    .description('Accept a token-specific or collection-wide offer on a token you own')
    .option('--contract <address>', 'NFT contract address for a token-specific offer')
    .option('--collection <address>', 'origin collection contract address for a collection-wide offer')
    .option('--buyer <address>', 'collection-wide offer buyer address')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--amount <amount>', 'offer amount to accept in ETH (or token units)')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option(
      '--split <addr=ratio>',
      'payout split recipient (repeatable). Format: 0xADDR=RATIO. Ratios must sum to 100. If omitted, 100% goes to the connected wallet.',
      collectSplit,
    )
    .option('--no-auto-approve', 'do not auto-approve the NFT transfer for collection-wide offers')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: OfferAcceptOptions): Promise<void> => {
      const splits = finalizeSplits(opts.split);
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;

      try {
        if (opts.collection !== undefined) {
          if (opts.contract !== undefined) {
            throw new Error('rare offer accept accepts either --collection or --contract, not both.');
          }
          if (opts.buyer === undefined) {
            throw new Error('--buyer is required with --collection.');
          }
          const collection = parseAddress(opts.collection, '--collection');
          const buyer = parseAddress(opts.buyer, '--buyer');

          log(`Accepting collection offer on ${chain}...`);
          log(`  CollectionMarket: ${rare.contracts.collectionMarket ?? 'not configured'}`);
          log(`  Collection: ${collection}`);
          log(`  Buyer: ${buyer}`);
          log(`  Token ID: ${opts.tokenId}`);
          log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);

          const result = await rare.collectionMarket.offer.accept({
            buyer,
            originCollection: collection,
            tokenId: opts.tokenId,
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
              approvalTxHash: result.approvalTxHash ?? null,
              collectionMarket: result.collectionMarket,
              seller: result.seller,
              buyer: result.buyer,
              originCollection: result.originCollection,
              tokenId: result.tokenId,
              amount: result.amount,
              currency: result.currency,
            },
            () => {
              if (result.approvalTxHash !== undefined) {
                console.log(`Approval tx sent: ${result.approvalTxHash}`);
              }
              console.log(`\nTransaction sent: ${result.txHash}`);
              console.log(`Collection offer accepted! Block: ${result.receipt.blockNumber}`);
            },
          );
          return;
        }

        requireTokenScopeOptions(opts, 'accept');
        if (opts.buyer !== undefined) {
          throw new Error('--buyer is only supported with --collection.');
        }
        const contract = parseAddress(opts.contract, '--contract');

        log(`Accepting offer on ${chain}...`);
        log(`  NFT contract: ${contract}`);
        log(`  Token ID: ${opts.tokenId}`);
        log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);
        if (splits) {
          log(`  Splits:`);
          formatSplitLines(splits).forEach((line) => {
            log(line);
          });
        }

        const result = await rare.offer.accept({
          contract,
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

  // offer status
  cmd
    .command('status')
    .description('Get current token-specific or collection-wide offer details (read-only)')
    .option('--contract <address>', 'NFT contract address for a token-specific offer')
    .option('--token-id <id>', 'token ID for token-specific status or collection-wide acceptability checks')
    .option('--collection <address>', 'origin collection contract address for a collection-wide offer')
    .option('--buyer <address>', 'collection-wide offer buyer address')
    .option('--account <address>', 'wallet address for collection-wide can-accept/can-cancel checks')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: OfferTokenOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain);
      const publicClient = getPublicClient(chain);
      const wallet = tryGetWalletClient(chain);
      const rare = createRareClient({
        publicClient,
        walletClient: wallet?.client,
      });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;

      if (opts.collection !== undefined) {
        if (opts.contract !== undefined) {
          throw new Error('rare offer status accepts either --collection or --contract, not both.');
        }
        if (opts.buyer === undefined) {
          throw new Error('--buyer is required with --collection.');
        }
        const account = opts.account === undefined ? wallet?.client.account?.address : parseAddress(opts.account, '--account');
        const result = await rare.collectionMarket.offer.getStatus({
          buyer: parseAddress(opts.buyer, '--buyer'),
          originCollection: parseAddress(opts.collection, '--collection'),
          tokenId: opts.tokenId,
          account,
        });

        output(result, () => {
          console.log('\nCollection Offer Details:');
          console.log(`  State:            ${result.state}`);
          console.log(`  Buyer:            ${result.buyer}`);
          console.log(`  Collection:       ${result.originCollection}`);
          console.log(`  Amount:           ${formatEther(result.amount)} ${result.isEth ? 'ETH' : result.currency}`);
          console.log(`  Currency:         ${result.isEth ? 'ETH' : result.currency}`);
          console.log(`  Marketplace fee:  ${result.marketplaceFee}%`);
          console.log(`  Required payment: ${formatEther(result.requiredPayment)} ${result.isEth ? 'ETH' : result.currency}`);
          console.log(`  Can cancel:       ${result.canCancel ? 'yes' : 'no'}`);
          console.log(`  Can accept:       ${result.canAccept ? 'yes' : 'no'}`);
          if (result.currentWallet !== undefined) {
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
      if (opts.buyer !== undefined) {
        throw new Error('--buyer is only supported with --collection.');
      }
      if (opts.account !== undefined) {
        throw new Error('--account is only supported with --collection.');
      }
      const contract = parseAddress(opts.contract, '--contract');

      const result = await rare.offer.getStatus({
        contract,
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
          if (result.canAccept !== null || result.canCancel !== null) {
            console.log('  For your wallet:');
            console.log(`    Can accept:      ${result.canAccept ? 'yes' : 'no'}`);
            console.log(`    Can cancel:      ${result.canCancel ? 'yes' : 'no'}`);
          }
        }
      });
    });

  return cmd;
}

function hasOption(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function requireTokenScopeOptions<T extends { contract?: string; tokenId?: string }>(
  opts: T,
  command: string,
): asserts opts is T & { contract: string; tokenId: string } {
  if (!hasOption(opts.contract) || !hasOption(opts.tokenId)) {
    throw new Error(`rare offer ${command} requires --contract and --token-id unless --collection is provided.`);
  }
}

function rejectTokenScopeOptions(opts: { contract?: string; tokenId?: string }, command: string): void {
  if (hasOption(opts.contract) || hasOption(opts.tokenId)) {
    throw new Error(`rare offer ${command} accepts either --collection or --contract/--token-id, not both.`);
  }
}
