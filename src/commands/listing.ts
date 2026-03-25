import { Command } from 'commander';
import { formatEther } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { printContractError } from '../errors.js';
import { createRareClient } from '../sdk/client.js';
import { resolveCurrency } from '../contracts/addresses.js';

const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export function listingCommand(): Command {
  const cmd = new Command('listing');
  cmd.description('Listing subcommands (create, cancel, buy, status)');

  // listing create
  cmd
    .command('create')
    .description('Create a listing (set sale price) for a token')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--price <amount>', 'listing price in ETH (or token units)')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--target <address>', 'target buyer address (defaults to public listing)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;
      const target = (opts.target ?? ETH_ADDRESS) as `0x${string}`;

      console.log(`Creating listing on ${chain}...`);
      console.log(`  Marketplace contract: ${rare.contracts.auction}`);
      console.log(`  NFT contract: ${opts.contract}`);
      console.log(`  Token ID: ${opts.tokenId}`);
      console.log(`  Price: ${opts.price} ${isEth ? 'ETH' : currency}`);
      console.log(`  Target: ${target === ETH_ADDRESS ? 'public' : target}`);

      try {
        const result = await rare.listing.create({
          contract: opts.contract as `0x${string}`,
          tokenId: opts.tokenId,
          price: opts.price,
          currency,
          target,
        });

        if (result.approvalTxHash) {
          console.log(`Approval tx sent: ${result.approvalTxHash}`);
        }
        console.log(`\nTransaction sent: ${result.txHash}`);
        console.log(`Listing created! Block: ${result.receipt.blockNumber}`);
      } catch (error) {
        printContractError(error);
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
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const target = (opts.target ?? ETH_ADDRESS) as `0x${string}`;

      console.log(`Cancelling listing on ${chain}...`);

      try {
        const result = await rare.listing.cancel({
          contract: opts.contract as `0x${string}`,
          tokenId: opts.tokenId,
          target,
        });

        console.log(`Transaction sent: ${result.txHash}`);
        console.log(`Listing cancelled! Block: ${result.receipt.blockNumber}`);
      } catch (error) {
        printContractError(error);
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
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;

      console.log(`Buying token on ${chain}...`);
      console.log(`  Marketplace contract: ${rare.contracts.auction}`);
      console.log(`  NFT contract: ${opts.contract}`);
      console.log(`  Token ID: ${opts.tokenId}`);
      console.log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);

      try {
        const result = await rare.listing.buy({
          contract: opts.contract as `0x${string}`,
          tokenId: opts.tokenId,
          amount: opts.amount,
          currency,
        });

        console.log(`\nTransaction sent: ${result.txHash}`);
        console.log(`Token purchased! Block: ${result.receipt.blockNumber}`);
      } catch (error) {
        printContractError(error);
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
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient });
      const target = (opts.target ?? ETH_ADDRESS) as `0x${string}`;

      const result = await rare.listing.getStatus({
        contract: opts.contract as `0x${string}`,
        tokenId: opts.tokenId,
        target,
      });

      console.log('\nListing Details:');
      if (!result.hasListing) {
        console.log('  No active listing found.');
      } else {
        console.log(`  Seller:   ${result.seller}`);
        console.log(`  Amount:   ${formatEther(result.amount)} ${result.isEth ? 'ETH' : result.currencyAddress}`);
        console.log(`  Currency: ${result.isEth ? 'ETH' : result.currencyAddress}`);
      }
    });

  return cmd;
}
