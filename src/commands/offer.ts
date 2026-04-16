import { Command } from 'commander';
import { formatEther } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { printError } from '../errors.js';
import { createRareClient } from '../sdk/client.js';
import { resolveCurrency } from '../contracts/addresses.js';
import { output, log } from '../output.js';

const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export function offerCommand(): Command {
  const cmd = new Command('offer');
  cmd.description('Offer subcommands (create, cancel, accept, status)');

  // offer create
  cmd
    .command('create')
    .description('Create an offer on a token')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--amount <amount>', 'offer amount in ETH (or token units)')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--convertible', 'mark offer as convertible')
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
    .requiredOption('--amount <amount>', 'offer amount to accept in ETH (or token units)')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
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

      try {
        const result = await rare.offer.accept({
          contract: opts.contract as `0x${string}`,
          tokenId: opts.tokenId,
          amount: opts.amount,
          currency,
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
    .description('Get current offer details (read-only)')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const publicClient = getPublicClient(chain);
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
    });

  return cmd;
}
