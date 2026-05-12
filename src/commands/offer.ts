import { Command } from 'commander';
import { formatEther, type Address } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient, tryGetWalletClient } from '../client.js';
import { printError } from '../errors.js';
import { createRareClient } from '../sdk/client.js';
import { ETH_ADDRESS, resolveCurrency } from '../contracts/addresses.js';
import { parseAddress } from '../sdk/validation.js';
import { output, log } from '../output.js';

type OfferCreateOptions = {
  contract: string;
  tokenId: string;
  amount: string;
  currency?: string;
  chain?: string;
};

type OfferTokenOptions = {
  contract: string;
  tokenId: string;
  currency?: string;
  chain?: string;
};

type OfferAcceptOptions = OfferTokenOptions & {
  amount: string;
  split?: SplitAccumulator;
};

type SplitAccumulator = {
  addresses: Address[];
  ratios: number[];
};

function collectSplit(value: string, prev: SplitAccumulator | undefined): SplitAccumulator {
  const acc: SplitAccumulator = prev ?? { addresses: [], ratios: [] };
  const idx = value.indexOf('=');
  if (idx <= 0 || idx === value.length - 1) {
    throw new Error(`Invalid --split format: "${value}". Expected ADDRESS=RATIO (e.g. 0xabc...=70).`);
  }
  const address = parseAddress(value.slice(0, idx).trim(), '--split');
  const ratioStr = value.slice(idx + 1).trim();
  return {
    addresses: [...acc.addresses, address],
    ratios: [...acc.ratios, Number(ratioStr)],
  };
}

function finalizeSplits(acc: SplitAccumulator | undefined):
  | { addresses: Address[]; ratios: number[] }
  | undefined {
  if (!acc || acc.addresses.length === 0) return undefined;
  return { addresses: acc.addresses, ratios: acc.ratios };
}

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
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: OfferCreateOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;
      const contract = parseAddress(opts.contract, '--contract');

      log(`Creating offer on ${chain}...`);
      log(`  Marketplace contract: ${rare.contracts.auction}`);
      log(`  NFT contract: ${contract}`);
      log(`  Token ID: ${opts.tokenId}`);
      log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);

      try {
        const result = await rare.offer.create({
          contract,
          tokenId: opts.tokenId,
          amount: opts.amount,
          currency,
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
    .action(async (opts: OfferTokenOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const contract = parseAddress(opts.contract, '--contract');

      log(`Cancelling offer on ${chain}...`);

      try {
        const result = await rare.offer.cancel({
          contract,
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
    .option(
      '--split <addr=ratio>',
      'payout split recipient (repeatable). Format: 0xADDR=RATIO. Ratios must sum to 100. If omitted, 100% goes to the connected wallet.',
      collectSplit,
    )
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: OfferAcceptOptions): Promise<void> => {
      const splits = finalizeSplits(opts.split);
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;
      const contract = parseAddress(opts.contract, '--contract');

      log(`Accepting offer on ${chain}...`);
      log(`  NFT contract: ${contract}`);
      log(`  Token ID: ${opts.tokenId}`);
      log(`  Amount: ${opts.amount} ${isEth ? 'ETH' : currency}`);
      if (splits) {
        log(`  Splits:`);
        splits.addresses.forEach((address, index) => {
          log(`    ${address} = ${splits.ratios[index]}%`);
        });
      }

      try {
        const result = await rare.offer.accept({
          contract,
          tokenId: opts.tokenId,
          amount: opts.amount,
          currency,
          splitAddresses: splits?.addresses,
          splitRatios: splits?.ratios,
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
    .action(async (opts: OfferTokenOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain);
      const publicClient = getPublicClient(chain);
      const wallet = tryGetWalletClient(chain);
      const rare = createRareClient({
        publicClient,
        walletClient: wallet?.client,
      });
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;
      const contract = parseAddress(opts.contract, '--contract');

      const result = await rare.offer.getStatus({
        contract,
        tokenId: opts.tokenId,
        currency,
      });

      output(result, () => {
        console.log('\nOffer Details:');
        if (!result.hasOffer) {
          console.log('  No active offer found.');
          if (result.tokenOwner) {
            console.log(`  Token owner:       ${result.tokenOwner}`);
          }
        } else {
          console.log(`  Buyer:             ${result.buyer}`);
          if (result.tokenOwner) {
            console.log(`  Token owner:       ${result.tokenOwner}`);
          }
          console.log(`  Amount:            ${formatEther(result.amount)} ${isEth ? 'ETH' : currency}`);
          console.log(`  Currency:          ${result.currency}`);
          console.log(`  Placed at:         ${new Date(Number(result.timestamp) * 1000).toISOString()}`);
          if (result.cancellableAfter !== null) {
            console.log(
              `  Cancellable after: ${new Date(Number(result.cancellableAfter) * 1000).toISOString()}`,
            );
          }
          console.log(`  Marketplace fee:   ${result.marketplaceFee}%`);
          if (result.canAccept !== null || result.canCancel !== null) {
            console.log('  For your wallet:');
            console.log(`    Can accept:      ${result.canAccept ? 'yes' : 'no'}`);
            console.log(`    Can cancel:      ${result.canCancel ? 'yes' : 'no'}`);
          }
        }
      });
    });

  return cmd;
}
