import { Command } from 'commander';
import { parseEther, formatEther } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { getContractAddresses } from '../contracts/addresses.js';
import { auctionAbi } from '../contracts/abis/auction.js';
import { printContractError } from '../errors.js';

const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

const approvalAbi = [
  {
    inputs: [{ name: 'owner', type: 'address' }, { name: 'operator', type: 'address' }],
    name: 'isApprovedForAll',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }],
    name: 'setApprovalForAll',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;



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
      const { client, account } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const auctionAddress = getContractAddresses(chain).auction;
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
        abi: approvalAbi,
        functionName: 'isApprovedForAll',
        args: [account.address, auctionAddress],
      });

      if (!isApproved) {
        console.log('\nApproval required. Requesting setApprovalForAll...');
        const approveTxHash = await client.writeContract({
          address: nftAddress,
          abi: approvalAbi,
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

      const tokenId = BigInt(opts.tokenId);
      const startingPrice = parseEther(opts.startingPrice);
      const duration = BigInt(opts.duration);
      const auctionType = await publicClient.readContract({
        address: auctionAddress,
        abi: auctionAbi,
        functionName: 'COLDIE_AUCTION',
      });
      const splitAddresses = [account.address];
      const splitRatios = [100];

      console.log('\nTransaction details:');
      console.log(`  NFT: ${nftAddress}`);
      console.log(`  Token ID: ${tokenId}`);
      console.log(`  Starting price: ${opts.startingPrice} ETH (${startingPrice}wei)`);
      console.log(`  Duration: ${duration}s`);
      console.log(`  Currency: ${currency === ETH_ADDRESS ? 'ETH' : currency}`);

      let txHash: `0x${string}`;
      try {
        txHash = await client.writeContract({
          address: auctionAddress,
          abi: auctionAbi,
          functionName: 'configureAuction',
          args: [
            auctionType,
            nftAddress,
            tokenId,
            startingPrice,
            currency,
            duration,
            0n,
            splitAddresses,
            splitRatios,
          ],
          account,
          chain: undefined,
        });
      } catch (error) {
        printContractError(error);
      }

      console.log(`\nTransaction sent: ${txHash}`);
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
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client, account } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const auctionAddress = getContractAddresses(chain).auction;
      const currency = (opts.currency ?? ETH_ADDRESS) as `0x${string}`;
      const isEth = currency === ETH_ADDRESS;
      const bidAmount = parseEther(opts.amount);

      console.log(`Placing bid on ${chain}...`);
      console.log(`  Auction contract: ${auctionAddress}`);
      console.log(`  NFT contract: ${opts.contract}`);
      console.log(`  Token ID: ${opts.tokenId}`);
      console.log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);

      let txHash: `0x${string}`;
      try {
        txHash = await client.writeContract({
          address: auctionAddress,
          abi: auctionAbi,
          functionName: 'bid',
          args: [opts.contract as `0x${string}`, BigInt(opts.tokenId), currency, bidAmount],
          account,
          chain: undefined,
          value: isEth ? bidAmount : 0n,
        });
      } catch (error) {
        printContractError(error);
      }

      console.log(`\nTransaction sent: ${txHash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`Bid placed! Block: ${receipt.blockNumber}`);
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
      const { client, account } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const auctionAddress = getContractAddresses(chain).auction;

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
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client, account } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const auctionAddress = getContractAddresses(chain).auction;

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
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const publicClient = getPublicClient(chain);
      const auctionAddress = getContractAddresses(chain).auction;

      const result = await publicClient.readContract({
        address: auctionAddress,
        abi: auctionAbi,
        functionName: 'getAuctionDetails',
        args: [opts.contract as `0x${string}`, BigInt(opts.tokenId)],
      });

      const [seller, creationBlock, startingTime, lengthOfAuction, currency, minimumBid, auctionType] = result;
      const isEth = currency === ETH_ADDRESS;
      const started = Number(startingTime) > 0;
      const endTime = started ? Number(startingTime) + Number(lengthOfAuction) : null;
      const endDate = endTime ? new Date(endTime * 1000) : null;

      console.log('\nAuction Details:');
      console.log(`  Seller:         ${seller}`);
      console.log(`  Minimum bid:    ${formatEther(minimumBid)} ${isEth ? 'ETH' : currency}`);
      console.log(`  Currency:       ${isEth ? 'ETH' : currency}`);
      console.log(`  Duration:       ${lengthOfAuction}s`);
      console.log(`  Status:         ${started ? 'RUNNING' : 'PENDING'}`);
      if (started) {
        console.log(`  Started at:     ${new Date(Number(startingTime) * 1000).toISOString()}`);
        console.log(`  Ends at:        ${endDate!.toISOString()}`);
      }
      console.log(`  Creation block: ${creationBlock}`);
      console.log(`  Auction type:   ${auctionType}`);
    });

  return cmd;
}
