import { Command } from 'commander';
import { formatEther, getAddress, isAddress, type Address } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { printError } from '../errors.js';
import { createRareClient } from '../sdk/client.js';
import { resolveCurrency } from '../contracts/addresses.js';
import { output, log } from '../output.js';

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
    .option('--type <type>', 'auction type: reserve or scheduled (defaults to reserve)')
    .option('--start-time <seconds>', 'unix timestamp for scheduled auctions; implies --type scheduled')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--split-recipient <address>', 'seller split recipient; repeat with --split-ratio', collect, [])
    .option('--split-ratio <percent>', 'seller split ratio percentage; repeat with --split-recipient', collect, [])
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      try {
        const chain = getActiveChain(opts.chain);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
        const auctionType = parseAuctionType(opts.type, opts.startTime);
        const splitAddresses = parseSplitRecipients(opts.splitRecipient);
        const splitRatios = parseSplitRatios(opts.splitRatio);

        log(`Creating auction on ${chain}...`);
        log(`  Auction contract: ${rare.contracts.auction}`);
        log(`  NFT contract: ${opts.contract}`);
        log(`  Token ID: ${opts.tokenId}`);
        log(`  Type: ${auctionType}`);
        log(`  Starting price: ${opts.startingPrice} ${currency === ETH_ADDRESS ? 'ETH' : currency}`);
        log(`  Duration: ${opts.duration} seconds`);
        if (opts.startTime !== undefined) {
          log(`  Start time: ${opts.startTime}`);
        }
        log(`  Currency: ${currency === ETH_ADDRESS ? 'ETH' : currency}`);
        if (splitAddresses !== undefined) {
          log(`  Split recipients: ${splitAddresses.join(', ')}`);
          log(`  Split ratios: ${splitRatios?.join(', ') ?? ''}`);
        }

        const result = await rare.auction.create({
          contract: opts.contract as `0x${string}`,
          tokenId: opts.tokenId,
          startingPrice: opts.startingPrice,
          duration: opts.duration,
          currency,
          auctionType,
          startTime: opts.startTime,
          splitAddresses,
          splitRatios,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            approvalTxHash: result.approvalTxHash ?? null,
            auctionType: result.auctionType,
            startTime: result.startTime,
          },
          () => {
            if (result.approvalTxHash) {
              console.log(`Approval tx sent: ${result.approvalTxHash}`);
            }
            console.log(`\nTransaction sent: ${result.txHash}`);
            console.log(`${result.auctionType === 'scheduled' ? 'Scheduled' : 'Reserve'} auction created! Block: ${result.receipt.blockNumber}`);
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
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;

      log(`Placing bid on ${chain}...`);
      log(`  Auction contract: ${rare.contracts.auction}`);
      log(`  NFT contract: ${opts.contract}`);
      log(`  Token ID: ${opts.tokenId}`);
      log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);

      try {
        const result = await rare.auction.bid({
          contract: opts.contract as `0x${string}`,
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
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Settling auction on ${chain}...`);

      try {
        const result = await rare.auction.settle({
          contract: opts.contract as `0x${string}`,
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
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Cancelling auction on ${chain}...`);

      try {
        const result = await rare.auction.cancel({
          contract: opts.contract as `0x${string}`,
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
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient });

      const result = await rare.auction.getStatus({
        contract: opts.contract as `0x${string}`,
        tokenId: opts.tokenId,
      });

      const endDate = result.endTime ? new Date(Number(result.endTime) * 1000) : null;

      output(result, () => {
        console.log('\nAuction Details:');
        console.log(`  State:          ${result.state}`);
        console.log(`  Seller:         ${result.seller}`);
        console.log(`  Type:           ${result.auctionTypeName}`);
        console.log(`  Reserve/min bid: ${formatEther(result.minimumBid)} ${result.isEth ? 'ETH' : result.currency}`);
        console.log(`  Current bid:    ${formatEther(result.currentBid)} ${result.currentBidCurrency === ETH_ADDRESS ? 'ETH' : result.currentBidCurrency}`);
        console.log(`  Current bidder: ${result.currentBidder ?? 'none'}`);
        console.log(`  Next minimum:   ${formatEther(result.minimumNextBid)} ${result.isEth ? 'ETH' : result.currency}`);
        console.log(`  Currency:       ${result.isEth ? 'ETH' : result.currency}`);
        console.log(`  Duration:       ${result.lengthOfAuction}s`);
        console.log(`  Status:         ${result.status}`);
        console.log(`  Settleable:     ${result.settlementEligible ? 'yes' : 'no'}`);
        if (result.started) {
          console.log(`  Started at:     ${new Date(Number(result.startingTime) * 1000).toISOString()}`);
          console.log(`  Ends at:        ${endDate!.toISOString()}`);
        } else if (result.startingTime > 0n) {
          console.log(`  Starts at:      ${new Date(Number(result.startingTime) * 1000).toISOString()}`);
        }
        console.log(`  Creation block: ${result.creationBlock}`);
        console.log(`  Auction type:   ${result.auctionType}`);
      });
    });

  return cmd;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseAuctionType(value: string | undefined, startTime: string | undefined): 'reserve' | 'scheduled' {
  if (value === undefined) {
    return startTime === undefined ? 'reserve' : 'scheduled';
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'reserve' || normalized === 'coldie' || normalized === 'coldie-auction') {
    return 'reserve';
  }
  if (normalized === 'scheduled' || normalized === 'scheduled-auction') {
    return 'scheduled';
  }
  throw new Error('--type must be "reserve" or "scheduled".');
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
