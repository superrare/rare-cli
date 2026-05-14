import { Command } from 'commander';
import { formatUnits } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { printError } from '../errors.js';
import { createRareClient } from '../sdk/client.js';
import { ETH_ADDRESS, resolveCurrency } from '../contracts/addresses.js';
import { parseAddress } from '../sdk/validation.js';
import { output, log } from '../output.js';
import { createAuctionListCommand } from './account-market-list.js';
import { resolveCurrencyDecimals } from '../sdk/helpers.js';
import { parseAuctionTypeOption } from './auction-core.js';
import { collectSplit, finalizeSplits, formatSplitLines, type SplitAccumulator } from './splits-core.js';

type AuctionCreateOptions = {
  contract: string;
  tokenId: string;
  startingPrice: string;
  duration: string;
  currency?: string;
  type?: string;
  startTime?: string;
  split?: SplitAccumulator;
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
  cmd.description('Auction subcommands (list, create, bid, settle, cancel, status)');
  cmd.addCommand(createAuctionListCommand());

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
    .option(
      '--split <addr=ratio>',
      'seller payout split recipient (repeatable). Format: 0xADDR=RATIO. Ratios must sum to 100. If omitted, 100% goes to the connected wallet.',
      collectSplit,
    )
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: AuctionCreateOptions): Promise<void> => {
      const auctionType = parseAuctionTypeOption(opts.type, opts.startTime);
      const splits = finalizeSplits(opts.split);
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;
      const contract = parseAddress(opts.contract, '--contract');

      log(`Creating auction on ${chain}...`);
      log(`  Auction contract: ${rare.contracts.auction}`);
      log(`  NFT contract: ${contract}`);
      log(`  Token ID: ${opts.tokenId}`);
      log(`  Type: ${auctionType}`);
      log(`  Starting price: ${opts.startingPrice} ${isEth ? 'ETH' : currency}`);
      log(`  Duration: ${opts.duration} seconds`);
      if (opts.startTime !== undefined) {
        log(`  Start time: ${opts.startTime}`);
      }
      log(`  Currency: ${isEth ? 'ETH' : currency}`);
      if (splits) {
        log(`  Splits:`);
        formatSplitLines(splits).forEach((line) => {
          log(line);
        });
      }

      try {
        const result = await rare.auction.create({
          contract,
          tokenId: opts.tokenId,
          startingPrice: opts.startingPrice,
          duration: opts.duration,
          currency,
          auctionType,
          startTime: opts.startTime,
          splitAddresses: splits?.addresses,
          splitRatios: splits?.ratios,
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
      const currencyDecimals = await resolveCurrencyDecimals(publicClient, chain, result.currency);
      const currentBidDecimals = await resolveCurrencyDecimals(publicClient, chain, result.currentBidCurrency);
      const minimumBid = formatUnits(result.minimumBid, currencyDecimals);
      const currentBid = formatUnits(result.currentBid, currentBidDecimals);
      const minimumNextBid = formatUnits(result.minimumNextBid, currencyDecimals);

      output(result, () => {
        console.log('\nAuction Details:');
        console.log(`  State:          ${result.state}`);
        console.log(`  Seller:         ${result.seller}`);
        console.log(`  Type:           ${result.auctionTypeName}`);
        console.log(`  Reserve/min bid: ${minimumBid} ${result.isEth ? 'ETH' : result.currency}`);
        console.log(`  Current bid:    ${currentBid} ${result.currentBidCurrency === ETH_ADDRESS ? 'ETH' : result.currentBidCurrency}`);
        console.log(`  Current bidder: ${result.currentBidder ?? 'none'}`);
        console.log(`  Next minimum:   ${minimumNextBid} ${result.isEth ? 'ETH' : result.currency}`);
        console.log(`  Currency:       ${result.isEth ? 'ETH' : result.currency}`);
        console.log(`  Duration:       ${result.lengthOfAuction}s`);
        console.log(`  Status:         ${result.status}`);
        console.log(`  Settleable:     ${result.settlementEligible ? 'yes' : 'no'}`);
        if (result.started) {
          console.log(`  Started at:     ${new Date(Number(result.startingTime) * 1000).toISOString()}`);
          if (endDate) {
            console.log(`  Ends at:        ${endDate.toISOString()}`);
          }
        } else if (result.startingTime > 0n) {
          console.log(`  Starts at:      ${new Date(Number(result.startingTime) * 1000).toISOString()}`);
        }
        console.log(`  Creation block: ${result.creationBlock}`);
        console.log(`  Auction type:   ${result.auctionType}`);
      });
    });

  return cmd;
}
