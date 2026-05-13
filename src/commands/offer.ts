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

export function offerCommand(): Command {
  const cmd = new Command('offer');
  cmd.description('Offer subcommands (create, cancel, accept, status)');

  cmd
    .command('create')
    .description('Create a token-specific or collection-wide offer')
    .option('--contract <address>', 'NFT contract address for a token-specific offer')
    .option('--token-id <id>', 'token ID for a token-specific offer')
    .option('--collection <address>', 'origin collection contract address for a collection-wide offer')
    .requiredOption('--amount <amount>', 'offer amount in ETH or token units')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--convertible', 'mark token-specific offer as convertible')
    .option('--no-auto-approve', 'do not auto-approve ERC20 allowance when needed for collection-wide offers')
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
          rejectTokenScopeOptions(opts, 'create');
          if (opts.convertible) {
            throw new Error('--convertible is only supported with --contract and --token-id.');
          }

          log(`Creating collection offer on ${chain}...`);
          log(`  CollectionMarket: ${rare.contracts.collectionMarket ?? 'not configured'}`);
          log(`  Collection: ${opts.collection}`);
          log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);

          const result = await rare.collectionMarket.offer.create({
            originCollection: opts.collection as Address,
            amount: opts.amount,
            currency,
            autoApprove: opts.autoApprove,
          });

          output(
            {
              txHash: result.txHash,
              blockNumber: result.receipt.blockNumber.toString(),
              collectionMarket: result.collectionMarket,
              buyer: result.buyer,
              originCollection: result.originCollection,
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
              console.log(`Collection offer created! Block: ${result.receipt.blockNumber}`);
            },
          );
          return;
        }

        requireTokenScopeOptions(opts, 'create');

        log(`Creating offer on ${chain}...`);
        log(`  Marketplace contract: ${rare.contracts.auction}`);
        log(`  NFT contract: ${opts.contract}`);
        log(`  Token ID: ${opts.tokenId}`);
        log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);
        log(`  Convertible: ${opts.convertible ? 'yes' : 'no'}`);

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

  cmd
    .command('cancel')
    .description('Cancel a token-specific or collection-wide offer')
    .option('--contract <address>', 'NFT contract address for a token-specific offer')
    .option('--token-id <id>', 'token ID for a token-specific offer')
    .option('--collection <address>', 'origin collection contract address for a collection-wide offer')
    .option('--currency <currency>', 'currency for a token-specific offer: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      try {
        const chain = getActiveChain(opts.chain);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });

        if (hasOption(opts.collection)) {
          rejectTokenScopeOptions(opts, 'cancel');
          if (hasOption(opts.currency)) {
            throw new Error('--currency is only supported with --contract and --token-id.');
          }

          log(`Cancelling collection offer on ${chain}...`);
          log(`  CollectionMarket: ${rare.contracts.collectionMarket ?? 'not configured'}`);

          const result = await rare.collectionMarket.offer.cancel({
            originCollection: opts.collection as Address,
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
        const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;

        log(`Cancelling offer on ${chain}...`);

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

  cmd
    .command('accept')
    .description('Accept a token-specific or collection-wide offer')
    .option('--contract <address>', 'NFT contract address for a token-specific offer')
    .option('--collection <address>', 'origin collection contract address for a collection-wide offer')
    .option('--buyer <address>', 'buyer address that placed the collection-wide offer')
    .requiredOption('--token-id <id>', 'token ID to sell')
    .requiredOption('--amount <amount>', 'offer amount to accept in ETH or token units')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--split-recipient <address>', 'seller split recipient; repeat with --split-ratio', collect, [])
    .option('--split-ratio <percent>', 'seller split ratio percentage; repeat with --split-recipient', collect, [])
    .option('--no-auto-approve', 'do not auto-approve NFT transfer permissions for collection-wide offers')
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
          if (hasOption(opts.contract)) {
            throw new Error('rare offer accept accepts either --collection or --contract, not both.');
          }
          if (!hasOption(opts.buyer)) {
            throw new Error('--buyer is required with --collection.');
          }

          log(`Accepting collection offer on ${chain}...`);
          log(`  CollectionMarket: ${rare.contracts.collectionMarket ?? 'not configured'}`);
          log(`  Collection: ${opts.collection}`);
          log(`  Buyer: ${opts.buyer}`);
          log(`  Token ID: ${opts.tokenId}`);
          log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);
          if (splitAddresses !== undefined) {
            log(`  Split recipients: ${splitAddresses.join(', ')}`);
            log(`  Split ratios: ${splitRatios?.join(', ') ?? ''}`);
          }

          const result = await rare.collectionMarket.offer.accept({
            originCollection: opts.collection as Address,
            buyer: opts.buyer as Address,
            tokenId: opts.tokenId,
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
              buyer: result.buyer,
              originCollection: result.originCollection,
              tokenId: result.tokenId,
              amount: result.amount,
              currency: result.currency,
              approvalTxHash: result.approvalTxHash ?? null,
            },
            () => {
              if (result.approvalTxHash) {
                console.log(`Approval tx sent: ${result.approvalTxHash}`);
              }
              console.log(`\nTransaction sent: ${result.txHash}`);
              console.log(`Collection offer accepted! Block: ${result.receipt.blockNumber}`);
            },
          );
          return;
        }

        if (!hasOption(opts.contract)) {
          throw new Error('rare offer accept requires --contract unless --collection is provided.');
        }
        if (hasOption(opts.buyer)) {
          throw new Error('--buyer is only supported with --collection.');
        }

        log(`Accepting offer on ${chain}...`);
        log(`  NFT contract: ${opts.contract}`);
        log(`  Token ID: ${opts.tokenId}`);
        log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);

        const result = await rare.offer.accept({
          contract: opts.contract as `0x${string}`,
          tokenId: opts.tokenId,
          amount: opts.amount,
          currency,
          splitAddresses,
          splitRatios,
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

  cmd
    .command('status')
    .description('Get token-specific or collection-wide offer details')
    .option('--contract <address>', 'NFT contract address for a token-specific offer')
    .option('--token-id <id>', 'token ID for a token-specific offer or collection-wide acceptability checks')
    .option('--collection <address>', 'origin collection contract address for a collection-wide offer')
    .option('--buyer <address>', 'buyer address that placed the collection-wide offer')
    .option('--account <address>', 'wallet address for collection-wide can-accept/can-cancel checks')
    .option('--currency <currency>', 'currency for a token-specific offer: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      try {
        const chain = getActiveChain(opts.chain);
        const publicClient = getPublicClient(chain);

        if (hasOption(opts.collection)) {
          if (hasOption(opts.contract)) {
            throw new Error('rare offer status accepts either --collection or --contract, not both.');
          }
          if (hasOption(opts.currency)) {
            throw new Error('--currency is only supported with --contract and --token-id.');
          }
          if (!hasOption(opts.buyer)) {
            throw new Error('--buyer is required with --collection.');
          }

          const account = opts.account
            ? getAddress(opts.account)
            : getConfiguredAccount(chain);
          const rare = createRareClient({ publicClient, account });

          const result = await rare.collectionMarket.offer.getStatus({
            originCollection: opts.collection as Address,
            buyer: opts.buyer as Address,
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
            console.log('  Expiry:           not supported by this contract');
            console.log(`  Can cancel:       ${result.canCancel ? 'yes' : 'no'}`);
            console.log(`  Can accept:       ${result.canAccept ? 'yes' : 'no'}`);
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
        if (hasOption(opts.buyer)) {
          throw new Error('--buyer is only supported with --collection.');
        }
        if (hasOption(opts.account)) {
          throw new Error('--account is only supported with --collection.');
        }

        const rare = createRareClient({ publicClient });
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
          } else {
            console.log(`  Buyer:           ${result.buyer}`);
            console.log(`  Amount:          ${formatEther(result.amount)} ${isEth ? 'ETH' : currency}`);
            console.log(`  Timestamp:       ${new Date(Number(result.timestamp) * 1000).toISOString()}`);
            console.log(`  Marketplace fee: ${result.marketplaceFee}%`);
            console.log(`  Convertible:     ${result.convertible ? 'yes' : 'no'}`);
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
    throw new Error(`rare offer ${command} requires --contract and --token-id unless --collection is provided.`);
  }
}

function rejectTokenScopeOptions(opts: { contract?: string; tokenId?: string }, command: string): void {
  if (hasOption(opts.contract) || hasOption(opts.tokenId)) {
    throw new Error(`rare offer ${command} accepts either --collection or --contract/--token-id, not both.`);
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
