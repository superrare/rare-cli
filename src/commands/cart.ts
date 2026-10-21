import { readFile, writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import { formatUnits, type Address } from 'viem';
import { createRareClient } from '@rareprotocol/rare-sdk/client';
import type { CartCheckoutPreparation, CartListingPreparation } from '@rareprotocol/rare-sdk';
import { hashCartListingRoot } from '@rareprotocol/rare-sdk/utils';
import { cartFulfillmentKinds } from '@rareprotocol/rare-sdk';
import { getActiveChain } from '../config.js';
import {
  getConfiguredAccountAddress,
  getPublicClient,
  getWalletClient,
} from '../client.js';
import { log, output } from '../output.js';
import { accountClient, accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { runWithNftApprovalConsent, runWithPaymentApprovalConsent } from './approval-consent.js';
import { addChainOptions, type ChainOptions } from './options.js';
import {
  parseCartAddress,
  parseCartAmount,
  parseCartBytes32,
  parseCartCliCurrency,
  parseCartListingFile,
  parseCartListingSelections,
  parseCartCheckoutFile,
  unwrapCartCliResult,
} from './cart-core.js';

type CartListingCreateOptions = ChainOptions & AccountCommandOptions & {
  input: string;
  output?: string;
  preview?: boolean;
  yes?: boolean;
};

type CartDigestOptions = ChainOptions & {
  listingDigest?: string;
  rootDigest?: string;
  yes?: boolean;
};

type CartCheckoutOptions = ChainOptions & AccountCommandOptions & {
  listing: string[];
  input?: string;
  outputCurrency?: string;
  inputAmount?: string;
  outputAmount?: string;
  paymentCurrency?: string;
  recipient?: string;
  preview?: boolean;
  prepareOnly?: boolean;
  yes?: boolean;
};

export function cartCommand(): Command {
  const command = new Command('cart');
  command.description('Create Cart listings and purchase fixed-price Cart checkouts');
  command.addCommand(cartListingCommand());
  command.addCommand(cartCheckoutCommand());
  command.addCommand(cartCheckoutCommand(true));
  return command;
}

function cartListingCommand(): Command {
  const command = new Command('listing');
  command.description('Prepare, publish, and invalidate Cart listings');
  command.addCommand(cartListingCreateCommand());
  command.addCommand(cartListingCancelCommand());
  command.addCommand(cartListingCancelRootCommand());
  command.addCommand(cartListingInvalidateNonceCommand());
  return command;
}

function cartListingCreateCommand(): Command {
  const command = accountCommand('create');
  command.description('Prepare and publish a seller-signed Cart Listing Root');
  addChainOptions(command)
    .requiredOption('--input <path>', 'JSON file containing the listing intent')
    .option('--output <path>', 'write the prepared or signed Listing Root artifact to a JSON file')
    .option('--preview', 'show the prepared Listing Root and required approvals without signing or publishing')
    .option('--yes', 'approve NFT contracts if needed and skip transaction confirmation')
    .action(async (opts: CartListingCreateOptions): Promise<void> => {
      const file = unwrapCartCliResult(parseCartListingFile(await readFile(opts.input, 'utf8')));
      const chain = getActiveChain(opts.chain, opts.chainId);
      const publicClient = getPublicClient(chain);
      const wallet = opts.preview === true ? undefined : getWalletClient(chain);
      const seller = wallet?.account.address ?? getConfiguredAccountAddress(chain);
      if (seller === undefined) {
        throw new Error(`rare cart listing create requires a configured seller account for "${chain}".`);
      }
      const rare = createRareClient({
        publicClient,
        apiBaseUrl: opts.apiUrl,
        accountClient: accountClient(storageOptions(opts)),
        account: seller,
        ...(wallet === undefined ? {} : { walletClient: wallet.client }),
      });
      const listings = await Promise.all(file.listings.map(async (listing, index) => {
        const currency = await rare.currency.resolveDecimals(listing.settlementCurrency);
        const unitPrice = unwrapCartCliResult(parseCartAmount(
          listing.unitPrice,
          currency.decimals,
          `listings[${index}].unitPrice`,
        ));
        return {
          sku: listing.sku,
          settlementCurrency: currency.address,
          unitPrice,
          quantity: listing.quantity,
          ...(listing.fulfillmentKind === undefined ? {} : { fulfillmentKind: listing.fulfillmentKind }),
          ...(listing.paymentRecipient === undefined ? {} : { paymentRecipient: listing.paymentRecipient }),
        };
      }));
      const preparation = await rare.cart.listing.prepare({
        seller,
        listings,
        deadline: file.deadline,
      });

      if (opts.preview === true) {
        const rootDigest = getListingRootDigest(preparation);
        await writeCartArtifact(opts.output, preparation.artifact);
        output(
          { preview: true, rootDigest, preparation, outputPath: opts.output ?? null },
          () => {
            printListingPreparation(preparation, opts.output);
          },
        );
        return;
      }

      log(`Publishing ${preparation.artifact.entries.length} Cart listing(s) on ${chain}...`);
      const publish = async (): ReturnType<typeof rare.cart.listing.publish> =>
        rare.cart.listing.publish({ preparation, autoApprove: opts.yes === true });
      const result = await runWithNftApprovalConsent({
        commandName: 'rare cart listing create',
        approvalMessage: 'Cart requires approval for one or more NFT contracts before publishing these listings.',
        runWithoutApproval: publish,
        runWithApproval: async (): ReturnType<typeof rare.cart.listing.publish> =>
          rare.cart.listing.publish({ preparation, autoApprove: true }),
      });
      if (result === undefined) return;
      const rootDigest = getListingRootDigest(result.preparation);
      await writeCartArtifact(opts.output, result.signedArtifact);
      output(
        {
          preview: false,
          rootDigest,
          publishedRoot: result.publishedRoot,
          listingDigests: result.signedArtifact.entries.map((entry) => entry.listingDigest),
          approvalTxHashes: result.approvalTxHashes,
          signedArtifact: result.signedArtifact,
          outputPath: opts.output ?? null,
        },
        () => {
          console.log(`Published Cart Listing Root: ${rootDigest}`);
          console.log(`Listings: ${result.signedArtifact.entries.length}`);
          for (const txHash of result.approvalTxHashes) console.log(`Approval tx sent: ${txHash}`);
          if (opts.output !== undefined) console.log(`Wrote signed artifact: ${opts.output}`);
        },
      );
    });
  return command;
}

function cartListingCancelCommand(): Command {
  const command = new Command('cancel');
  command.description('Cancel one Cart listing on-chain');
  addChainOptions(command)
    .requiredOption('--listing-digest <bytes32>', 'canonical Cart listing digest')
    .option('--yes', 'skip transaction confirmation')
    .action(async (opts: CartDigestOptions): Promise<void> => {
      const listingDigest = unwrapCartCliResult(parseCartBytes32(opts.listingDigest, '--listing-digest'));
      await runSimpleCartWrite(opts, 'Cancelling Cart listing...', async (rare) => rare.cart.listing.cancel(listingDigest));
    });
  return command;
}

function cartListingCancelRootCommand(): Command {
  const command = new Command('cancel-root');
  command.description('Cancel one Cart Listing Root on-chain');
  addChainOptions(command)
    .requiredOption('--root-digest <bytes32>', 'Cart Listing Root digest')
    .option('--yes', 'skip transaction confirmation')
    .action(async (opts: CartDigestOptions): Promise<void> => {
      const rootDigest = unwrapCartCliResult(parseCartBytes32(opts.rootDigest, '--root-digest'));
      await runSimpleCartWrite(opts, 'Cancelling Cart Listing Root...', async (rare) => rare.cart.listing.cancelRoot(rootDigest));
    });
  return command;
}

function cartListingInvalidateNonceCommand(): Command {
  const command = new Command('invalidate-nonce');
  command.description('Invalidate every Cart Listing Root using the current seller nonce');
  addChainOptions(command)
    .option('--yes', 'skip transaction confirmation')
    .action(async (opts: CartDigestOptions): Promise<void> => {
      await runSimpleCartWrite(opts, 'Invalidating the current Cart listing nonce...', async (rare) => rare.cart.listing.invalidateNonce());
    });
  return command;
}

function cartCheckoutCommand(swap = false): Command {
  const command = accountCommand(swap ? 'swap' : 'checkout');
  command.description('Preview or purchase an API-prepared Cart checkout');
  addChainOptions(command)
    .option('--input <path>', 'JSON checkout document with typed listing and swap items; amounts are human-readable decimals')
    .option('--listing <listing-digest[=quantity]>', 'listing shortcut; cannot combine with --input (repeatable)', collectValue, [])
    .option('--output-currency <currency>', 'swap output token: eth, usdc, rare, or ERC-20 address')
    .option('--input-amount <amount>', 'exact payment budget for a swap, in payment currency units')
    .option('--output-amount <amount>', 'exact tokens to receive for a swap, in output currency units')
    .requiredOption('--payment-currency <currency>', 'payment currency: eth, usdc, rare, or ERC-20 address')
    .option('--recipient <address>', 'fulfillment recipient (defaults to the configured wallet)')
    .option('--preview', 'show the API quote and SDK preparation without signing, approving, or submitting')
    .option('--prepare-only', 'reserve and authorize checkout without approving tokens or submitting payment; claims remain reserved until expiry')
    .option('--yes', 'approve payment currency if needed and skip transaction confirmation')
    .action(async (opts: CartCheckoutOptions): Promise<void> => {
      if (opts.preview === true && opts.prepareOnly === true) throw new Error('Use either --preview or --prepare-only, not both.');
      if (opts.input !== undefined && (opts.listing.length > 0 || opts.outputCurrency !== undefined || opts.inputAmount !== undefined || opts.outputAmount !== undefined)) throw new Error('Use --input alone, or listing/swap shortcuts, not both.');
      const hasSwap = opts.outputCurrency !== undefined || opts.inputAmount !== undefined || opts.outputAmount !== undefined;
      if ((swap || hasSwap) && (opts.outputCurrency === undefined || (opts.inputAmount === undefined) === (opts.outputAmount === undefined))) throw new Error('A swap requires --output-currency and exactly one of --input-amount or --output-amount.');
      const configuredRecipient = unwrapCartCliResult(parseCartAddress(opts.recipient, '--recipient'));
      const paymentCurrencyInput = unwrapCartCliResult(parseCartCliCurrency(
        opts.paymentCurrency ?? '',
        '--payment-currency',
      ));
      const selections = opts.input !== undefined
        ? unwrapCartCliResult(parseCartCheckoutFile(await readFile(opts.input, 'utf8')))
        : unwrapCartCliResult(parseCartCheckoutFile(JSON.stringify({ items: [
          ...(opts.listing.length === 0 ? [] : unwrapCartCliResult(parseCartListingSelections(opts.listing)).map(selection => ({ ...selection, quantity: selection.quantity.toString() }))),
          ...(hasSwap ? [{ kind: 'swap', mode: opts.inputAmount === undefined ? 'exact-output' : 'exact-input', outputCurrency: opts.outputCurrency,
            ...(opts.inputAmount === undefined ? { outputAmount: opts.outputAmount } : { inputAmount: opts.inputAmount }) }] : []),
        ] })));
      const chain = getActiveChain(opts.chain, opts.chainId);
      const publicClient = getPublicClient(chain);
      const wallet = opts.preview === true || opts.prepareOnly === true ? undefined : getWalletClient(chain);
      const recipient = configuredRecipient ?? wallet?.account.address ?? getConfiguredAccountAddress(chain);
      if (recipient === undefined) {
        throw new Error(`rare cart checkout requires --recipient or a configured account for "${chain}".`);
      }
      const rare = createRareClient({
        publicClient,
        apiBaseUrl: opts.apiUrl,
        accountClient: accountClient(storageOptions(opts)),
        account: wallet?.account.address ?? getConfiguredAccountAddress(chain),
        ...(wallet === undefined ? {} : { walletClient: wallet.client }),
      });
      const paymentCurrency = await rare.currency.resolveDecimals(paymentCurrencyInput);
      const items = await Promise.all(selections.map(async selection => {
        if (selection.kind === 'listing') return { ...selection, recipient: selection.recipient ?? recipient };
        const outputCurrency = await rare.currency.resolveDecimals(selection.outputCurrency);
        const common = { kind: selection.kind, outputCurrency: outputCurrency.address, recipient: selection.recipient ?? recipient } satisfies { kind: 'swap'; outputCurrency: Address; recipient: Address };
        return selection.mode === 'exact-input'
          ? { ...common, mode: selection.mode, inputAmount: unwrapCartCliResult(parseCartAmount(selection.inputAmount, paymentCurrency.decimals, 'inputAmount')) }
          : { ...common, mode: selection.mode, outputAmount: unwrapCartCliResult(parseCartAmount(selection.outputAmount, outputCurrency.decimals, 'outputAmount')) };
      }));
      const intent = {
        paymentCurrency: paymentCurrency.address,
        items,
      };
      const preparation = await rare.cart.checkout.prepare(intent);

      if (opts.preview === true) {
        const outputs = await Promise.all(preparation.lines.filter(line => line.fulfillmentKind === cartFulfillmentKinds.currencySwap).map(async line => {
          const currency = await rare.currency.resolveDecimals(line.settlementCurrency);
          return `${formatUnits(line.amount, currency.decimals)} ${currency.symbol ?? currency.address} to ${line.paymentRecipient}`;
        }));
        const fees = await Promise.all(preparation.fees.map(async fee => {
          const currency = await rare.currency.resolveDecimals(fee.currency);
          return `${fee.label}: ${formatUnits(fee.amount, currency.decimals)} ${currency.symbol ?? currency.address}`;
        }));
        output(
          { preview: true, preparation },
          () => {
            printCheckoutPreparation(preparation, paymentCurrency.symbol ?? paymentCurrency.address, paymentCurrency.decimals);
            for (const value of outputs) console.log(`  Receive: ${value}`);
            for (const value of fees) console.log(`  Fee: ${value}`);
          },
        );
        return;
      }

      if (opts.prepareOnly === true) {
        const preparedPurchase = await rare.cart.api.checkout.prepare(preparation.preparationReference);
        output({ prepareOnly: true, preparation, preparedPurchase }, () => {
          console.log(`Checkout authorized: ${preparedPurchase.executePurchase.order.orderId}`);
          console.log('No payment was submitted. Any eligibility claims remain reserved until the order expires.');
        });
        return;
      }

      log(`Purchasing ${intent.items.length} Cart item(s) on ${chain}...`);
      const purchase = async (): ReturnType<typeof rare.cart.checkout.purchase> =>
        rare.cart.checkout.purchase({ preparation, autoApprove: opts.yes === true });
      const result = await runWithPaymentApprovalConsent({
        commandName: swap ? 'rare cart swap' : 'rare cart checkout',
        approvalMessage: 'ERC20 approval is required before purchasing this Cart checkout.',
        runWithoutApproval: purchase,
        runWithApproval: async (): ReturnType<typeof rare.cart.checkout.purchase> =>
          rare.cart.checkout.purchase({ preparation, autoApprove: true }),
      });
      if (result === undefined) return;
      output(
        {
          txHash: result.txHash,
          blockNumber: result.receipt.blockNumber.toString(),
          approvalTxHash: result.approvalTxHash ?? null,
          orderId: result.orderId,
          payer: result.payer,
          paymentCurrency: result.paymentCurrency,
          paymentAmount: result.paymentAmount,
          lineCount: result.lineCount,
          actionCount: result.actionCount,
          preparedAt: result.preparedPurchase.preparedAt,
        },
        () => {
          if (result.approvalTxHash !== undefined) console.log(`Approval tx sent: ${result.approvalTxHash}`);
          console.log(`Transaction sent: ${result.txHash}`);
          console.log(`Confirmed in block ${result.receipt.blockNumber}`);
          console.log(`Order: ${result.orderId}`);
        },
      );
    });
  return command;
}

async function runSimpleCartWrite(
  opts: ChainOptions,
  message: string,
  run: (rare: ReturnType<typeof createRareClient>) => Promise<{ txHash: `0x${string}`; receipt: { blockNumber: bigint } }>,
): Promise<void> {
  const chain = getActiveChain(opts.chain, opts.chainId);
  const publicClient = getPublicClient(chain);
  const wallet = getWalletClient(chain);
  const rare = createRareClient({ publicClient, walletClient: wallet.client });
  log(`${message} (${chain})`);
  const result = await run(rare);
  output(
    { txHash: result.txHash, blockNumber: result.receipt.blockNumber.toString() },
    () => {
      console.log(`Transaction sent: ${result.txHash}`);
      console.log(`Confirmed in block ${result.receipt.blockNumber}`);
    },
  );
}

function collectValue(value: string, previous: string[]): string[] {
  return [...previous, value];
}

async function writeCartArtifact(path: string | undefined, artifact: unknown): Promise<void> {
  if (path === undefined) return;
  await writeFile(path, `${JSON.stringify(artifact, bigintReplacer, 2)}\n`, 'utf8');
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

function printListingPreparation(preparation: CartListingPreparation, outputPath: string | undefined): void {
  console.log('Cart Listing Root preview:');
  console.log(`  Seller: ${preparation.intent.seller}`);
  console.log(`  Listings: ${preparation.artifact.entries.length}`);
  console.log(`  Root: ${preparation.artifact.root.listingsRoot}`);
  console.log(`  Root digest: ${getListingRootDigest(preparation)}`);
  console.log(`  Nonce: ${preparation.artifact.root.nonce}`);
  console.log(`  Deadline: ${formatUnixTimestamp(preparation.artifact.root.deadline)}`);
  console.log(`  Required NFT approvals: ${preparation.requiredApprovals.length}`);
  for (const contract of preparation.requiredApprovals) console.log(`    ${contract}`);
  if (outputPath !== undefined) console.log(`Wrote prepared artifact: ${outputPath}`);
}

function getListingRootDigest(preparation: CartListingPreparation): `0x${string}` {
  const artifact = preparation.artifact;
  return hashCartListingRoot({
    listingsRoot: artifact.root.listingsRoot,
    nonce: BigInt(artifact.root.nonce),
    deadline: BigInt(artifact.root.deadline),
  }, BigInt(artifact.chainId), artifact.cart);
}

function printCheckoutPreparation(preparation: CartCheckoutPreparation, symbol: string, decimals: number): void {
  console.log('Cart checkout preview:');
  console.log(`  Items: ${preparation.intent.items.length}`);
  console.log(`  Payment: ${formatUnits(preparation.paymentAmount, decimals)} ${symbol}`);
  console.log(`  Fees: ${preparation.fees.length}`);
  console.log(`  Settlements: ${preparation.settlements.length}`);
  console.log(`  Route actions: ${preparation.route.inputs.length}`);
  console.log(`  Prepared: ${preparation.preparedAt}`);
  console.log(`  Expires: ${preparation.expiresAt}`);
}

function formatUnixTimestamp(value: string): string {
  return new Date(Number(BigInt(value)) * 1_000).toISOString();
}
