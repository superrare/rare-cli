import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { Command } from 'commander';
import { formatUnits, isAddress, isHex, type Address, type Hex } from 'viem';
import { getPublicClient, getWalletClient, tryGetWalletClient } from '../client.js';
import { getActiveChain } from '../config.js';
import { resolveCurrency } from '../contracts/addresses.js';
import { output, log } from '../output.js';
import { createRareClient } from '../sdk/client.js';
import { toNonNegativeInteger, toPositiveInteger } from '../sdk/amounts-core.js';
import { Erc1155CheckoutAllItemsSkippedError } from '../sdk/erc1155.js';
import { resolveCurrencyDecimals } from '../sdk/payments-shell.js';
import type { Erc1155CheckoutExecution, Erc1155CheckoutItemInput } from '../sdk/types/erc1155.js';
import type { ReleaseAllowlistArtifact, ReleaseAllowlistInputFormat } from '../sdk/types/release.js';
import { collectSplit, finalizeSplits, type SplitAccumulator } from './splits-core.js';
import { runWithMinterApprovalConsent, runWithNftApprovalConsent, runWithPaymentApprovalConsent } from './approval-consent.js';

type ChainOptions = {
  chain?: string;
  chainId?: string;
};

type CollectionCreateTokenOptions = ChainOptions & {
  contract: string;
  maxSupply: string;
  tokenUri?: string;
  royaltyReceiver?: string;
};

type CollectionMintOptions = ChainOptions & {
  contract: string;
  tokenId: string;
  quantity: string;
  to?: string;
};

type CollectionMintBatchOptions = ChainOptions & {
  contract: string;
  input: string;
  to?: string;
};

type CollectionUpdateTokenUriOptions = ChainOptions & {
  contract: string;
  tokenId: string;
  tokenUri: string;
};

type CollectionDisableOptions = ChainOptions & {
  contract: string;
};

type CollectionMinterSetOptions = ChainOptions & {
  contract: string;
  minter: string;
  approved: string;
};

type CollectionStatusOptions = ChainOptions & {
  contract: string;
  tokenId?: string;
  account?: string;
};

type ListingCreateOptions = ChainOptions & {
  contract: string;
  tokenId: string;
  quantity: string;
  price: string;
  currency?: string;
  expirationTime?: string;
  split?: SplitAccumulator;
  yes?: boolean;
};

type ListingCreateBatchOptions = ChainOptions & {
  contract: string;
  input: string;
  currency?: string;
  split?: SplitAccumulator;
  yes?: boolean;
};

type ListingBuyOptions = ChainOptions & {
  contract: string;
  seller: string;
  tokenId: string;
  quantity: string;
  price: string;
  currency?: string;
  recipient?: string;
  yes?: boolean;
};

type ListingCancelOptions = ChainOptions & {
  contract: string;
  tokenId?: string[];
};

type ListingCheckoutOptions = ChainOptions & {
  input: string;
  recipient?: string;
  yes?: boolean;
};

type ListingStatusOptions = ChainOptions & {
  contract: string;
  seller: string;
  tokenId: string;
};

type OfferCreateOptions = ChainOptions & {
  contract: string;
  tokenId: string;
  quantity: string;
  price: string;
  currency?: string;
  expirationTime?: string;
  yes?: boolean;
};

type OfferAcceptOptions = ChainOptions & {
  contract: string;
  tokenId: string;
  buyer: string;
  quantity: string;
  price: string;
  currency?: string;
  split?: SplitAccumulator;
  yes?: boolean;
};

type OfferCancelOptions = ChainOptions & {
  contract: string;
  tokenId: string;
  currency?: string;
};

type OfferStatusOptions = ChainOptions & {
  contract: string;
  tokenId: string;
  buyer?: string;
  currency?: string;
};

type ReleaseConfigureOptions = ChainOptions & {
  contract: string;
  tokenId: string;
  price: string;
  maxMints: string;
  currency?: string;
  startTime?: string;
  split?: SplitAccumulator;
  yes?: boolean;
};

type ReleaseConfigureBatchOptions = ChainOptions & {
  contract: string;
  input: string;
  currency?: string;
  split?: SplitAccumulator;
  yes?: boolean;
};

type ReleaseCancelOptions = ChainOptions & {
  contract: string;
  tokenId?: string[];
};

type ReleaseMintOptions = ChainOptions & {
  contract: string;
  tokenId: string;
  quantity: string;
  currency?: string;
  price?: string;
  proof?: string;
  recipient?: string;
  yes?: boolean;
};

type ReleaseStatusOptions = ChainOptions & {
  contract: string;
  tokenId: string;
  account?: string;
};

type AllowlistBuildOptions = {
  input: string;
  format?: string;
  output?: string;
};

type AllowlistProofOptions = {
  input: string;
  account: string;
  output?: string;
};

type AllowlistSetOptions = ChainOptions & {
  contract: string;
  tokenId: string;
  endTime: string;
  input?: string;
  root?: string;
};

type AllowlistSetBatchOptions = ChainOptions & {
  contract: string;
  input: string;
};

type LimitSetOptions = ChainOptions & {
  contract: string;
  tokenId: string;
  limit: string;
};

type LimitSetBatchOptions = ChainOptions & {
  contract: string;
  input: string;
};

type LimitGetOptions = ChainOptions & {
  contract: string;
  tokenId: string;
};

export function deployErc1155Command(): Command {
  const cmd = new Command('erc1155');
  cmd.description('Deploy a new ERC-1155 collection via the RARE ERC1155 factory');
  cmd
    .argument('<name>', 'name of the collection')
    .argument('<symbol>', 'symbol of the collection')
    .requiredOption('--base-uri <uri>', 'fallback ERC1155 base URI')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (name: string, symbol: string, opts: ChainOptions & { baseUri: string }) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Deploying ERC-1155 collection on ${chain}...`);
      log(`  Factory: ${rare.contracts.erc1155ContractFactory ?? '(unsupported chain)'}`);
      log(`  Name: ${name}`);
      log(`  Symbol: ${symbol}`);
      log(`  Base URI: ${opts.baseUri}`);

      const result = await rare.collection.deploy.erc1155({ name, symbol, baseUri: opts.baseUri });
      output({
        txHash: result.txHash,
        blockNumber: result.receipt.blockNumber.toString(),
        contract: result.contract,
        factory: result.factory,
        defaultMinter: result.defaultMinter,
      }, () => {
        console.log(`Transaction sent: ${result.txHash}`);
        console.log(`\nERC-1155 collection deployed at: ${result.contract}`);
      });
    });
  return cmd;
}

export function collectionErc1155Command(): Command {
  const cmd = new Command('erc1155');
  cmd.description('ERC-1155 collection subcommands');

  cmd.command('create-token')
    .description('Create an ERC-1155 token type')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--max-supply <number>', 'maximum mintable supply for this token id')
    .option('--token-uri <uri>', 'token-specific URI; empty falls back to base URI')
    .option('--royalty-receiver <address>', 'token royalty receiver (defaults to connected wallet)')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: CollectionCreateTokenOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const contract = parseAddressOption(opts.contract, '--contract');
      const royaltyReceiver = opts.royaltyReceiver === undefined ? undefined : parseAddressOption(opts.royaltyReceiver, '--royalty-receiver');
      const maxSupply = toPositiveInteger(opts.maxSupply, 'maxSupply');
      const rare = writeRare(chain);
      log(`Creating ERC-1155 token on ${chain}...`);
      const result = await rare.collection.erc1155.createToken({
        contract,
        maxSupply,
        tokenUri: opts.tokenUri,
        royaltyReceiver,
      });
      output({
        txHash: result.txHash,
        blockNumber: result.receipt.blockNumber.toString(),
        contract: result.contract,
        tokenId: result.tokenId,
        maxSupply: result.maxSupply,
        tokenUri: result.tokenUri,
        royaltyReceiver: result.royaltyReceiver,
      }, () => {
        console.log(`Transaction sent: ${result.txHash}`);
        console.log(`Token created: ${result.tokenId.toString()}`);
      });
    });

  cmd.command('mint')
    .description('Mint ERC-1155 token quantity')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--token-id <id>', 'token ID to mint')
    .requiredOption('--quantity <number>', 'quantity to mint')
    .option('--to <address>', 'recipient address (defaults to connected wallet)')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: CollectionMintOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const contract = parseAddressOption(opts.contract, '--contract');
      const tokenId = toNonNegativeInteger(opts.tokenId, 'tokenId');
      const quantity = toPositiveInteger(opts.quantity, 'quantity');
      const to = opts.to === undefined ? undefined : parseAddressOption(opts.to, '--to');
      const rare = writeRare(chain);
      const result = await rare.collection.erc1155.mint({
        contract,
        tokenId,
        quantity,
        to,
      });
      output(txOutput(result, {
        contract: result.contract,
        tokenId: result.tokenId,
        quantity: result.quantity,
        to: result.to,
      }), () => {
        console.log(`Transaction sent: ${result.txHash}`);
        console.log(`Minted ${result.quantity.toString()} of token ${result.tokenId.toString()} to ${result.to}`);
      });
    });

  cmd.command('mint-batch')
    .description('Mint multiple ERC-1155 token quantities from a JSON file')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--input <file>', 'JSON array of { "tokenId": "...", "quantity": "..." }')
    .option('--to <address>', 'recipient address (defaults to connected wallet)')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: CollectionMintBatchOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const contract = parseAddressOption(opts.contract, '--contract');
      const to = opts.to === undefined ? undefined : parseAddressOption(opts.to, '--to');
      const items = readMintBatchItems(opts.input);
      const rare = writeRare(chain);
      const result = await rare.collection.erc1155.mintBatch({ contract, to, items });
      output(txOutput(result, { contract: result.contract, to: result.to, items: result.items }), () => {
        console.log(`Transaction sent: ${result.txHash}`);
        console.log(`Minted ${result.items.length} ERC-1155 token entries to ${result.to}`);
      });
    });

  const metadata = new Command('metadata');
  metadata.description('ERC-1155 metadata admin subcommands');
  metadata.command('update-token-uri')
    .description('Update an ERC-1155 token URI')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--token-uri <uri>', 'new token URI')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: CollectionUpdateTokenUriOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const params = {
        contract: parseAddressOption(opts.contract, '--contract'),
        tokenId: toNonNegativeInteger(opts.tokenId, 'tokenId'),
        tokenUri: opts.tokenUri,
      };
      const result = await writeRare(chain).collection.erc1155.updateTokenUri(params);
      output(txOutput(result, {
        contract: result.contract,
        tokenId: result.tokenId,
        tokenUri: result.tokenUri,
      }), () => {
        console.log(`Transaction sent: ${result.txHash}`);
        console.log(`Token URI updated: ${result.tokenId.toString()}`);
      });
    });
  cmd.addCommand(metadata);

  cmd.command('disable')
    .description('Disable an ERC-1155 collection contract')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: CollectionDisableOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const params = {
        contract: parseAddressOption(opts.contract, '--contract'),
      };
      const result = await writeRare(chain).collection.erc1155.disable(params);
      output(txOutput(result, { contract: result.contract }), () => {
        console.log(`Transaction sent: ${result.txHash}`);
        console.log('ERC-1155 collection disabled');
      });
    });

  const minter = new Command('minter');
  minter.description('ERC-1155 minter approval subcommands');
  minter.command('set')
    .description('Set ERC-1155 collection minter approval')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--minter <address>', 'minter address')
    .requiredOption('--approved <true|false>', 'approval value')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: CollectionMinterSetOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const contract = parseAddressOption(opts.contract, '--contract');
      const minterAddress = parseAddressOption(opts.minter, '--minter');
      const approved = parseBooleanOption(opts.approved, '--approved');
      const rare = writeRare(chain);
      const result = await rare.collection.erc1155.setMinterApproval({
        contract,
        minter: minterAddress,
        approved,
      });
      output(txOutput(result, {
        contract: result.contract,
        minter: result.minter,
        approved: result.approved,
      }), () => {
        console.log(`Transaction sent: ${result.txHash}`);
        console.log(`Minter approval updated: ${result.minter} = ${result.approved ? 'true' : 'false'}`);
      });
    });
  cmd.addCommand(minter);

  cmd.command('status')
    .description('Read ERC-1155 collection and optional token status')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .option('--token-id <id>', 'token ID to include')
    .option('--account <address>', 'account to include balance/minter status')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: CollectionStatusOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const publicClient = getPublicClient(chain);
      const wallet = tryGetWalletClient(chain);
      const rare = createRareClient({ publicClient, walletClient: wallet?.client });
      const status = await rare.collection.erc1155.status({
        contract: parseAddressOption(opts.contract, '--contract'),
        tokenId: opts.tokenId,
        account: opts.account === undefined ? undefined : parseAddressOption(opts.account, '--account'),
      });
      output(status, () => {
        console.log('\nERC-1155 Collection Status:');
        console.log(`  Contract: ${status.contract}`);
        if (status.name) console.log(`  Name:     ${status.name}`);
        if (status.symbol) console.log(`  Symbol:   ${status.symbol}`);
        if (status.owner) console.log(`  Owner:    ${status.owner}`);
        if (status.disabled !== undefined) console.log(`  Disabled: ${status.disabled ? 'yes' : 'no'}`);
        if (status.token) {
          console.log(`  Token ID: ${status.token.tokenId.toString()}`);
          if (status.token.uri) console.log(`  URI:      ${status.token.uri}`);
          if (status.token.maxSupply !== undefined) console.log(`  Max:      ${status.token.maxSupply.toString()}`);
          if (status.token.totalMinted !== undefined) console.log(`  Minted:   ${status.token.totalMinted.toString()}`);
          if (status.token.accountBalance !== undefined) console.log(`  Balance:  ${status.token.accountBalance.toString()}`);
        }
      });
    });

  return cmd;
}

export function listingErc1155Command(): Command {
  const cmd = new Command('erc1155');
  cmd.description('ERC-1155 listing subcommands');
  cmd.addCommand(releaseErc1155Command());

  cmd.command('create')
    .description('Create an ERC-1155 fixed-price listing')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--quantity <number>', 'quantity available')
    .requiredOption('--price <amount>', 'per-unit price')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address')
    .option('--expiration-time <time>', 'listing expiration as unix seconds or ISO date')
    .option('--split <addr=ratio>', 'payout split recipient', collectSplit)
    .option('--yes', 'yes to approval prompts')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: ListingCreateOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const currency = opts.currency === undefined ? undefined : resolveCurrency(opts.currency, chain);
      const splits = finalizeSplits(opts.split);
      const params = {
        contract: parseAddressOption(opts.contract, '--contract'),
        tokenId: toNonNegativeInteger(opts.tokenId, 'tokenId'),
        quantity: toPositiveInteger(opts.quantity, 'quantity'),
        price: opts.price,
        currency,
        expirationTime: opts.expirationTime,
        splitAddresses: splits?.addresses,
        splitRatios: splits?.ratios,
      };
      const rare = writeRare(chain);
      log(`Creating ERC-1155 listing on ${chain}...`);
      const result = await runWithNftApprovalConsent({
        commandName: 'rare listing erc1155 create',
        approvalMessage: 'ERC1155 approval is required before creating this listing.',
        runWithoutApproval: async () => rare.listing.erc1155.create({ ...params, autoApprove: opts.yes === true }),
        runWithApproval: async () => rare.listing.erc1155.create({ ...params, autoApprove: true }),
      });
      if (result === undefined) return;
      output(txOutput(result, { approvalTxHash: result.approvalTxHash ?? null }), () => {
        printTxWithApproval(result, 'ERC-1155 listing created');
      });
    });

  cmd.command('create-batch')
    .description('Create multiple ERC-1155 fixed-price listings from a JSON file')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--input <file>', 'JSON array or object with items: { "tokenId": "...", "quantity": "...", "price": "...", "expirationTime": "..." }')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address')
    .option('--split <addr=ratio>', 'payout split recipient', collectSplit)
    .option('--yes', 'yes to approval prompts')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: ListingCreateBatchOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const currency = opts.currency === undefined ? undefined : resolveCurrency(opts.currency, chain);
      const splits = finalizeSplits(opts.split);
      const params = {
        contract: parseAddressOption(opts.contract, '--contract'),
        currency,
        items: readListingCreateBatchItems(opts.input),
        splitAddresses: splits?.addresses,
        splitRatios: splits?.ratios,
      };
      const rare = writeRare(chain);
      log(`Creating ERC-1155 listing batch on ${chain}...`);
      const result = await runWithNftApprovalConsent({
        commandName: 'rare listing erc1155 create-batch',
        approvalMessage: 'ERC1155 approval is required before creating these listings.',
        runWithoutApproval: async () => rare.listing.erc1155.createBatch({ ...params, autoApprove: opts.yes === true }),
        runWithApproval: async () => rare.listing.erc1155.createBatch({ ...params, autoApprove: true }),
      });
      if (result === undefined) return;
      output(txOutput(result, {
        contract: result.contract,
        currencyAddress: result.currencyAddress,
        items: result.items,
        approvalTxHash: result.approvalTxHash ?? null,
      }), () => {
        printTxWithApproval(result, `ERC-1155 listing batch created (${result.items.length.toString()} items)`);
      });
    });

  cmd.command('buy')
    .description('Buy from an ERC-1155 fixed-price listing')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--seller <address>', 'listing seller')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--quantity <number>', 'quantity to buy')
    .requiredOption('--price <amount>', 'expected per-unit price')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address')
    .option('--recipient <address>', 'token recipient address (defaults to connected wallet)')
    .option('--yes', 'yes to approval prompts')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: ListingBuyOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const currency = opts.currency === undefined ? undefined : resolveCurrency(opts.currency, chain);
      const params = {
        contract: parseAddressOption(opts.contract, '--contract'),
        seller: parseAddressOption(opts.seller, '--seller'),
        tokenId: toNonNegativeInteger(opts.tokenId, 'tokenId'),
        quantity: toPositiveInteger(opts.quantity, 'quantity'),
        price: opts.price,
        currency,
        recipient: opts.recipient === undefined ? undefined : parseAddressOption(opts.recipient, '--recipient'),
      };
      const rare = writeRare(chain);
      const result = await runWithPaymentApprovalConsent({
        commandName: 'rare listing erc1155 buy',
        approvalMessage: 'ERC20 approval is required before buying this listing.',
        runWithoutApproval: async () => rare.listing.erc1155.buy({ ...params, autoApprove: opts.yes === true }),
        runWithApproval: async () => rare.listing.erc1155.buy({ ...params, autoApprove: true }),
      });
      if (result === undefined) return;
      output(txOutput(result, {
        buyer: result.buyer,
        recipient: result.recipient,
        approvalTxHash: result.approvalTxHash ?? null,
      }), () => {
        printTxWithApproval(result, 'ERC-1155 listing purchased');
      });
    });

  cmd.command('checkout')
    .description('Checkout ERC-1155 release and listing items from a JSON cart')
    .requiredOption('--input <file>', 'checkout cart JSON file')
    .option('--recipient <address>', 'token recipient address (defaults to connected wallet)')
    .option('--yes', 'yes to approval prompts')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: ListingCheckoutOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const items = readCheckoutItems(opts.input, chain);
      const recipient = opts.recipient === undefined ? undefined : parseAddressOption(opts.recipient, '--recipient');
      const rare = writeRare(chain);
      const result = await runCheckoutWithApprovalConsent({
        run: async () => await runWithPaymentApprovalConsent({
          commandName: 'rare listing erc1155 checkout',
          approvalMessage: 'ERC20 approval is required before checking out this cart.',
          runWithoutApproval: async () => rare.listing.erc1155.checkout({ items, recipient, autoApprove: opts.yes === true }),
          runWithApproval: async () => rare.listing.erc1155.checkout({ items, recipient, autoApprove: true }),
        }),
      });
      if (result === undefined) return;
      output(txOutput(result, {
        marketplace: result.marketplace,
        summary: result.summary,
        items: result.items,
        payments: result.payments,
        approvalTxHashes: result.approvalTxHashes,
      }), () => {
        if (result.approvalTxHashes.length > 0) {
          console.log(`Approval txs sent: ${result.approvalTxHashes.join(', ')}`);
        }
        console.log(`Transaction sent: ${result.txHash}`);
        console.log(`ERC-1155 checkout completed. Filled: ${result.summary.filledCount.toString()} Skipped: ${result.summary.skippedCount.toString()}`);
      });
    });

  cmd.command('cancel')
    .description('Cancel an ERC-1155 listing')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .option('--token-id <id>', 'token ID; repeat for multiple', collectOption)
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: ListingCancelOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const contract = parseAddressOption(opts.contract, '--contract');
      const tokenIds = parseTokenIdList(opts.tokenId, '--token-id');
      const result = await writeRare(chain).listing.erc1155.cancel({
        contract,
        tokenIds,
      });
      output(txOutput(result), () => {
        console.log(`Transaction sent: ${result.txHash}`);
        console.log('ERC-1155 listing cancelled');
      });
    });

  cmd.command('status')
    .description('Read ERC-1155 listing status')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--seller <address>', 'listing seller')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: ListingStatusOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: tryGetWalletClient(chain)?.client });
      const result = await rare.listing.erc1155.status({
        contract: parseAddressOption(opts.contract, '--contract'),
        seller: parseAddressOption(opts.seller, '--seller'),
        tokenId: opts.tokenId,
      });
      const amount = formatUnits(result.price, await resolveCurrencyDecimals(publicClient, chain, result.currencyAddress));
      output(result, () => {
        console.log('\nERC-1155 Listing Details:');
        if (!result.hasListing) console.log('  No active listing found.');
        else {
          console.log(`  Seller:   ${result.seller}`);
          console.log(`  Price:    ${amount} ${result.isEth ? 'ETH' : result.currencyAddress}`);
          console.log(`  Quantity: ${result.quantity.toString()}`);
          console.log(`  Expires:  ${formatOptionalTimestamp(result.expirationTime)}`);
        }
      });
    });

  return cmd;
}

export function offerErc1155Command(): Command {
  const cmd = new Command('erc1155');
  cmd.description('ERC-1155 offer subcommands');

  cmd.command('create')
    .description('Create an ERC-1155 offer')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--quantity <number>', 'quantity wanted')
    .requiredOption('--price <amount>', 'per-unit offer price')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address')
    .option('--expiration-time <time>', 'offer expiration as unix seconds or ISO date')
    .option('--yes', 'yes to approval prompts')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: OfferCreateOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const currency = opts.currency === undefined ? undefined : resolveCurrency(opts.currency, chain);
      const params = {
        contract: parseAddressOption(opts.contract, '--contract'),
        tokenId: toNonNegativeInteger(opts.tokenId, 'tokenId'),
        quantity: toPositiveInteger(opts.quantity, 'quantity'),
        price: opts.price,
        currency,
        expirationTime: opts.expirationTime,
      };
      const rare = writeRare(chain);
      const result = await runWithPaymentApprovalConsent({
        commandName: 'rare offer erc1155 create',
        approvalMessage: 'ERC20 approval is required before creating this offer.',
        runWithoutApproval: async () => rare.offer.erc1155.create({ ...params, autoApprove: opts.yes === true }),
        runWithApproval: async () => rare.offer.erc1155.create({ ...params, autoApprove: true }),
      });
      if (result === undefined) return;
      output(txOutput(result, { approvalTxHash: result.approvalTxHash ?? null }), () => {
        printTxWithApproval(result, 'ERC-1155 offer created');
      });
    });

  cmd.command('accept')
    .description('Accept an ERC-1155 offer')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--buyer <address>', 'offer buyer')
    .requiredOption('--quantity <number>', 'quantity to sell')
    .requiredOption('--price <amount>', 'expected per-unit price')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address')
    .option('--split <addr=ratio>', 'payout split recipient', collectSplit)
    .option('--yes', 'yes to approval prompts')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: OfferAcceptOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const currency = opts.currency === undefined ? undefined : resolveCurrency(opts.currency, chain);
      const splits = finalizeSplits(opts.split);
      const params = {
        contract: parseAddressOption(opts.contract, '--contract'),
        tokenId: toNonNegativeInteger(opts.tokenId, 'tokenId'),
        buyer: parseAddressOption(opts.buyer, '--buyer'),
        quantity: toPositiveInteger(opts.quantity, 'quantity'),
        price: opts.price,
        currency,
        splitAddresses: splits?.addresses,
        splitRatios: splits?.ratios,
      };
      const rare = writeRare(chain);
      const result = await runWithNftApprovalConsent({
        commandName: 'rare offer erc1155 accept',
        approvalMessage: 'ERC1155 approval is required before accepting this offer.',
        runWithoutApproval: async () => rare.offer.erc1155.accept({ ...params, autoApprove: opts.yes === true }),
        runWithApproval: async () => rare.offer.erc1155.accept({ ...params, autoApprove: true }),
      });
      if (result === undefined) return;
      output(txOutput(result, { approvalTxHash: result.approvalTxHash ?? null }), () => {
        printTxWithApproval(result, 'ERC-1155 offer accepted');
      });
    });

  cmd.command('cancel')
    .description('Cancel an ERC-1155 offer')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: OfferCancelOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const contract = parseAddressOption(opts.contract, '--contract');
      const tokenId = toNonNegativeInteger(opts.tokenId, 'tokenId');
      const currency = opts.currency === undefined ? undefined : resolveCurrency(opts.currency, chain);
      const result = await writeRare(chain).offer.erc1155.cancel({
        contract,
        tokenId,
        currency,
      });
      output(txOutput(result), () => {
        console.log(`Transaction sent: ${result.txHash}`);
        console.log('ERC-1155 offer cancelled');
      });
    });

  cmd.command('status')
    .description('Read ERC-1155 offer status')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--buyer <address>', 'offer buyer (defaults to configured wallet)')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: OfferStatusOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: tryGetWalletClient(chain)?.client });
      const result = await rare.offer.erc1155.status({
        contract: parseAddressOption(opts.contract, '--contract'),
        tokenId: opts.tokenId,
        buyer: opts.buyer === undefined ? undefined : parseAddressOption(opts.buyer, '--buyer'),
        currency: opts.currency === undefined ? undefined : resolveCurrency(opts.currency, chain),
      });
      const amount = formatUnits(result.price, await resolveCurrencyDecimals(publicClient, chain, result.currencyAddress));
      output(result, () => {
        console.log('\nERC-1155 Offer Details:');
        if (!result.hasOffer) console.log('  No active offer found.');
        else {
          console.log(`  Buyer:    ${result.buyer}`);
          console.log(`  Price:    ${amount} ${result.isEth ? 'ETH' : result.currencyAddress}`);
          console.log(`  Quantity: ${result.quantity.toString()}`);
          console.log(`  Expires:  ${formatOptionalTimestamp(result.expirationTime)}`);
        }
      });
    });

  return cmd;
}

function releaseErc1155Command(): Command {
  const cmd = new Command('release');
  cmd.description('ERC-1155 primary sale release subcommands');

  cmd.command('configure')
    .description('Configure an ERC-1155 direct sale release')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--price <amount>', 'per-unit mint price')
    .requiredOption('--max-mints <number>', 'max quantity per mint transaction')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address')
    .option('--start-time <time>', 'sale start time as unix seconds or ISO date')
    .option('--split <addr=ratio>', 'payout split recipient', collectSplit)
    .option('--yes', 'yes to approval prompts')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: ReleaseConfigureOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const currency = opts.currency === undefined ? undefined : resolveCurrency(opts.currency, chain);
      const splits = finalizeSplits(opts.split);
      const params = {
        contract: parseAddressOption(opts.contract, '--contract'),
        tokenId: toNonNegativeInteger(opts.tokenId, 'tokenId'),
        price: opts.price,
        maxMints: toPositiveInteger(opts.maxMints, 'maxMints'),
        currency,
        startTime: opts.startTime,
        splitAddresses: splits?.addresses,
        splitRatios: splits?.ratios,
      };
      const rare = writeRare(chain);
      const result = await runWithMinterApprovalConsent({
        commandName: 'rare listing erc1155 release configure',
        approvalMessage: 'ERC1155 marketplace minter approval is required before configuring this release.',
        runWithoutApproval: async () => rare.listing.erc1155.release.configure({ ...params, autoApprove: opts.yes === true }),
        runWithApproval: async () => rare.listing.erc1155.release.configure({ ...params, autoApprove: true }),
      });
      if (result === undefined) return;
      output(txOutput(result, {
        approvalTxHash: result.approvalTxHash ?? null,
        tokenId: result.tokenId,
        price: result.price,
        maxMints: result.maxMints,
      }), () => {
        printTxWithApproval(result, 'ERC-1155 release configured');
      });
    });

  cmd.command('configure-batch')
    .description('Configure multiple ERC-1155 direct sale releases from a JSON file')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--input <file>', 'JSON array or object with items: { "tokenId": "...", "price": "...", "maxMints": "...", "startTime": "..." }')
    .option('--currency <currency>', 'currency: eth, usdc, rare, or ERC20 address')
    .option('--split <addr=ratio>', 'payout split recipient', collectSplit)
    .option('--yes', 'yes to approval prompts')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: ReleaseConfigureBatchOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const currency = opts.currency === undefined ? undefined : resolveCurrency(opts.currency, chain);
      const splits = finalizeSplits(opts.split);
      const params = {
        contract: parseAddressOption(opts.contract, '--contract'),
        currency,
        items: readReleaseConfigureBatchItems(opts.input),
        splitAddresses: splits?.addresses,
        splitRatios: splits?.ratios,
      };
      const rare = writeRare(chain);
      const result = await runWithMinterApprovalConsent({
        commandName: 'rare listing erc1155 release configure-batch',
        approvalMessage: 'ERC1155 marketplace minter approval is required before configuring these releases.',
        runWithoutApproval: async () => rare.listing.erc1155.release.configureBatch({ ...params, autoApprove: opts.yes === true }),
        runWithApproval: async () => rare.listing.erc1155.release.configureBatch({ ...params, autoApprove: true }),
      });
      if (result === undefined) return;
      output(txOutput(result, {
        contract: result.contract,
        currencyAddress: result.currencyAddress,
        items: result.items,
        approvalTxHash: result.approvalTxHash ?? null,
      }), () => {
        printTxWithApproval(result, `ERC-1155 release batch configured (${result.items.length.toString()} items)`);
      });
    });

  cmd.command('cancel')
    .description('Cancel ERC-1155 direct sale release configs')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .option('--token-id <id>', 'token ID; repeat for multiple', collectOption)
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: ReleaseCancelOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const params = {
        contract: parseAddressOption(opts.contract, '--contract'),
        tokenIds: parseTokenIdList(opts.tokenId, '--token-id'),
      };
      const result = await writeRare(chain).listing.erc1155.release.cancel(params);
      output(txOutput(result, {
        contract: result.contract,
        marketplace: result.marketplace,
        tokenIds: result.tokenIds,
      }), () => {
        console.log(`Transaction sent: ${result.txHash}`);
        console.log(`ERC-1155 release cancelled for ${result.tokenIds.length.toString()} token(s)`);
      });
    });

  cmd.command('mint')
    .description('Mint from an ERC-1155 direct sale release')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--quantity <number>', 'quantity to mint')
    .option('--currency <currency>', 'expected currency')
    .option('--price <amount>', 'expected per-unit price')
    .option('--proof <file>', 'allowlist proof JSON')
    .option('--recipient <address>', 'token recipient address (defaults to connected wallet)')
    .option('--yes', 'yes to approval prompts')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: ReleaseMintOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const params = {
        contract: parseAddressOption(opts.contract, '--contract'),
        tokenId: toNonNegativeInteger(opts.tokenId, 'tokenId'),
        quantity: toPositiveInteger(opts.quantity, 'quantity'),
        currency: opts.currency === undefined ? undefined : resolveCurrency(opts.currency, chain),
        price: opts.price,
        proof: opts.proof === undefined ? undefined : readProofFile(opts.proof),
        recipient: opts.recipient === undefined ? undefined : parseAddressOption(opts.recipient, '--recipient'),
      };
      const rare = writeRare(chain);
      const result = await runWithPaymentApprovalConsent({
        commandName: 'rare listing erc1155 release mint',
        approvalMessage: 'ERC20 approval is required before minting this ERC1155 release.',
        runWithoutApproval: async () => rare.listing.erc1155.release.mint({ ...params, autoApprove: opts.yes === true }),
        runWithApproval: async () => rare.listing.erc1155.release.mint({ ...params, autoApprove: true }),
      });
      if (result === undefined) return;
      output(txOutput(result, {
        approvalTxHash: result.approvalTxHash ?? null,
        tokenId: result.tokenId,
        quantity: result.quantity,
        requiredPayment: result.requiredPayment,
        recipient: result.recipient,
      }), () => {
        printTxWithApproval(result, 'ERC-1155 release mint complete');
      });
    });

  cmd.command('status')
    .description('Read ERC-1155 direct sale release status')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--account <address>', 'account to include usage')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: ReleaseStatusOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: tryGetWalletClient(chain)?.client });
      const result = await rare.listing.erc1155.release.status({
        contract: parseAddressOption(opts.contract, '--contract'),
        tokenId: opts.tokenId,
        account: opts.account === undefined ? undefined : parseAddressOption(opts.account, '--account'),
      });
      const amount = formatUnits(result.price, await resolveCurrencyDecimals(publicClient, chain, result.currencyAddress));
      output(result, () => {
        console.log('\nERC-1155 Release Details:');
        if (!result.configured) console.log('  No active release found.');
        else {
          console.log(`  Seller:       ${result.seller}`);
          console.log(`  Price:        ${amount} ${result.isEth ? 'ETH' : result.currencyAddress}`);
          console.log(`  Max mints:    ${result.maxMints.toString()}`);
          console.log(`  Started:      ${result.started ? 'yes' : 'no'}`);
          console.log(`  Mintable:     ${result.currentlyMintable ? 'yes' : 'no'}`);
          console.log(`  Remaining:    ${result.remainingSupply === null ? 'unknown' : result.remainingSupply.toString()}`);
        }
      });
    });

  cmd.addCommand(releaseAllowlistCommand());
  cmd.addCommand(releaseLimitsCommand());
  return cmd;
}

function releaseAllowlistCommand(): Command {
  const cmd = new Command('allowlist');
  cmd.description('ERC-1155 release allowlist subcommands');
  cmd.command('build')
    .requiredOption('--input <file>', 'CSV or JSON allowlist input')
    .option('--format <format>', 'csv or json')
    .option('--output <file>', 'write artifact JSON')
    .action((opts: AllowlistBuildOptions) => {
      const artifact = createRareClient({ publicClient: getPublicClient(getActiveChain(undefined, undefined)) })
        .listing.erc1155.release.allowlist.build({
          input: readTextFile(opts.input, 'allowlist input'),
          format: detectAllowlistFormat(opts.input, opts.format),
        });
      writeOrPrintJson(artifact, opts.output);
    });
  cmd.command('proof')
    .requiredOption('--input <file>', 'allowlist artifact JSON')
    .requiredOption('--account <address>', 'account address')
    .option('--output <file>', 'write proof JSON')
    .action((opts: AllowlistProofOptions) => {
      const artifact = readAllowlistArtifact(opts.input);
      const proof = createRareClient({ publicClient: getPublicClient(getActiveChain(undefined, undefined)) })
        .listing.erc1155.release.allowlist.proof({
          artifact,
          address: parseAddressOption(opts.account, '--account'),
        });
      if (proof === null) {
        throw new Error(`Account ${opts.account} is not present in allowlist artifact ${opts.input}.`);
      }
      writeOrPrintJson(proof, opts.output);
    });
  cmd.command('set')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--end-time <time>', 'allowlist end time')
    .option('--input <file>', 'allowlist artifact JSON')
    .option('--root <bytes32>', 'allowlist root')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: AllowlistSetOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const params = {
        contract: parseAddressOption(opts.contract, '--contract'),
        tokenId: toNonNegativeInteger(opts.tokenId, 'tokenId'),
        endTime: opts.endTime,
        root: opts.root === undefined ? undefined : parseBytes32Option(opts.root, '--root'),
        artifact: opts.input === undefined ? undefined : readAllowlistArtifact(opts.input),
      };
      const result = await writeRare(chain).listing.erc1155.release.allowlist.setConfig(params);
      output(txOutput(result, { config: result.config }), () => {
        console.log(`Transaction sent: ${result.txHash}`);
        console.log(`Allowlist set: ${result.config.root}`);
      });
    });
  cmd.command('set-batch')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--input <file>', 'JSON array or object with items: { "tokenId": "...", "endTime": "...", "root": "0x..." }')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: AllowlistSetBatchOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const params = {
        contract: parseAddressOption(opts.contract, '--contract'),
        items: readAllowlistSetBatchItems(opts.input),
      };
      const result = await writeRare(chain).listing.erc1155.release.allowlist.setConfigBatch(params);
      output(txOutput(result, { configs: result.configs }), () => {
        console.log(`Transaction sent: ${result.txHash}`);
        console.log(`Allowlist batch set for ${result.configs.length.toString()} token(s)`);
      });
    });
  cmd.command('clear')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: LimitGetOptions) => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const contract = parseAddressOption(opts.contract, '--contract');
      const tokenId = toNonNegativeInteger(opts.tokenId, 'tokenId');
      const result = await writeRare(chain).listing.erc1155.release.allowlist.clear({
        contract,
        tokenId,
      });
      output(txOutput(result, { config: result.config }), () => {
        console.log(`Transaction sent: ${result.txHash}`);
        console.log('Allowlist cleared');
      });
    });
  return cmd;
}

function releaseLimitsCommand(): Command {
  const cmd = new Command('limits');
  cmd.description('ERC-1155 release limit subcommands');
  cmd.command('set-mint')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--limit <number>', 'per-wallet mint limit; 0 disables')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: LimitSetOptions) => setLimit(opts, 'mint'));
  cmd.command('set-mint-batch')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--input <file>', 'JSON array or object with items: { "tokenId": "...", "limit": "..." }')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: LimitSetBatchOptions) => setLimitBatch(opts, 'mint'));
  cmd.command('set-tx')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--token-id <id>', 'token ID')
    .requiredOption('--limit <number>', 'per-wallet transaction limit; 0 disables')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: LimitSetOptions) => setLimit(opts, 'tx'));
  cmd.command('set-tx-batch')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--input <file>', 'JSON array or object with items: { "tokenId": "...", "limit": "..." }')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: LimitSetBatchOptions) => setLimitBatch(opts, 'tx'));
  cmd.command('get-mint')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: LimitGetOptions) => getLimit(opts, 'mint'));
  cmd.command('get-tx')
    .requiredOption('--contract <address>', 'ERC1155 collection contract')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--chain <chain>', 'chain to use (sepolia)')
    .option('--chain-id <id>', 'chain ID (11155111)')
    .action(async (opts: LimitGetOptions) => getLimit(opts, 'tx'));
  return cmd;
}

async function setLimit(opts: LimitSetOptions, kind: 'mint' | 'tx'): Promise<void> {
  const chain = getActiveChain(opts.chain, opts.chainId);
  const params = {
    contract: parseAddressOption(opts.contract, '--contract'),
    tokenId: toNonNegativeInteger(opts.tokenId, 'tokenId'),
    limit: toNonNegativeInteger(opts.limit, 'limit'),
  };
  const rare = writeRare(chain);
  const result = kind === 'mint'
    ? await rare.listing.erc1155.release.limits.setMint(params)
    : await rare.listing.erc1155.release.limits.setTx(params);
  output(txOutput(result, { config: result.config }), () => {
    console.log(`Transaction sent: ${result.txHash}`);
    console.log(`${kind === 'mint' ? 'Mint' : 'Transaction'} limit set: ${result.config.limit.toString()}`);
  });
}

async function setLimitBatch(opts: LimitSetBatchOptions, kind: 'mint' | 'tx'): Promise<void> {
  const chain = getActiveChain(opts.chain, opts.chainId);
  const params = {
    contract: parseAddressOption(opts.contract, '--contract'),
    items: readLimitSetBatchItems(opts.input),
  };
  const rare = writeRare(chain);
  const result = kind === 'mint'
    ? await rare.listing.erc1155.release.limits.setMintBatch(params)
    : await rare.listing.erc1155.release.limits.setTxBatch(params);
  output(txOutput(result, { configs: result.configs }), () => {
    console.log(`Transaction sent: ${result.txHash}`);
    console.log(`${kind === 'mint' ? 'Mint' : 'Transaction'} limit batch set for ${result.configs.length.toString()} token(s)`);
  });
}

async function getLimit(opts: LimitGetOptions, kind: 'mint' | 'tx'): Promise<void> {
  const chain = getActiveChain(opts.chain, opts.chainId);
  const publicClient = getPublicClient(chain);
  const rare = createRareClient({ publicClient });
  const params = {
    contract: parseAddressOption(opts.contract, '--contract'),
    tokenId: opts.tokenId,
  };
  const result = kind === 'mint'
    ? await rare.listing.erc1155.release.limits.getMint(params)
    : await rare.listing.erc1155.release.limits.getTx(params);
  output(result, () => {
    console.log(`${kind === 'mint' ? 'Mint' : 'Transaction'} limit: ${result.enabled ? result.limit.toString() : 'none'}`);
  });
}

function writeRare(chain: ReturnType<typeof getActiveChain>): ReturnType<typeof createRareClient> {
  const { client } = getWalletClient(chain);
  return createRareClient({ publicClient: getPublicClient(chain), walletClient: client });
}

function parseAddressOption(value: string, label: string): Address {
  if (!isAddress(value)) {
    throw new Error(`Invalid ${label} address: "${value}".`);
  }
  return value;
}

function parseBytes32Option(value: string, label: string): Hex {
  if (!isHex(value) || value.length !== 66) {
    throw new Error(`Invalid ${label} bytes32 value: "${value}".`);
  }
  return value;
}

function parseBooleanOption(value: string, label: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${label} must be true or false.`);
}

function collectOption(value: string, previous?: string[]): string[] {
  return [...(previous ?? []), value];
}

function parseTokenIdList(values: string[] | undefined, label: string): bigint[] {
  if (values === undefined || values.length === 0) {
    throw new Error(`${label} must be provided at least once.`);
  }
  return values.map((tokenId) => toNonNegativeInteger(tokenId, 'tokenId'));
}

function readMintBatchItems(filePath: string): Array<{ tokenId: bigint; quantity: bigint }> {
  const parsed = parseJson(readTextFile(filePath, 'mint batch input'), 'mint batch input');
  if (!Array.isArray(parsed)) {
    throw new Error('--input must be a JSON array.');
  }
  if (parsed.length === 0) {
    throw new Error('items must include at least one token.');
  }
  const items = parsed.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Mint batch item ${index} must be an object.`);
    }
    return {
      tokenId: toNonNegativeInteger(String(item.tokenId), `items[${index}].tokenId`),
      quantity: toPositiveInteger(String(item.quantity), `items[${index}].quantity`),
    };
  });
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    if (previous !== undefined && current !== undefined && current.tokenId <= previous.tokenId) {
      throw new Error('tokenIds must be strictly ascending.');
    }
  }
  return items;
}

function readListingCreateBatchItems(filePath: string): Array<{
  tokenId: bigint;
  quantity: bigint;
  price: string;
  expirationTime?: string;
}> {
  return readInputItems(filePath, 'listing batch input').map((item, index) => ({
    tokenId: toNonNegativeInteger(String(item.tokenId), `items[${index}].tokenId`),
    quantity: toPositiveInteger(String(item.quantity), `items[${index}].quantity`),
    price: parseRequiredStringValue(item.price, `items[${index}].price`),
    expirationTime: item.expirationTime === undefined
      ? undefined
      : parseStringValue(item.expirationTime, `items[${index}].expirationTime`),
  }));
}

function readReleaseConfigureBatchItems(filePath: string): Array<{
  tokenId: bigint;
  price: string;
  startTime?: string;
  maxMints: bigint;
}> {
  return readInputItems(filePath, 'release configure batch input').map((item, index) => ({
    tokenId: toNonNegativeInteger(String(item.tokenId), `items[${index}].tokenId`),
    price: parseRequiredStringValue(item.price, `items[${index}].price`),
    startTime: item.startTime === undefined
      ? undefined
      : parseStringValue(item.startTime, `items[${index}].startTime`),
    maxMints: toPositiveInteger(String(item.maxMints), `items[${index}].maxMints`),
  }));
}

function readAllowlistSetBatchItems(filePath: string): Array<{
  tokenId: bigint;
  root?: Hex;
  artifact?: ReleaseAllowlistArtifact;
  endTime: string;
}> {
  return readInputItems(filePath, 'allowlist batch input').map((item, index) => {
    if (item.root === undefined && item.artifact === undefined) {
      throw new Error(`items[${index}].root or items[${index}].artifact is required.`);
    }
    return {
      tokenId: toNonNegativeInteger(String(item.tokenId), `items[${index}].tokenId`),
      root: item.root === undefined ? undefined : parseBytes32Option(String(item.root), `items[${index}].root`),
      artifact: item.artifact === undefined ? undefined : parseAllowlistArtifactValue(item.artifact, `items[${index}].artifact`),
      endTime: parseRequiredStringValue(item.endTime, `items[${index}].endTime`),
    };
  });
}

function readLimitSetBatchItems(filePath: string): Array<{ tokenId: bigint; limit: bigint }> {
  return readInputItems(filePath, 'limit batch input').map((item, index) => ({
    tokenId: toNonNegativeInteger(String(item.tokenId), `items[${index}].tokenId`),
    limit: toNonNegativeInteger(String(item.limit), `items[${index}].limit`),
  }));
}

function readInputItems(filePath: string, label: string): Record<string, unknown>[] {
  const parsed = parseJson(readTextFile(filePath, label), label);
  const items = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.items) ? parsed.items : undefined;
  if (items === undefined) {
    throw new Error('--input must be a JSON array or an object with an items array.');
  }
  if (items.length === 0) {
    throw new Error('items must include at least one entry.');
  }
  const records = items.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`items[${index}] must be an object.`);
    }
    return item;
  });
  for (let index = 1; index < records.length; index += 1) {
    const previous = records[index - 1];
    const current = records[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      toNonNegativeInteger(String(current.tokenId), `items[${index}].tokenId`) <=
        toNonNegativeInteger(String(previous.tokenId), `items[${index - 1}].tokenId`)
    ) {
      throw new Error('tokenIds must be strictly ascending.');
    }
  }
  return records;
}

function readCheckoutItems(filePath: string, chain: ReturnType<typeof getActiveChain>): Erc1155CheckoutItemInput[] {
  const parsed = parseJson(readTextFile(filePath, 'checkout input'), 'checkout input');
  if (!isRecord(parsed) || !Array.isArray(parsed.items)) {
    throw new Error('--input must be a JSON object with an items array.');
  }
  if (parsed.items.length === 0) {
    throw new Error('items must include at least one checkout item.');
  }

  return parsed.items.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Checkout item ${index} must be an object.`);
    }
    const kind = item.kind;
    if (kind !== 'release' && kind !== 'listing') {
      throw new Error(`items[${index}].kind must be "release" or "listing".`);
    }
    const base = {
      contract: parseAddressOption(String(item.contract), `items[${index}].contract`),
      tokenId: toNonNegativeInteger(String(item.tokenId), `items[${index}].tokenId`),
      quantity: toPositiveInteger(String(item.quantity), `items[${index}].quantity`),
      currency: item.currency === undefined ? undefined : resolveCurrency(parseStringValue(item.currency, `items[${index}].currency`), chain),
    };
    if (kind === 'release') {
      return {
        kind,
        ...base,
        price: item.price === undefined ? undefined : parseStringValue(item.price, `items[${index}].price`),
        proof: item.proof === undefined ? undefined : parseProofValue(item.proof, `items[${index}].proof`),
      };
    }
    if (item.price === undefined) {
      throw new Error(`items[${index}].price is required for listing checkout items.`);
    }
    return {
      kind,
      ...base,
      seller: parseAddressOption(String(item.seller), `items[${index}].seller`),
      price: parseStringValue(item.price, `items[${index}].price`),
    };
  });
}

function readProofFile(filePath: string): Hex[] {
  const parsed = parseJson(readTextFile(filePath, 'allowlist proof'), 'allowlist proof');
  const proof = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.proof) ? parsed.proof : undefined;
  if (proof === undefined) {
    throw new Error('--proof must be a JSON array or an object with a proof array.');
  }
  return proof.map((entry, index) => parseBytes32Option(String(entry), `proof[${index}]`));
}

function parseProofValue(value: unknown, label: string): Hex[] {
  const proof = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.proof) ? value.proof : undefined;
  if (proof === undefined) {
    throw new Error(`${label} must be a JSON array or an object with a proof array.`);
  }
  return proof.map((entry, index) => parseBytes32Option(String(entry), `${label}[${index}]`));
}

function readAllowlistArtifact(filePath: string): ReleaseAllowlistArtifact {
  const parsed = parseJson(readTextFile(filePath, 'allowlist artifact'), 'allowlist artifact');
  return parseAllowlistArtifactValue(parsed, 'allowlist artifact');
}

function parseAllowlistArtifactValue(value: unknown, label: string): ReleaseAllowlistArtifact {
  const parsed = value;
  if (!isRecord(parsed) || parsed.kind !== 'rare-release-allowlist-v1') {
    throw new Error(`${label} must be a rare-release-allowlist-v1 artifact.`);
  }
  if (!isReleaseAllowlistArtifact(parsed)) {
    throw new Error(`${label} is malformed.`);
  }
  return parsed;
}

function detectAllowlistFormat(filePath: string, format?: string): ReleaseAllowlistInputFormat {
  if (format === 'csv' || format === 'json') return format;
  if (format !== undefined) throw new Error('--format must be csv or json.');
  const extension = extname(filePath).toLowerCase();
  if (extension === '.csv') return 'csv';
  if (extension === '.json') return 'json';
  throw new Error('Unable to infer allowlist format. Pass --format csv or --format json.');
}

function readTextFile(filePath: string, label: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read ${label} "${filePath}".`, { cause: error });
  }
}

function writeOrPrintJson(value: unknown, filePath: string | undefined): void {
  if (filePath !== undefined) {
    writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    output({ outputPath: filePath, value }, () => {
      console.log(`Wrote ${filePath}`);
    });
    return;
  }
  output(value, () => {
    console.log(JSON.stringify(value, null, 2));
  });
}

function parseJson(content: string, label: string): unknown {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Unable to parse ${label} JSON.`, { cause: error });
  }
}

function parseStringValue(value: unknown, label: string): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  throw new Error(`${label} must be a string or number.`);
}

function parseRequiredStringValue(value: unknown, label: string): string {
  if (value === undefined) {
    throw new Error(`${label} is required.`);
  }
  return parseStringValue(value, label);
}

function txOutput(result: { txHash: Hex; receipt: { blockNumber: bigint } }, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    txHash: result.txHash,
    blockNumber: result.receipt.blockNumber.toString(),
    ...extra,
  };
}

async function runCheckoutWithApprovalConsent<Result>(params: {
  run: () => Promise<Result | undefined>;
}): Promise<Result | undefined> {
  try {
    return await params.run();
  } catch (error) {
    if (!(error instanceof Erc1155CheckoutAllItemsSkippedError)) {
      throw error;
    }
    output({
      submitted: false,
      marketplace: error.execution.marketplace,
      summary: error.execution.summary,
      items: error.execution.items,
    }, () => {
      console.log('ERC-1155 checkout not submitted. All items were skipped in preflight.');
      printCheckoutPreflightFailures(error.execution);
    });
    return undefined;
  }
}

function printCheckoutPreflightFailures(execution: Erc1155CheckoutExecution): void {
  console.log(`Filled: ${execution.summary.filledCount.toString()} Skipped: ${execution.summary.skippedCount.toString()}`);
  execution.items.forEach((item) => {
    const decoded = item.status === 'skipped' && item.decodedFailure !== undefined
      ? ` ${item.decodedFailure.errorName}`
      : '';
    console.log(
      `  #${item.index} ${item.kind} token:${item.tokenId.toString()} stage:${item.failureStageName} reason:${item.reason}${decoded}`,
    );
  });
}

function printTxWithApproval(result: { txHash: Hex; receipt: { blockNumber: bigint }; approvalTxHash?: Hex }, message: string): void {
  if (result.approvalTxHash !== undefined) {
    console.log(`Approval tx sent: ${result.approvalTxHash}`);
  }
  console.log(`Transaction sent: ${result.txHash}`);
  console.log(`${message}! Block: ${result.receipt.blockNumber}`);
}

function formatOptionalTimestamp(value: bigint): string {
  return value === 0n ? 'none' : new Date(Number(value) * 1000).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isReleaseAllowlistArtifact(value: unknown): value is ReleaseAllowlistArtifact {
  return isRecord(value) &&
    value.kind === 'rare-release-allowlist-v1' &&
    value.version === 1 &&
    value.leafEncoding === 'keccak256(address)' &&
    value.tree === 'sorted-addresses-sort-pairs' &&
    typeof value.root === 'string' &&
    isHex(value.root) &&
    Array.isArray(value.wallets) &&
    value.wallets.every(isReleaseAllowlistWalletProof);
}

function isReleaseAllowlistWalletProof(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.address === 'string' &&
    isAddress(value.address) &&
    typeof value.leaf === 'string' &&
    isHex(value.leaf) &&
    Array.isArray(value.proof) &&
    value.proof.every((entry) => typeof entry === 'string' && isHex(entry));
}
