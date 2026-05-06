import { Command } from 'commander';
import { formatEther } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { printError } from '../errors.js';
import { createRareClient } from '../sdk/client.js';
import { resolveCurrency } from '../contracts/addresses.js';
import { parseAddress } from '../sdk/validation.js';
import { output, log } from '../output.js';

const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

type AuctionCreateOptions = {
  contract: string;
  tokenId: string;
  startingPrice: string;
  duration: string;
  currency?: string;
  chain?: string;
};

type AuctionBidOptions = {
  contract: string;
  tokenId: string;
  amount: string;
  currency?: string;
  chain?: string;
};

type AuctionTokenOptions = {
  contract: string;
  tokenId: string;
  chain?: string;
};

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
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: AuctionCreateOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const contract = parseAddress(opts.contract, '--contract');

      log(`Creating auction on ${chain}...`);
      log(`  Auction contract: ${rare.contracts.auction}`);
      log(`  NFT contract: ${contract}`);
      log(`  Token ID: ${opts.tokenId}`);
      log(`  Starting price: ${opts.startingPrice} ETH`);
      log(`  Duration: ${opts.duration} seconds`);
      log(`  Currency: ${currency === ETH_ADDRESS ? 'ETH' : currency}`);

      try {
        const result = await rare.auction.create({
          contract,
          tokenId: opts.tokenId,
          startingPrice: opts.startingPrice,
          duration: opts.duration,
          currency,
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
            console.log(`Auction created! Block: ${result.receipt.blockNumber}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  // auction bid
  cmd
    .command('bid')
    .description('Place a bid on an auction')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--amount <amount>', 'bid amount in ETH (or token units)')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: AuctionBidOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;
      const contract = parseAddress(opts.contract, '--contract');

      log(`Placing bid on ${chain}...`);
      log(`  Auction contract: ${rare.contracts.auction}`);
      log(`  NFT contract: ${contract}`);
      log(`  Token ID: ${opts.tokenId}`);
      log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);

      try {
        const result = await rare.auction.bid({
          contract,
          tokenId: opts.tokenId,
          amount: opts.amount,
          currency,
        });

        output(
          { txHash: result.txHash, blockNumber: result.receipt.blockNumber.toString() },
          () => {
            console.log(`\nTransaction sent: ${result.txHash}`);
            console.log(`Bid placed! Block: ${result.receipt.blockNumber}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  // auction settle
  cmd
    .command('settle')
    .description('Settle a completed auction')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: AuctionTokenOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const contract = parseAddress(opts.contract, '--contract');

      log(`Settling auction on ${chain}...`);

      try {
        const result = await rare.auction.settle({
          contract,
          tokenId: opts.tokenId,
        });

        output(
          { txHash: result.txHash, blockNumber: result.receipt.blockNumber.toString() },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Auction settled! Block: ${result.receipt.blockNumber}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  // auction cancel
  cmd
    .command('cancel')
    .description('Cancel an auction')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: AuctionTokenOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const contract = parseAddress(opts.contract, '--contract');

      log(`Cancelling auction on ${chain}...`);

      try {
        const result = await rare.auction.cancel({
          contract,
          tokenId: opts.tokenId,
        });

        output(
          { txHash: result.txHash, blockNumber: result.receipt.blockNumber.toString() },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Auction cancelled! Block: ${result.receipt.blockNumber}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  // auction status
  cmd
    .command('status')
    .description('Get auction details (read-only)')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: AuctionTokenOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient });
      const contract = parseAddress(opts.contract, '--contract');

      const result = await rare.auction.getStatus({
        contract,
        tokenId: opts.tokenId,
      });

      const endDate = result.endTime ? new Date(Number(result.endTime) * 1000) : null;

      output(result, () => {
        console.log('\nAuction Details:');
        console.log(`  Seller:         ${result.seller}`);
        console.log(`  Minimum bid:    ${formatEther(result.minimumBid)} ${result.isEth ? 'ETH' : result.currency}`);
        console.log(`  Currency:       ${result.isEth ? 'ETH' : result.currency}`);
        console.log(`  Duration:       ${result.lengthOfAuction}s`);
        console.log(`  Status:         ${result.status}`);
        if (result.started) {
          console.log(`  Started at:     ${new Date(Number(result.startingTime) * 1000).toISOString()}`);
          if (endDate) {
            console.log(`  Ends at:        ${endDate.toISOString()}`);
          }
        }
        console.log(`  Creation block: ${result.creationBlock}`);
        console.log(`  Auction type:   ${result.auctionType}`);
      });
    });

  return cmd;
}
