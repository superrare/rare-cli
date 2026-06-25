import { Command } from 'commander';
import { formatUnits, isAddressEqual } from 'viem';
import { getActiveChain, getWebBaseUrl } from '../config.js';
import { getPublicClient, getWalletClient, tryGetWalletClient } from '../client.js';
import { createRareClient } from '../sdk/client.js';
import { loginWithWallet, openBrowser, prepareCardCheckout } from '../checkout.js';
import { ETH_ADDRESS, PUBLIC_LISTING_TARGET, resolveCurrency } from '../contracts/addresses.js';
import {
  planListingBuyLocalInputs,
  planListingCancel,
  planListingCreateLocalInputs,
} from '../sdk/marketplace-core.js';
import { parseAddress } from '../sdk/validation.js';
import { resolveCurrencyDecimals } from '../sdk/payments-shell.js';
import { output, log } from '../output.js';
import { createListingListCommand } from './account-market-list.js';
import { runWithNftApprovalConsent, runWithPaymentApprovalConsent } from './approval-consent.js';
import { collectSplit, finalizeSplits, formatSplitLines, type SplitAccumulator } from './splits-core.js';
import { listingBatchCommand } from './batch.js';
import { listingErc1155Command } from './erc1155.js';
import { releaseCommand } from './release.js';

type ListingCreateOptions = {
  contract?: string;
  tokenId?: string;
  price?: string;
  currency?: string;
  target?: string;
  split?: SplitAccumulator;
  yes?: boolean;
  chain?: string;
  chainId?: string;
};

type ListingCancelOptions = {
  contract?: string;
  tokenId?: string;
  target?: string;
  chain?: string;
  chainId?: string;
};

type ListingBuyOptions = {
  contract?: string;
  tokenId: string;
  price?: string;
  currency?: string;
  yes?: boolean;
  chain?: string;
  chainId?: string;
};

type ListingStatusOptions = {
  contract?: string;
  tokenId?: string;
  target?: string;
  chain?: string;
  chainId?: string;
};

type ListingBuyCardOptions = {
  contract?: string;
  tokenId?: string;
  email?: string;
  webUrl?: string;
  chain?: string;
  chainId?: string;
};

export function listingCommand(): Command {
  const cmd = new Command('listing');
  cmd.description('Listing subcommands (list, create, cancel, buy, buy-card, status, batch, release)');
  cmd.addCommand(createListingListCommand());
  cmd.addCommand(listingErc1155Command());
  cmd.addCommand(listingBatchCommand());
  cmd.addCommand(releaseCommand());

  cmd
    .command('create')
    .description('Create a token-specific listing')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--price <amount>', 'listing price in ETH or token units')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--target <address>', 'target buyer address (defaults to public listing)')
    .option(
      '--split <addr=ratio>',
      'payout split recipient (repeatable). Format: 0xADDR=RATIO. Ratios must sum to 100. If omitted, 100% goes to the connected wallet.',
      collectSplit,
    )
    .option('--yes', 'yes to all prompts, including approval and transaction submission')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: ListingCreateOptions): Promise<void> => {
      requireTokenScopeOptions(opts, 'create');
      const price = opts.price;
      if (!hasOption(price)) {
        throw new Error('rare listing create requires --price.');
      }
      const contract = parseAddress(opts.contract, '--contract');
      const target = opts.target ? parseAddress(opts.target, '--target') : PUBLIC_LISTING_TARGET;
      const splits = finalizeSplits(opts.split);
      const localPlan = planListingCreateLocalInputs({ tokenId: opts.tokenId, price });
      const chain = getActiveChain(opts.chain, opts.chainId);
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Creating listing on ${chain}...`);
      log(`  Marketplace contract: ${rare.contracts.auction}`);
      log(`  NFT contract: ${contract}`);
      log(`  Token ID: ${localPlan.tokenId.toString()}`);
      log(`  Price: ${price} ${isEth ? 'ETH' : currency}`);
      log(`  Target: ${isAddressEqual(target, PUBLIC_LISTING_TARGET) ? 'public' : target}`);
      if (splits) {
        log('  Splits:');
        formatSplitLines(splits).forEach((line) => {
          log(line);
        });
      }

      const listingParams = {
        contract,
        tokenId: localPlan.tokenId,
        price,
        currency,
        target,
        splitAddresses: splits?.addresses,
        splitRatios: splits?.ratios,
      };
      const result = await runWithNftApprovalConsent({
        commandName: 'rare listing create',
        approvalMessage: 'NFT approval is required before creating this listing.',
        runWithoutApproval: async () => rare.listing.create({
          ...listingParams,
          autoApprove: opts.yes === true,
        }),
        runWithApproval: async () => rare.listing.create({
          ...listingParams,
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
          console.log(`Listing created! Block: ${result.receipt.blockNumber}`);
        },
      );

    });

  cmd
    .command('cancel')
    .description('Cancel a token-specific listing')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--target <address>', 'target buyer address (defaults to public listing)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: ListingCancelOptions): Promise<void> => {
      requireTokenScopeOptions(opts, 'cancel');
      const contract = parseAddress(opts.contract, '--contract');
      const target = opts.target ? parseAddress(opts.target, '--target') : PUBLIC_LISTING_TARGET;
      const localPlan = planListingCancel({ contract, tokenId: opts.tokenId, target });
      const chain = getActiveChain(opts.chain, opts.chainId);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Cancelling listing on ${chain}...`);

      const result = await rare.listing.cancel({
        contract,
        tokenId: localPlan.tokenId,
        target: localPlan.target,
      });

      output(
        { txHash: result.txHash, blockNumber: result.receipt.blockNumber.toString() },
        () => {
          console.log(`Transaction sent: ${result.txHash}`);
          console.log(`Listing cancelled! Block: ${result.receipt.blockNumber}`);
        },
      );

    });

  cmd
    .command('buy')
    .description('Buy a token-specific listing')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID to buy')
    .requiredOption('--price <amount>', 'purchase price in ETH or token units')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address (defaults to eth)')
    .option('--yes', 'yes to all prompts and required approvals')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: ListingBuyOptions): Promise<void> => {
      if (!hasOption(opts.contract)) {
        throw new Error('rare listing buy requires --contract.');
      }
      const price = opts.price;
      if (!hasOption(price)) {
        throw new Error('rare listing buy requires --price.');
      }
      const contract = parseAddress(opts.contract, '--contract');
      const localPlan = planListingBuyLocalInputs({ tokenId: opts.tokenId, price });
      const chain = getActiveChain(opts.chain, opts.chainId);
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Buying token on ${chain}...`);
      log(`  Marketplace contract: ${rare.contracts.auction}`);
      log(`  NFT contract: ${contract}`);
      log(`  Token ID: ${localPlan.tokenId.toString()}`);
      log(`  Price: ${price} ${isEth ? 'ETH' : currency}`);

      const buyParams = {
        contract,
        tokenId: localPlan.tokenId,
        price,
        currency,
      };

      const result = await runWithPaymentApprovalConsent({
        commandName: 'rare listing buy',
        approvalMessage: 'ERC20 approval is required before buying this listing.',
        runWithoutApproval: async () => rare.listing.buy({
          ...buyParams,
          autoApprove: opts.yes === true,
        }),
        runWithApproval: async () => rare.listing.buy({
          ...buyParams,
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
          console.log(`Token purchased! Block: ${result.receipt.blockNumber}`);
        },
      );

    });

  cmd
    .command('buy-card')
    .description(
      'Buy a USDC-listed token with a credit/debit card (Coinflow). Opens a browser to complete payment.',
    )
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID to buy')
    .requiredOption('--email <email>', 'email for the payment receipt and chargeback protection')
    .option('--web-url <url>', 'SuperRare web app base URL (defaults per chain)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts: ListingBuyCardOptions): Promise<void> => {
      requireTokenScopeOptions(opts, 'buy-card');
      if (!hasOption(opts.email)) {
        throw new Error('rare listing buy-card requires --email.');
      }
      const chain = getActiveChain(opts.chain, opts.chainId);
      const webBaseUrl = getWebBaseUrl(chain, opts.webUrl);
      const contract = parseAddress(opts.contract, '--contract');
      const { client, account } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      // Card checkout only works for public USDC listings; read it on-chain first.
      const status = await rare.listing.status({
        contract,
        tokenId: opts.tokenId,
        target: PUBLIC_LISTING_TARGET,
      });
      if (!status.hasListing) {
        throw new Error('No active public listing found for this token.');
      }
      const usdcAddress = resolveCurrency('usdc', chain);
      if (!isAddressEqual(status.currencyAddress, usdcAddress)) {
        throw new Error(
          `Card checkout requires a USDC listing; this one is priced in ${status.currencyAddress}.`,
        );
      }

      const universalTokenId = `${rare.chainId}-${contract.toLowerCase()}-${opts.tokenId}`;

      log(`Preparing card checkout on ${chain}...`);
      log(`  NFT contract: ${contract}`);
      log(`  Token ID: ${opts.tokenId}`);
      log(`  Buyer: ${account.address}`);
      log(`  Price: ${status.amount.toString()} USDC base units`);

      // Authenticate with a wallet signature (no on-chain tx), prepare the
      // Coinflow checkout server-side, then hand off to the browser.
      const cookieHeader = await loginWithWallet({
        webBaseUrl,
        walletClient: client,
        account,
      });
      const { checkoutUrl } = await prepareCardCheckout({
        webBaseUrl,
        cookieHeader,
        body: {
          tokenContractAddress: contract,
          tokenId: opts.tokenId,
          weiPrice: status.amount.toString(),
          marketplaceAddress: rare.contracts.auction,
          currencyAddress: status.currencyAddress,
          buyerAddress: account.address,
          email: opts.email,
          universalTokenId,
        },
      });

      openBrowser(checkoutUrl);
      output({ checkoutUrl, buyer: account.address }, () => {
        console.log('\nOpening your browser to complete the card payment...');
        console.log(`  ${checkoutUrl}`);
        console.log('\nIf it did not open, paste the URL above into your browser.');
        console.log(
          'The NFT is delivered to your wallet after payment — you sign nothing on-chain.',
        );
      });
    });

  cmd
    .command('status')
    .description('Get token-specific listing details')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--target <address>', 'target buyer address (defaults to public listing)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: ListingStatusOptions): Promise<void> => {
      requireTokenScopeOptions(opts, 'status');
      const chain = getActiveChain(opts.chain, opts.chainId);
      const publicClient = getPublicClient(chain);
      const wallet = tryGetWalletClient(chain);
      const rare = createRareClient({
        publicClient,
        walletClient: wallet?.client,
      });
      const contract = parseAddress(opts.contract, '--contract');
      const target = opts.target ? parseAddress(opts.target, '--target') : PUBLIC_LISTING_TARGET;

      const result = await rare.listing.status({
        contract,
        tokenId: opts.tokenId,
        target,
      });
      const amount = formatUnits(
        result.amount,
        await resolveCurrencyDecimals(publicClient, chain, result.currencyAddress),
      );

      output(result, () => {
        console.log('\nListing Details:');
        if (!result.hasListing) {
          console.log('  No active listing found.');
        } else {
          console.log(`  Seller:   ${result.seller}`);
          console.log(`  Amount:   ${amount} ${result.isEth ? 'ETH' : result.currencyAddress}`);
          console.log(`  Currency: ${result.isEth ? 'ETH' : result.currencyAddress}`);
          console.log(`  Target:   ${isAddressEqual(result.target, PUBLIC_LISTING_TARGET) ? 'public' : result.target}`);
          if (result.splitAddresses.length > 0) {
            console.log('  Splits:');
            formatSplitLines({ addresses: result.splitAddresses, ratios: result.splitRatios }).forEach((line) => {
              console.log(line);
            });
          }
          if (result.canBuy !== null) {
            console.log(`  Can buy:  ${result.canBuy ? 'yes' : 'no'}`);
          }
        }
      });

    });

  return cmd;
}

function hasOption(value: string | undefined | null): value is string {
  return value !== undefined && value !== null && value !== '';
}

function requireTokenScopeOptions<T extends { contract?: string; tokenId?: string }>(
  opts: T,
  command: string,
): asserts opts is T & { contract: string; tokenId: string } {
  if (!hasOption(opts.contract) || !hasOption(opts.tokenId)) {
    throw new Error(`rare listing ${command} requires --contract and --token-id.`);
  }
}
