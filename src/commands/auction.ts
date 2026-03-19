import { Command } from 'commander';
import { formatEther } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { printContractError } from '../errors.js';
import { createRareClient } from '../sdk/client.js';

const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export function auctionCommand(): Command {
  const cmd = new Command('auction');
  cmd.description('Auction subcommands (create, bid, settle, cancel, status)');

  // auction create
  cmd
    .command('create')
    .description('Configure and start an auction')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID to auction')
    .requiredOption('--starting-price <amount>', 'starting price in ETH (or token units)')
    .requiredOption('--duration <seconds>', 'auction duration in seconds')
    .option('--currency <address>', 'ERC20 currency address (defaults to ETH)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const currency = (opts.currency ?? ETH_ADDRESS) as `0x${string}`;

      console.log(`Creating auction on ${chain}...`);
      console.log(`  Auction contract: ${rare.contracts.auction}`);
      console.log(`  NFT contract: ${opts.contract}`);
      console.log(`  Token ID: ${opts.tokenId}`);
      console.log(`  Starting price: ${opts.startingPrice} ETH`);
      console.log(`  Duration: ${opts.duration} seconds`);
      console.log(`  Currency: ${currency === ETH_ADDRESS ? 'ETH' : currency}`);

      try {
        const result = await rare.auction.create({
          contract: opts.contract as `0x${string}`,
          tokenId: opts.tokenId,
          startingPrice: opts.startingPrice,
          duration: opts.duration,
          currency,
        });

        if (result.approvalTxHash) {
          console.log(`Approval tx sent: ${result.approvalTxHash}`);
        }
        console.log(`\nTransaction sent: ${result.txHash}`);
        console.log(`Auction created! Block: ${result.receipt.blockNumber}`);
      } catch (error) {
        printContractError(error);
      }
    });

  // auction bid
  cmd
    .command('bid')
    .description('Place a bid on an auction')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--amount <amount>', 'bid amount in ETH (or token units)')
    .option('--currency <address>', 'ERC20 currency address (defaults to ETH)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const currency = (opts.currency ?? ETH_ADDRESS) as `0x${string}`;
      const isEth = currency === ETH_ADDRESS;

      console.log(`Placing bid on ${chain}...`);
      console.log(`  Auction contract: ${rare.contracts.auction}`);
      console.log(`  NFT contract: ${opts.contract}`);
      console.log(`  Token ID: ${opts.tokenId}`);
      console.log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);

      try {
        const result = await rare.auction.bid({
          contract: opts.contract as `0x${string}`,
          tokenId: opts.tokenId,
          amount: opts.amount,
          currency,
        });

        console.log(`\nTransaction sent: ${result.txHash}`);
        console.log(`Bid placed! Block: ${result.receipt.blockNumber}`);
      } catch (error) {
        printContractError(error);
      }
    });

  // auction settle
  cmd
    .command('settle')
    .description('Settle a completed auction')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      console.log(`Settling auction on ${chain}...`);

      try {
        const result = await rare.auction.settle({
          contract: opts.contract as `0x${string}`,
          tokenId: opts.tokenId,
        });

        console.log(`Transaction sent: ${result.txHash}`);
        console.log(`Auction settled! Block: ${result.receipt.blockNumber}`);
      } catch (error) {
        printContractError(error);
      }
    });

  // auction cancel
  cmd
    .command('cancel')
    .description('Cancel an auction')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      console.log(`Cancelling auction on ${chain}...`);

      try {
        const result = await rare.auction.cancel({
          contract: opts.contract as `0x${string}`,
          tokenId: opts.tokenId,
        });

        console.log(`Transaction sent: ${result.txHash}`);
        console.log(`Auction cancelled! Block: ${result.receipt.blockNumber}`);
      } catch (error) {
        printContractError(error);
      }
    });

  // auction status
  cmd
    .command('status')
    .description('Get auction details (read-only)')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient });

      const result = await rare.auction.getStatus({
        contract: opts.contract as `0x${string}`,
        tokenId: opts.tokenId,
      });

      const endDate = result.endTime ? new Date(Number(result.endTime) * 1000) : null;

      console.log('\nAuction Details:');
      console.log(`  Seller:         ${result.seller}`);
      console.log(`  Minimum bid:    ${formatEther(result.minimumBid)} ${result.isEth ? 'ETH' : result.currency}`);
      console.log(`  Currency:       ${result.isEth ? 'ETH' : result.currency}`);
      console.log(`  Duration:       ${result.lengthOfAuction}s`);
      console.log(`  Status:         ${result.status}`);
      if (result.started) {
        console.log(`  Started at:     ${new Date(Number(result.startingTime) * 1000).toISOString()}`);
        console.log(`  Ends at:        ${endDate!.toISOString()}`);
      }
      console.log(`  Creation block: ${result.creationBlock}`);
      console.log(`  Auction type:   ${result.auctionType}`);
    });

  return cmd;
}
