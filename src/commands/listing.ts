import { Command } from 'commander';
import { formatUnits, isAddressEqual, isHex } from 'viem';
import { getActiveChain } from '../config.js';
import { getConfiguredAccountAddress, getPublicClient, getWalletClient, tryGetWalletClient } from '../client.js';
import {
  createConnectBuyIntent,
  getCardListingGateError,
  openBrowser,
  waitForConnectSettlement,
} from '../checkout.js';
import { createApiClient } from '@rareprotocol/rare-sdk/data-access';
import { createRareClient } from '@rareprotocol/rare-sdk/client';
import { ETH_ADDRESS, PUBLIC_LISTING_TARGET, resolveCurrency } from '@rareprotocol/rare-sdk/contracts';
import { parseAddress, toNonNegativeInteger, toNonNegativeWei, toPositiveWei } from '../input-core.js';
import { output, log } from '../output.js';
import { createListingListCommand } from './account-market-list.js';
import { runWithNftApprovalConsent, runWithPaymentApprovalConsent } from './approval-consent.js';
import { collectSplit, finalizeSplits, formatSplitLines, type SplitAccumulator } from './splits-core.js';
import { listingBatchCommand } from './batch.js';
import { listingErc1155Command } from './erc1155.js';
import { releaseCommand } from './release.js';
import { parseBatchAmount } from './batch-amounts.js';

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

type ListingBuyCardOptions = {
  contract?: string;
  tokenId?: string;
  apiUrl?: string;
  email?: string;
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
      toNonNegativeWei(price, 'price');
      const target = opts.target ? parseAddress(opts.target, '--target') : PUBLIC_LISTING_TARGET;
      const splits = finalizeSplits(opts.split);
      const tokenId = toNonNegativeInteger(opts.tokenId, 'tokenId');
      const chain = getActiveChain(opts.chain, opts.chainId);
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const priceAmount = await parseBatchAmount(publicClient, chain, currency, price);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Creating listing on ${chain}...`);
      log(`  Marketplace contract: ${rare.contracts.auction}`);
      log(`  NFT contract: ${contract}`);
      log(`  Token ID: ${tokenId.toString()}`);
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
        tokenId,
        price: priceAmount,
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
      const tokenId = toNonNegativeInteger(opts.tokenId, 'tokenId');
      const chain = getActiveChain(opts.chain, opts.chainId);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Cancelling listing on ${chain}...`);

      const result = await rare.listing.cancel({
        contract,
        tokenId,
        target,
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
      toPositiveWei(price, 'price');
      const tokenId = toNonNegativeInteger(opts.tokenId, 'tokenId');
      const chain = getActiveChain(opts.chain, opts.chainId);
      const currency = opts.currency ? resolveCurrency(opts.currency, chain) : ETH_ADDRESS;
      const isEth = currency === ETH_ADDRESS;
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const priceAmount = await parseBatchAmount(publicClient, chain, currency, price);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Buying token on ${chain}...`);
      log(`  Marketplace contract: ${rare.contracts.auction}`);
      log(`  NFT contract: ${contract}`);
      log(`  Token ID: ${tokenId.toString()}`);
      log(`  Price: ${price} ${isEth ? 'ETH' : currency}`);

      const buyParams = {
        contract,
        tokenId,
        price: priceAmount,
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
      'Buy a USDC-listed token with a credit/debit card (Coinflow). Opens the hosted SuperRare checkout in a browser.',
    )
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID to buy')
    .option('--api-url <url>', 'SuperRare API base URL (defaults to the production API)')
    .option('--email <email>', 'email for the card receipt (otherwise collected in the checkout)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(async (opts: ListingBuyCardOptions): Promise<void> => {
      requireTokenScopeOptions(opts, 'buy-card');
      const chain = getActiveChain(opts.chain, opts.chainId);
      const publicClient = getPublicClient(chain);
      // No signature needed: the card settlement happens server-side. When an
      // account is configured (a receiving address is enough — no signer is
      // used for card payment) we pre-select card payment delivering to it,
      // so the hosted checkout opens straight into the card step; otherwise
      // the buyer connects the receiving wallet in the browser.
      const rare = createRareClient({ publicClient });
      const contract = parseAddress(opts.contract, '--contract');
      const recipient = getConfiguredAccountAddress(chain);

      // Card checkout only works for public USDC listings within the Coinflow
      // limits; read the listing on-chain first so the user gets a fast,
      // specific error instead of a hosted page without a card option.
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
      const gateError = getCardListingGateError(status.amount);
      if (gateError !== null) {
        throw new Error(gateError);
      }

      log(`Preparing card checkout on ${chain}...`);
      log(`  NFT contract: ${contract}`);
      log(`  Token ID: ${opts.tokenId}`);
      log(`  Price: ${formatUnits(status.amount, 6)} USDC`);
      if (recipient !== undefined) {
        log(`  Delivering to: ${recipient} (configured wallet)`);
      }

      const api = createApiClient(opts.apiUrl);
      const checkout = await createConnectBuyIntent({
        client: api,
        chainId: rare.chainId,
        contract,
        tokenId: opts.tokenId,
        priceUsdcBaseUnits: status.amount,
        recipient,
        email: opts.email,
      });

      openBrowser(checkout.url);
      log('\nOpening your browser to complete the card payment...');
      log(`  ${checkout.url}`);
      log('\nIf it did not open, paste the URL above into your browser.');
      if (recipient === undefined) {
        log('Connect the wallet that should receive the NFT, then pay with card.');
      }
      log('\nWaiting for the payment (Ctrl+C to stop waiting)...');

      const settlement = await waitForConnectSettlement({
        client: api,
        intentId: checkout.intentId,
        expiresAt: checkout.expiresAt,
        onStatusChange: (intentStatus) => {
          log(`  Checkout status: ${intentStatus}`);
        },
      });

      if (settlement.transactionHash !== undefined && isHex(settlement.transactionHash)) {
        log(`  Settlement transaction: ${settlement.transactionHash}`);
        log('  Waiting for on-chain confirmation...');
        await publicClient.waitForTransactionReceipt({ hash: settlement.transactionHash });
      }

      output(
        {
          intentId: checkout.intentId,
          checkoutUrl: checkout.url,
          transactionHash: settlement.transactionHash ?? null,
        },
        () => {
          console.log('\nPayment sent. The NFT is delivered to the wallet you connected in the browser.');
          if (settlement.transactionHash !== undefined) {
            console.log(`  Settlement transaction: ${settlement.transactionHash}`);
          }
        },
      );
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
        (await rare.currency.resolveDecimals(result.currencyAddress)).decimals,
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
