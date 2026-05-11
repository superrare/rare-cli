import { Command } from 'commander';
import { formatEther, getAddress, isAddress, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getPublicClient, getWalletClient } from '../client.js';
import { getActiveChain, readConfig } from '../config.js';
import { resolveCurrency } from '../contracts/addresses.js';
import { printError } from '../errors.js';
import { createRareClient } from '../sdk/client.js';
import { log, output } from '../output.js';

const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export function collectionMarketCommand(): Command {
  const cmd = new Command('collection-market');
  cmd.description('Collection-wide marketplace commands');
  cmd.addCommand(collectionMarketOfferCommand());
  return cmd;
}

function collectionMarketOfferCommand(): Command {
  const cmd = new Command('offer');
  cmd.description('Create, cancel, accept, and inspect collection-wide offers');

  cmd
    .command('create')
    .description('Create a collection-wide offer')
    .requiredOption('--collection <address>', 'origin collection contract address')
    .requiredOption('--amount <amount>', 'offer amount in ETH or token units')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--no-auto-approve', 'do not auto-approve ERC20 allowance when needed')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      try {
        const chain = getActiveChain(opts.chain);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;

        log(`Creating collection offer on ${chain}...`);
        log(`  CollectionMarket: ${rare.contracts.collectionMarket ?? 'not configured'}`);
        log(`  Collection: ${opts.collection}`);
        log(`  Amount: ${opts.amount} ${currency === ETH_ADDRESS ? 'ETH' : currency}`);

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
      } catch (error) {
        printError(error);
      }
    });

  cmd
    .command('cancel')
    .description('Cancel your collection-wide offer')
    .requiredOption('--collection <address>', 'origin collection contract address')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      try {
        const chain = getActiveChain(opts.chain);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });

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
      } catch (error) {
        printError(error);
      }
    });

  cmd
    .command('accept')
    .description('Accept a collection-wide offer for a token you own')
    .requiredOption('--collection <address>', 'origin collection contract address')
    .requiredOption('--buyer <address>', 'buyer address that placed the offer')
    .requiredOption('--token-id <id>', 'token ID to sell into the collection offer')
    .requiredOption('--amount <amount>', 'offer amount to accept in ETH or token units')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--split-recipient <address>', 'seller split recipient; repeat with --split-ratio', collect, [])
    .option('--split-ratio <percent>', 'seller split ratio percentage; repeat with --split-recipient', collect, [])
    .option('--no-auto-approve', 'do not auto-approve the collection market for NFT transfer')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      try {
        const chain = getActiveChain(opts.chain);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
        const splitAddresses = parseSplitRecipients(opts.splitRecipient);
        const splitRatios = parseSplitRatios(opts.splitRatio);

        log(`Accepting collection offer on ${chain}...`);
        log(`  CollectionMarket: ${rare.contracts.collectionMarket ?? 'not configured'}`);
        log(`  Collection: ${opts.collection}`);
        log(`  Buyer: ${opts.buyer}`);
        log(`  Token ID: ${opts.tokenId}`);
        log(`  Amount: ${opts.amount} ${currency === ETH_ADDRESS ? 'ETH' : currency}`);
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
      } catch (error) {
        printError(error);
      }
    });

  cmd
    .command('status')
    .description('Read collection-wide offer status')
    .requiredOption('--collection <address>', 'origin collection contract address')
    .requiredOption('--buyer <address>', 'buyer address that placed the offer')
    .option('--token-id <id>', 'token ID context for acceptability checks')
    .option('--account <address>', 'wallet address for can-accept/can-cancel checks')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      try {
        const chain = getActiveChain(opts.chain);
        const publicClient = getPublicClient(chain);
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
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
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
