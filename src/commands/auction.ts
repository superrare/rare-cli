import { Command } from 'commander';
import { formatUnits } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { printError } from '../errors.js';
import { createRareClient } from '../sdk/client.js';
import { ETH_ADDRESS, resolveCurrency } from '../contracts/addresses.js';
import {
  planAuctionBidLocalInputs,
  planAuctionCreateLocalInputs,
  planAuctionTokenAction,
} from '../sdk/marketplace-core.js';
import { parseAddress } from '../sdk/validation.js';
import { output, log } from '../output.js';
import { createAuctionListCommand } from './account-market-list.js';
import { resolveCurrencyDecimals } from '../sdk/payments-shell.js';
import { parseAuctionTypeOption } from './auction-core.js';
import { runWithNftApprovalConsent, runWithPaymentApprovalConsent } from './approval-consent.js';
import { collectSplit, finalizeSplits, formatSplitLines, type SplitAccumulator } from './splits-core.js';
import { auctionBatchCommand } from './batch.js';

type AuctionCreateOptions = {
  contract: string;
  tokenId: string;
  price?: string;
  endTime?: string;
  currency?: string;
  type?: string;
  startTime?: string;
  split?: SplitAccumulator;
  chain?: string;
  chainId?: string;
  yes?: boolean;
};

type AuctionBidOptions = {
  contract: string;
  tokenId: string;
  price?: string;
  currency?: string;
  chain?: string;
  chainId?: string;
  yes?: boolean;
};

type AuctionTokenOptions = {
  contract: string;
  tokenId: string;
  chain?: string;
  chainId?: string;
};

export function auctionCommand(): Command {
  const cmd = new Command('auction');
  cmd.description('Auction subcommands (list, create, bid, settle, cancel, status)');
  cmd.addCommand(createAuctionListCommand());
  cmd.addCommand(auctionBatchCommand());

  // auction create
  cmd
    .command('create')
    .description('Configure and start an auction')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID to auction')
    .requiredOption('--price <amount>', 'starting/reserve price in ETH (or token units)')
    .requiredOption('--end-time <time>', 'auction end time as unix seconds or an ISO date')
    .option('--type <type>', 'auction type: reserve or scheduled (defaults to reserve)')
    .option('--start-time <seconds>', 'unix timestamp for scheduled auctions; implies --type scheduled')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option(
      '--split <addr=ratio>',
      'seller payout split recipient (repeatable). Format: 0xADDR=RATIO. Ratios must sum to 100. If omitted, 100% goes to the connected wallet.',
      collectSplit,
    )
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .option('--yes', 'yes to all prompts, including approval and transaction submission')
    .action(async (opts: AuctionCreateOptions): Promise<void> => {
      const price = opts.price;
      if (price === undefined) {
        throw new Error('auction create requires --price.');
      }
      if (opts.endTime === undefined) {
        throw new Error('auction create requires --end-time.');
      }
      const auctionType = parseAuctionTypeOption(opts.type, opts.startTime);
      const splits = finalizeSplits(opts.split);
      const contract = parseAddress(opts.contract, '--contract');
      const localPlan = planAuctionCreateLocalInputs({
        tokenId: opts.tokenId,
        price,
        endTime: opts.endTime,
        auctionType,
        startTime: opts.startTime,
        contract,
      }, currentUnixTimestamp());
      const chain = getActiveChain(opts.chain, opts.chainId);
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Creating auction on ${chain}...`);
      log(`  Auction contract: ${rare.contracts.auction}`);
      log(`  NFT contract: ${contract}`);
      log(`  Token ID: ${localPlan.tokenId.toString()}`);
      log(`  Type: ${auctionType}`);
      log(`  Price: ${price} ${isEth ? 'ETH' : currency}`);
      log(`  End time: ${opts.endTime}`);
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
        const auctionParams = {
          contract,
          tokenId: localPlan.tokenId,
          price,
          endTime: opts.endTime,
          currency,
          auctionType,
          startTime: opts.startTime,
          splitAddresses: splits?.addresses,
          splitRatios: splits?.ratios,
        };
        const result = await runWithNftApprovalConsent({
          commandName: 'rare auction create',
          approvalMessage: 'NFT approval is required before creating this auction.',
          runWithoutApproval: async () => rare.auction.create({
            ...auctionParams,
            autoApprove: opts.yes === true,
          }),
          runWithApproval: async () => rare.auction.create({
            ...auctionParams,
            autoApprove: true,
          }),
        });
        if (result === undefined) {
          return;
        }

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
    .requiredOption('--price <amount>', 'bid price in ETH (or token units)')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .option('--yes', 'yes to all prompts, including approval and transaction submission')
    .action(async (opts: AuctionBidOptions): Promise<void> => {
      const price = opts.price;
      if (price === undefined) {
        throw new Error('auction bid requires --price.');
      }
      const contract = parseAddress(opts.contract, '--contract');
      const localPlan = planAuctionBidLocalInputs({ tokenId: opts.tokenId, price });
      const chain = getActiveChain(opts.chain, opts.chainId);
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Placing bid on ${chain}...`);
      log(`  Auction contract: ${rare.contracts.auction}`);
      log(`  NFT contract: ${contract}`);
      log(`  Token ID: ${localPlan.tokenId.toString()}`);
      log(`  Price: ${price} ${isEth ? 'ETH' : currency}`);

      try {
        const bidParams = {
          contract,
          tokenId: localPlan.tokenId,
          price,
          currency,
        };
        const result = await runWithPaymentApprovalConsent({
          commandName: 'rare auction bid',
          approvalMessage: 'ERC20 approval is required before placing this bid.',
          runWithoutApproval: async () => rare.auction.bid({
            ...bidParams,
            autoApprove: opts.yes === true,
          }),
          runWithApproval: async () => rare.auction.bid({
            ...bidParams,
            autoApprove: true,
          }),
        });
        if (result === undefined) {
          return;
        }

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
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: AuctionTokenOptions): Promise<void> => {
      const contract = parseAddress(opts.contract, '--contract');
      const localPlan = planAuctionTokenAction({ tokenId: opts.tokenId, contract });
      const chain = getActiveChain(opts.chain, opts.chainId);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Settling auction on ${chain}...`);

      try {
        const result = await rare.auction.settle({
          contract,
          tokenId: localPlan.tokenId,
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
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: AuctionTokenOptions): Promise<void> => {
      const contract = parseAddress(opts.contract, '--contract');
      const localPlan = planAuctionTokenAction({ tokenId: opts.tokenId, contract });
      const chain = getActiveChain(opts.chain, opts.chainId);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Cancelling auction on ${chain}...`);

      try {
        const result = await rare.auction.cancel({
          contract,
          tokenId: localPlan.tokenId,
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
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: AuctionTokenOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient });
      const contract = parseAddress(opts.contract, '--contract');

      const result = await rare.auction.status({
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

function currentUnixTimestamp(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}
