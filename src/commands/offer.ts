import { Command } from 'commander';
import { formatUnits } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient, tryGetWalletClient } from '../client.js';
import { printError } from '../errors.js';
import { createRareClient } from '../sdk/client.js';
import { ETH_ADDRESS, resolveCurrency } from '../contracts/addresses.js';
import { parseAddress } from '../sdk/validation.js';
import { output, log } from '../output.js';
import { createOfferListCommand } from './account-market-list.js';
import { resolveCurrencyDecimals } from '../sdk/helpers.js';
import { runWithNftApprovalConsent, runWithPaymentApprovalConsent } from './approval-consent.js';
import { collectSplit, finalizeSplits, formatSplitLines, type SplitAccumulator } from './splits-core.js';
import { offerBatchCommand } from './batch.js';

type OfferCreateOptions = {
  contract?: string;
  tokenId?: string;
  price?: string;
  currency?: string;
  yes?: boolean;
  chain?: string;
  chainId?: string;
};

type OfferCancelOptions = {
  contract?: string;
  tokenId?: string;
  currency?: string;
  chain?: string;
  chainId?: string;
};

type OfferAcceptOptions = {
  contract?: string;
  tokenId: string;
  price?: string;
  currency?: string;
  split?: SplitAccumulator;
  chain?: string;
  chainId?: string;
  yes?: boolean;
};

type OfferStatusOptions = {
  contract?: string;
  tokenId?: string;
  currency?: string;
  chain?: string;
  chainId?: string;
};

export function offerCommand(): Command {
  const cmd = new Command('offer');
  cmd.description('Offer subcommands (list, create, cancel, accept, status)');
  cmd.addCommand(createOfferListCommand());
  cmd.addCommand(offerBatchCommand());

  cmd
    .command('create')
    .description('Create a token-specific offer')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--price <amount>', 'offer price in ETH or token units')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .option('--yes', 'yes to all prompts, including approval and transaction submission')
    .action(async (opts: OfferCreateOptions) => {
      try {
        requireTokenScopeOptions(opts, 'create');
        const price = opts.price;
        if (!hasOption(price)) {
          throw new Error('rare offer create requires --price.');
        }
        const chain = getActiveChain(opts.chain, opts.chainId);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
        const isEth = currency === ETH_ADDRESS;
        const contract = parseAddress(opts.contract, '--contract');

        log(`Creating offer on ${chain}...`);
        log(`  Marketplace contract: ${rare.contracts.auction}`);
        log(`  NFT contract: ${contract}`);
        log(`  Token ID: ${opts.tokenId}`);
        log(`  Price: ${price} ${isEth ? 'ETH' : currency}`);

        const offerParams = {
          contract,
          tokenId: opts.tokenId,
          price,
          currency,
        };
        const result = await runWithPaymentApprovalConsent({
          commandName: 'rare offer create',
          approvalMessage: 'ERC20 approval is required before creating this offer.',
          runWithoutApproval: () => rare.offer.create({
            ...offerParams,
            autoApprove: opts.yes === true,
          }),
          runWithApproval: () => rare.offer.create({
            ...offerParams,
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
          },
          () => {
            if (result.approvalTxHash) {
              console.log(`Approval tx sent: ${result.approvalTxHash}`);
            }
            console.log(`\nTransaction sent: ${result.txHash}`);
            console.log(`Offer created! Block: ${result.receipt.blockNumber}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  cmd
    .command('cancel')
    .description('Cancel a token-specific offer')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: OfferCancelOptions) => {
      try {
        requireTokenScopeOptions(opts, 'cancel');
        const chain = getActiveChain(opts.chain, opts.chainId);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const contract = parseAddress(opts.contract, '--contract');
        const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;

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

  cmd
    .command('accept')
    .description('Accept a token-specific offer')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID to sell')
    .option('--price <amount>', 'offer price to accept in ETH or token units')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option(
      '--split <addr=ratio>',
      'payout split recipient (repeatable). Format: 0xADDR=RATIO. Ratios must sum to 100. If omitted, 100% goes to the connected wallet.',
      collectSplit,
    )
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .option('--yes', 'yes to all prompts, including approval and transaction submission')
    .action(async (opts: OfferAcceptOptions) => {
      try {
        const chain = getActiveChain(opts.chain, opts.chainId);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
        const isEth = currency === ETH_ADDRESS;
        const splits = finalizeSplits(opts.split);
        const price = opts.price;
        if (!hasOption(price)) {
          throw new Error('rare offer accept requires --price.');
        }
        if (!hasOption(opts.contract)) {
          throw new Error('rare offer accept requires --contract.');
        }
        const contract = parseAddress(opts.contract, '--contract');

        log(`Accepting offer on ${chain}...`);
        log(`  NFT contract: ${contract}`);
        log(`  Token ID: ${opts.tokenId}`);
        log(`  Price: ${price} ${isEth ? 'ETH' : currency}`);
        if (splits) {
          log('  Splits:');
          formatSplitLines(splits).forEach((line) => {
            log(line);
          });
        }

        const acceptParams = {
          contract,
          tokenId: opts.tokenId,
          price,
          currency,
          splitAddresses: splits?.addresses,
          splitRatios: splits?.ratios,
        };
        const result = await runWithNftApprovalConsent({
          commandName: 'rare offer accept',
          approvalMessage: 'NFT approval is required before accepting this offer.',
          runWithoutApproval: () => rare.offer.accept({
            ...acceptParams,
            autoApprove: opts.yes === true,
          }),
          runWithApproval: () => rare.offer.accept({
            ...acceptParams,
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
          },
          () => {
            if (result.approvalTxHash) {
              console.log(`Approval tx sent: ${result.approvalTxHash}`);
            }
            console.log(`\nTransaction sent: ${result.txHash}`);
            console.log(`Offer accepted! Block: ${result.receipt.blockNumber}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  cmd
    .command('status')
    .description('Get token-specific offer details')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: OfferStatusOptions) => {
      try {
        requireTokenScopeOptions(opts, 'status');
        const chain = getActiveChain(opts.chain, opts.chainId);
        const publicClient = getPublicClient(chain);
        const wallet = tryGetWalletClient(chain);
        const rare = createRareClient({
          publicClient,
          walletClient: wallet?.client,
        });
        const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
        const isEth = currency === ETH_ADDRESS;
        const contract = parseAddress(opts.contract, '--contract');

        const result = await rare.offer.getStatus({
          contract,
          tokenId: opts.tokenId,
          currency,
        });
        const amount = formatUnits(
          result.amount,
          await resolveCurrencyDecimals(publicClient, chain, result.currency),
        );

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
            console.log(`  Amount:            ${amount} ${isEth ? 'ETH' : currency}`);
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
    throw new Error(`rare offer ${command} requires --contract and --token-id.`);
  }
}
