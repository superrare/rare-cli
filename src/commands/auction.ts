import { Command } from 'commander';
import { parseEther, formatEther } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { contractAddresses } from '../contracts/addresses.js';
import { auctionAbi } from '../contracts/abis/auction.js';
import { tokenAbi } from '../contracts/abis/token.js';

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
    .option('--chain <chain>', 'chain to use (sepolia or mainnet)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client, account } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const auctionAddress = contractAddresses[chain].auction;
      const currency = (opts.currency ?? ETH_ADDRESS) as `0x${string}`;

      console.log(`Creating auction on ${chain}...`);
      console.log(`  Auction contract: ${auctionAddress}`);
      console.log(`  NFT contract: ${opts.contract}`);
      console.log(`  Token ID: ${opts.tokenId}`);
      console.log(`  Starting price: ${opts.startingPrice} ETH`);
      console.log(`  Duration: ${opts.duration} seconds`);

      // Check if approval is needed
      const nftAddress = opts.contract as `0x${string}`;
      const isApproved = await publicClient.readContract({
        address: nftAddress,
        abi: tokenAbi,
        functionName: 'isApprovedForAll',
        args: [account.address, auctionAddress],
      });

      if (!isApproved) {
        console.log('\nApproval required. Requesting setApprovalForAll...');
        const approveTxHash = await client.writeContract({
          address: nftAddress,
          abi: tokenAbi,
          functionName: 'setApprovalForAll',
          args: [auctionAddress, true],
          account,
          chain: undefined,
        });
        console.log(`Approval tx sent: ${approveTxHash}`);
        await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
        console.log('Approval confirmed.\n');
      } else {
        console.log('(Already approved)\n');
      }

      const txHash = await client.writeContract({
        address: auctionAddress,
        abi: auctionAbi,
        functionName: 'configureAuction',
        args: [
          opts.contract as `0x${string}`,
          BigInt(opts.tokenId),
          parseEther(opts.startingPrice),
          BigInt(opts.duration),
          currency,
        ],
        account,
        chain: undefined,
      });

      console.log(`Transaction sent: ${txHash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`Auction created! Block: ${receipt.blockNumber}`);
    });

  // auction bid
  cmd
    .command('bid')
    .description('Place a bid on an auction')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--amount <amount>', 'bid amount in ETH (or token units)')
    .option('--currency <address>', 'ERC20 currency address (defaults to ETH)')
    .option('--chain <chain>', 'chain to use (sepolia or mainnet)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client, account } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const auctionAddress = contractAddresses[chain].auction;
      const isEth = !opts.currency || opts.currency === ETH_ADDRESS;
      const bidAmount = parseEther(opts.amount);

      console.log(`Placing bid on ${chain}...`);
      console.log(`  Auction contract: ${auctionAddress}`);
      console.log(`  NFT contract: ${opts.contract}`);
      console.log(`  Token ID: ${opts.tokenId}`);
      console.log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : opts.currency}`);

      const txHash = await client.writeContract({
        address: auctionAddress,
        abi: auctionAbi,
        functionName: 'bid',
        args: [opts.contract as `0x${string}`, BigInt(opts.tokenId), bidAmount],
        account,
        chain: undefined,
        value: isEth ? bidAmount : 0n,
      });

      console.log(`Transaction sent: ${txHash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`Bid placed! Block: ${receipt.blockNumber}`);
    });

  // auction settle
  cmd
    .command('settle')
    .description('Settle a completed auction')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--chain <chain>', 'chain to use (sepolia or mainnet)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client, account } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const auctionAddress = contractAddresses[chain].auction;

      console.log(`Settling auction on ${chain}...`);

      const txHash = await client.writeContract({
        address: auctionAddress,
        abi: auctionAbi,
        functionName: 'settleAuction',
        args: [opts.contract as `0x${string}`, BigInt(opts.tokenId)],
        account,
        chain: undefined,
      });

      console.log(`Transaction sent: ${txHash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`Auction settled! Block: ${receipt.blockNumber}`);
    });

  // auction cancel
  cmd
    .command('cancel')
    .description('Cancel an auction')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--chain <chain>', 'chain to use (sepolia or mainnet)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client, account } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const auctionAddress = contractAddresses[chain].auction;

      console.log(`Cancelling auction on ${chain}...`);

      const txHash = await client.writeContract({
        address: auctionAddress,
        abi: auctionAbi,
        functionName: 'cancelAuction',
        args: [opts.contract as `0x${string}`, BigInt(opts.tokenId)],
        account,
        chain: undefined,
      });

      console.log(`Transaction sent: ${txHash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`Auction cancelled! Block: ${receipt.blockNumber}`);
    });

  // auction status
  cmd
    .command('status')
    .description('Get auction details (read-only)')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--chain <chain>', 'chain to use (sepolia or mainnet)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const publicClient = getPublicClient(chain);
      const auctionAddress = contractAddresses[chain].auction;

      const result = await publicClient.readContract({
        address: auctionAddress,
        abi: auctionAbi,
        functionName: 'getAuctionDetails',
        args: [opts.contract as `0x${string}`, BigInt(opts.tokenId)],
      });

      const [seller, startingPrice, currentBid, currentBidder, endTime, currency, settled] =
        result;
      const isEth = currency === ETH_ADDRESS;
      const endDate = new Date(Number(endTime) * 1000);

      console.log('\nAuction Details:');
      console.log(`  Seller:         ${seller}`);
      console.log(`  Starting price: ${formatEther(startingPrice)} ${isEth ? 'ETH' : currency}`);
      console.log(`  Current bid:    ${formatEther(currentBid)} ${isEth ? 'ETH' : currency}`);
      console.log(`  Current bidder: ${currentBidder}`);
      console.log(`  End time:       ${endDate.toISOString()} (${endTime})`);
      console.log(`  Currency:       ${isEth ? 'ETH' : currency}`);
      console.log(`  Settled:        ${settled}`);
    });

  return cmd;
}
