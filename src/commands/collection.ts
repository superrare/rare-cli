import { Command } from 'commander';
import { getAddress, isAddress, type Address } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { createRareClient } from '../sdk/client.js';
import { requireContractAddress, type SupportedChain } from '../contracts/addresses.js';
import type { RareClient } from '../sdk/types.js';
import {
  lazySovereignCollectionContractTypes,
  normalizeLazySovereignCollectionContractType,
  normalizeSovereignCollectionContractType,
  sovereignCollectionContractTypes,
} from '../sdk/collection-core.js';
import { printError } from '../errors.js';
import { output, log } from '../output.js';
import { createCollectionListCommand } from './account-market-list.js';
import { mintCommand } from './mint.js';
import { deployErc721Command } from './deploy.js';

type LazyBatchMintOptions = {
  maxTokens?: string;
  chain?: string;
  chainId?: string;
};

type CreateSovereignOptions = {
  maxTokens?: string;
  contractType?: string;
  chain?: string;
  chainId?: string;
};

type CreateLazySovereignOptions = {
  maxTokens: string;
  contractType?: string;
  chain?: string;
  chainId?: string;
};

type CollectionMintBatchOptions = {
  contract: string;
  baseUri: string;
  amount?: string;
  tokenCount?: string;
  chain?: string;
  chainId?: string;
  yes?: boolean;
};

type CollectionPrepareLazyMintOptions = {
  contract: string;
  baseUri: string;
  amount?: string;
  tokenCount?: string;
  minter?: string;
  chain?: string;
  chainId?: string;
  yes?: boolean;
};

type CollectionTokenOptions = {
  contract: string;
  tokenId: string;
  chain?: string;
  chainId?: string;
};

type CollectionRoyaltyStatusOptions = CollectionTokenOptions & {
  price?: string;
  salePrice?: string;
};

type CollectionRoyaltyReceiverOptions = {
  contract: string;
  receiver: string;
  chain?: string;
  chainId?: string;
};

type CollectionTokenRoyaltyReceiverOptions = CollectionRoyaltyReceiverOptions & {
  tokenId: string;
};

type CollectionRoyaltyRegistryOptions = {
  registry?: string;
  chain?: string;
  chainId?: string;
};

type CollectionRoyaltyRegistryStatusOptions = CollectionTokenOptions & CollectionRoyaltyRegistryOptions & {
  price?: string;
  salePrice?: string;
};

type CollectionRoyaltyRegistryReceiverOverrideOptions = CollectionRoyaltyRegistryOptions & {
  receiver: string;
};

type CollectionRoyaltyRegistryReceiverOptions = CollectionRoyaltyRegistryOptions & {
  contract: string;
  receiver: string;
};

type CollectionRoyaltyRegistryTokenReceiverOptions = CollectionRoyaltyRegistryReceiverOptions & {
  tokenId: string;
};

type CollectionRoyaltyRegistryContractPercentageOptions = CollectionRoyaltyRegistryOptions & {
  contract: string;
  percentage: string;
};

type CollectionContractOptions = {
  contract: string;
  chain?: string;
  chainId?: string;
};

type CollectionUpdateBaseUriOptions = CollectionContractOptions & {
  baseUri: string;
};

type CollectionUpdateTokenUriOptions = CollectionTokenOptions & {
  tokenUri: string;
};

type CollectionCommandClient = {
  chain: SupportedChain;
  rare: RareClient;
};

function lazyBatchMintCmd(): Command {
  const cmd = new Command('lazy-batch-mint');
  cmd
    .description(
      'Deploy a Lazy Sovereign Batch Mint collection (used as the base for the lazy mint flow). Defaults to no supply cap.',
    )
    .argument('<name>', 'name of the collection')
    .argument('<symbol>', 'symbol of the collection')
    .option('--max-tokens <number>', 'optional supply cap (immutable). If omitted, the collection is uncapped.')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .option('--yes', 'yes to all prompts, including transaction submission')
    .action(async (name: string, symbol: string, opts: LazyBatchMintOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Deploying Lazy Sovereign Batch Mint collection on ${chain}...`);
      log(`  Name: ${name}`);
      log(`  Symbol: ${symbol}`);
      if (opts.maxTokens) log(`  Max tokens: ${opts.maxTokens}`);
      else log(`  Max tokens: uncapped`);
      log('Waiting for transaction confirmation...');

      const result = await rare.deploy.lazyBatchMint({
        name,
        symbol,
        maxTokens: opts.maxTokens,
      });

      output(
        {
          txHash: result.txHash,
          blockNumber: result.receipt.blockNumber.toString(),
          contract: result.contract,
        },
        () => {
          console.log(`Transaction sent: ${result.txHash}`);
          console.log(`\nLazy Batch Mint collection deployed at: ${result.contract}`);
        },
      );
    });

  return cmd;
}

function createSovereignCollectionCommand(): Command {
  const cmd = new Command('sovereign');
  cmd.description('Create a standard Sovereign NFT collection');

  cmd
    .argument('<name>', 'name of the NFT collection')
    .argument('<symbol>', 'symbol of the NFT collection')
    .option('--max-tokens <number>', 'maximum number of tokens')
    .option(
      '--contract-type <type>',
      `contract type (${sovereignCollectionContractTypes.join(', ')})`,
      'standard',
    )
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .option('--yes', 'yes to all prompts, including transaction submission')
    .action(async (name: string, symbol: string, opts: CreateSovereignOptions): Promise<void> => {
      const contractType = normalizeSovereignCollectionContractType(opts.contractType);
      const chain = getActiveChain(opts.chain, opts.chainId);
      const factoryAddress = requireContractAddress(chain, 'sovereignFactory');
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Creating Sovereign collection on ${chain}...`);
      log(`  Name: ${name}`);
      log(`  Symbol: ${symbol}`);
      log(`  Contract type: ${contractType ?? 'standard'}`);
      log(`  Factory: ${factoryAddress}`);
      if (opts.maxTokens) log(`  Max tokens: ${opts.maxTokens}`);
      log('Waiting for transaction confirmation...');

      try {
        const result = await rare.collection.createSovereign({
          name,
          symbol,
          maxTokens: opts.maxTokens,
          contractType,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            contract: result.contract,
            factory: result.factory,
            contractType: result.contractType,
          },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`\nSovereign collection created at: ${result.contract}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createLazySovereignCollectionCommand(): Command {
  const cmd = new Command('lazy-sovereign');
  cmd.description('Create a Lazy Sovereign NFT collection for release minting');

  cmd
    .argument('<name>', 'name of the NFT collection')
    .argument('<symbol>', 'symbol of the NFT collection')
    .requiredOption('--max-tokens <number>', 'maximum number of tokens')
    .option(
      '--contract-type <type>',
      `contract type (${lazySovereignCollectionContractTypes.join(', ')})`,
      'lazy',
    )
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .option('--yes', 'yes to all prompts, including transaction submission')
    .action(async (name: string, symbol: string, opts: CreateLazySovereignOptions): Promise<void> => {
      const contractType = normalizeLazySovereignCollectionContractType(opts.contractType);
      const chain = getActiveChain(opts.chain, opts.chainId);
      const factoryAddress = requireContractAddress(chain, 'lazySovereignFactory');
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Creating Lazy Sovereign collection on ${chain}...`);
      log(`  Name: ${name}`);
      log(`  Symbol: ${symbol}`);
      log(`  Contract type: ${contractType ?? 'lazy'}`);
      log(`  Factory: ${factoryAddress}`);
      log(`  Max tokens: ${opts.maxTokens}`);
      log('Waiting for transaction confirmation...');

      try {
        const result = await rare.collection.createLazySovereign({
          name,
          symbol,
          maxTokens: opts.maxTokens,
          contractType,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            contract: result.contract,
            factory: result.factory,
            contractType: result.contractType,
            nextStep: result.nextStep,
          },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`\nLazy Sovereign collection created at: ${result.contract}`);
            console.log(`Next: ${result.nextStep}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createMintBatchCommand(): Command {
  const cmd = new Command('mint-batch');
  cmd.description('Batch mint tokens on a Sovereign collection');

  cmd
    .requiredOption('--contract <address>', 'collection contract address')
    .requiredOption('--base-uri <uri>', 'base URI for token metadata')
    .option('--amount <number>', 'number of tokens to mint')
    .option('--token-count <number>', 'alias for --amount')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .option('--yes', 'yes to all prompts, including transaction submission')
    .action(async (opts: CollectionMintBatchOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const amount = opts.amount ?? opts.tokenCount;
        if (amount === undefined) {
          throw new Error('collection mint-batch requires --amount.');
        }
        const chain = getActiveChain(opts.chain, opts.chainId);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });

        log(`Batch minting collection tokens on ${chain}...`);
        log(`  Contract: ${contract}`);
        log(`  Base URI: ${opts.baseUri}`);
        log(`  Amount: ${amount}`);
        log('Waiting for transaction confirmation...');

        const result = await rare.collection.mintBatch({
          contract,
          baseUri: opts.baseUri,
          amount,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            contract: result.contract,
            baseUri: result.baseUri,
            tokenCount: result.tokenCount,
            fromTokenId: result.fromTokenId,
            toTokenId: result.toTokenId,
            owner: result.owner,
          },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`\nMinted token range: ${result.fromTokenId.toString()}-${result.toTokenId.toString()}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createPrepareLazyMintCommand(): Command {
  const cmd = new Command('prepare-lazy-mint');
  cmd.description('Prepare a Lazy Sovereign collection mint batch');

  cmd
    .requiredOption('--contract <address>', 'collection contract address')
    .requiredOption('--base-uri <uri>', 'base URI for token metadata')
    .option('--amount <number>', 'number of tokens to prepare')
    .option('--token-count <number>', 'alias for --amount')
    .option('--minter <address>', 'optional approved minter address')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .option('--yes', 'yes to all prompts, including transaction submission')
    .action(async (opts: CollectionPrepareLazyMintOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const amount = opts.amount ?? opts.tokenCount;
        if (amount === undefined) {
          throw new Error('collection prepare-lazy-mint requires --amount.');
        }
        const minter = opts.minter === undefined
          ? undefined
          : parseAddressOption(opts.minter, '--minter');
        const chain = getActiveChain(opts.chain, opts.chainId);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });

        log(`Preparing Lazy Sovereign mint on ${chain}...`);
        log(`  Contract: ${contract}`);
        log(`  Base URI: ${opts.baseUri}`);
        log(`  Amount: ${amount}`);
        if (minter !== undefined) log(`  Minter: ${minter}`);
        log('Waiting for transaction confirmation...');

        const result = await rare.collection.prepareLazyMint({
          contract,
          baseUri: opts.baseUri,
          amount,
          minter,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            contract: result.contract,
            baseUri: result.baseUri,
            tokenCount: result.tokenCount,
            minter: result.minter,
          },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`\nPrepared ${result.tokenCount.toString()} lazy mint tokens.`);
            if (result.minter !== undefined) {
              console.log(`Approved minter: ${result.minter}`);
            }
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createTokenCreatorCommand(): Command {
  const cmd = new Command('creator');
  cmd.description('Read the creator address for a collection token');

  cmd
    .requiredOption('--contract <address>', 'collection contract address')
    .requiredOption('--token-id <id>', 'token ID to inspect')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: CollectionTokenOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const { chain, rare } = createReadCollectionClient(opts.chain, opts.chainId);
        const result = await rare.collection.getTokenCreator({
          contract,
          tokenId: opts.tokenId,
        });

        output(
          {
            chain,
            contract: result.contract,
            tokenId: result.tokenId,
            creator: result.creator,
          },
          () => {
            console.log(`Token creator: ${result.creator}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createRoyaltyStatusCommand(): Command {
  const cmd = new Command('status');
  cmd.description('Read ERC-2981 royalty receiver and amount for a collection token');

  cmd
    .requiredOption('--contract <address>', 'collection contract address')
    .requiredOption('--token-id <id>', 'token ID to inspect')
    .option('--price <raw>', 'raw sale price units used for the royalty quote')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: CollectionRoyaltyStatusOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const { chain, rare } = createReadCollectionClient(opts.chain, opts.chainId);
        const result = await rare.collection.getRoyaltyInfo({
          contract,
          tokenId: opts.tokenId,
          price: opts.price,
        });

        output(
          {
            chain,
            contract: result.contract,
            tokenId: result.tokenId,
            salePrice: result.salePrice,
            receiver: result.receiver,
            royaltyAmount: result.royaltyAmount,
            defaultReceiver: result.defaultReceiver,
            defaultPercentage: result.defaultPercentage,
          },
          () => {
            console.log(`Royalty receiver: ${result.receiver}`);
            console.log(`Royalty amount: ${result.royaltyAmount.toString()}`);
            if (result.defaultReceiver !== undefined) {
              console.log(`Default receiver: ${result.defaultReceiver}`);
            }
            if (result.defaultPercentage !== undefined) {
              console.log(`Default percentage: ${result.defaultPercentage.toString()}%`);
            }
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createSetDefaultRoyaltyReceiverCommand(): Command {
  const cmd = new Command('set-default-receiver');
  cmd.description('Set the default royalty receiver for a Sovereign-style collection');

  cmd
    .requiredOption('--contract <address>', 'collection contract address')
    .requiredOption('--receiver <address>', 'new default royalty receiver')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: CollectionRoyaltyReceiverOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const receiver = parseAddressOption(opts.receiver, '--receiver');
        const { chain, rare } = createWriteCollectionClient(opts.chain, opts.chainId);

        log(`Setting default royalty receiver on ${chain}...`);
        log(`  Contract: ${contract}`);
        log(`  Receiver: ${receiver}`);
        log('Waiting for transaction confirmation...');

        const result = await rare.collection.setDefaultRoyaltyReceiver({ contract, receiver });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            contract: result.contract,
            receiver: result.receiver,
          },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Default royalty receiver set to: ${result.receiver}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createSetTokenRoyaltyReceiverCommand(): Command {
  const cmd = new Command('set-token-receiver');
  cmd.description('Set a token-specific royalty receiver for a Sovereign-style collection');

  cmd
    .requiredOption('--contract <address>', 'collection contract address')
    .requiredOption('--token-id <id>', 'token ID to update')
    .requiredOption('--receiver <address>', 'new token royalty receiver')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: CollectionTokenRoyaltyReceiverOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const receiver = parseAddressOption(opts.receiver, '--receiver');
        const { chain, rare } = createWriteCollectionClient(opts.chain, opts.chainId);

        log(`Setting token royalty receiver on ${chain}...`);
        log(`  Contract: ${contract}`);
        log(`  Token ID: ${opts.tokenId}`);
        log(`  Receiver: ${receiver}`);
        log('Waiting for transaction confirmation...');

        const result = await rare.collection.setTokenRoyaltyReceiver({
          contract,
          tokenId: opts.tokenId,
          receiver,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            contract: result.contract,
            tokenId: result.tokenId,
            receiver: result.receiver,
          },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Token ${result.tokenId.toString()} royalty receiver set to: ${result.receiver}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createRoyaltyRegistryStatusCommand(): Command {
  const cmd = new Command('status');
  cmd.description('Read legacy RoyaltyRegistry receiver and percentage settings for a collection token');

  cmd
    .requiredOption('--contract <address>', 'collection contract address')
    .requiredOption('--token-id <id>', 'token ID to inspect')
    .option('--price <raw>', 'raw sale price units used for the royalty quote')
    .option('--registry <address>', 'royalty registry address (defaults to the protocol registry)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: CollectionRoyaltyRegistryStatusOptions) => {
      const contract = parseAddressOption(opts.contract, '--contract');
      const registry = parseOptionalAddressOption(opts.registry, '--registry');
      const { chain, rare } = createReadCollectionClient(opts.chain, opts.chainId);
      const result = await rare.collection.getRoyaltyRegistryStatus({
        registry,
        contract,
        tokenId: opts.tokenId,
        price: opts.price,
      });

      output(
        {
          chain,
          registry: result.registry,
          contract: result.contract,
          tokenId: result.tokenId,
          salePrice: result.salePrice,
          creatorRegistry: result.creatorRegistry,
          receiver: result.receiver,
          royaltyPercentage: result.royaltyPercentage,
          royaltyAmount: result.royaltyAmount,
          configuredContractPercentage: result.configuredContractPercentage,
          contractReceiver: result.contractReceiver,
          tokenReceiver: result.tokenReceiver,
        },
        () => {
          console.log(`Royalty registry: ${result.registry}`);
          console.log(`Registry receiver: ${result.receiver}`);
          console.log(`Royalty percentage: ${result.royaltyPercentage}%`);
          console.log(`Royalty amount: ${result.royaltyAmount.toString()}`);
          console.log(`Creator registry: ${result.creatorRegistry}`);
          if (result.configuredContractPercentage !== undefined) {
            console.log(`Configured contract percentage: ${result.configuredContractPercentage}%`);
          }
          if (result.contractReceiver !== undefined) {
            console.log(`Contract receiver: ${result.contractReceiver}`);
          }
          if (result.tokenReceiver !== undefined) {
            console.log(`Token receiver: ${result.tokenReceiver}`);
          }
        },
      );
    });

  return cmd;
}

function createRoyaltyRegistrySetReceiverOverrideCommand(): Command {
  const cmd = new Command('set-receiver-override');
  cmd.description('Set your legacy RoyaltyRegistry receiver override');

  cmd
    .requiredOption('--receiver <address>', 'new royalty receiver for the connected wallet')
    .option('--registry <address>', 'royalty registry address (defaults to the protocol registry)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: CollectionRoyaltyRegistryReceiverOverrideOptions) => {
      const receiver = parseAddressOption(opts.receiver, '--receiver');
      const registry = parseOptionalAddressOption(opts.registry, '--registry');
      const { chain, rare } = createWriteCollectionClient(opts.chain, opts.chainId);

      log(`Setting royalty registry receiver override on ${chain}...`);
      if (registry !== undefined) log(`  Registry: ${registry}`);
      log(`  Receiver: ${receiver}`);
      log('Waiting for transaction confirmation...');

      const result = await rare.collection.setRoyaltyRegistryReceiverOverride({ registry, receiver });

      output(
        {
          txHash: result.txHash,
          blockNumber: result.receipt.blockNumber.toString(),
          registry: result.registry,
          receiver: result.receiver,
        },
        () => {
          console.log(`Transaction sent: ${result.txHash}`);
          console.log(`Royalty registry receiver override set to: ${result.receiver}`);
        },
      );
    });

  return cmd;
}

function createRoyaltyRegistrySetContractReceiverCommand(): Command {
  const cmd = new Command('set-contract-receiver');
  cmd.description('Set a legacy RoyaltyRegistry receiver for an owned collection contract');

  cmd
    .requiredOption('--contract <address>', 'collection contract address')
    .requiredOption('--receiver <address>', 'new collection royalty receiver')
    .option('--registry <address>', 'royalty registry address (defaults to the protocol registry)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: CollectionRoyaltyRegistryReceiverOptions) => {
      const contract = parseAddressOption(opts.contract, '--contract');
      const receiver = parseAddressOption(opts.receiver, '--receiver');
      const registry = parseOptionalAddressOption(opts.registry, '--registry');
      const { chain, rare } = createWriteCollectionClient(opts.chain, opts.chainId);

      log(`Setting royalty registry contract receiver on ${chain}...`);
      if (registry !== undefined) log(`  Registry: ${registry}`);
      log(`  Contract: ${contract}`);
      log(`  Receiver: ${receiver}`);
      log('Waiting for transaction confirmation...');

      const result = await rare.collection.setRoyaltyRegistryContractReceiver({
        registry,
        contract,
        receiver,
      });

      output(
        {
          txHash: result.txHash,
          blockNumber: result.receipt.blockNumber.toString(),
          registry: result.registry,
          contract: result.contract,
          receiver: result.receiver,
        },
        () => {
          console.log(`Transaction sent: ${result.txHash}`);
          console.log(`Royalty registry contract receiver set to: ${result.receiver}`);
        },
      );
    });

  return cmd;
}

function createRoyaltyRegistrySetTokenReceiverCommand(): Command {
  const cmd = new Command('set-token-receiver');
  cmd.description('Set a legacy RoyaltyRegistry receiver for one collection token');

  cmd
    .requiredOption('--contract <address>', 'collection contract address')
    .requiredOption('--token-id <id>', 'token ID to update')
    .requiredOption('--receiver <address>', 'new token royalty receiver')
    .option('--registry <address>', 'royalty registry address (defaults to the protocol registry)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: CollectionRoyaltyRegistryTokenReceiverOptions) => {
      const contract = parseAddressOption(opts.contract, '--contract');
      const receiver = parseAddressOption(opts.receiver, '--receiver');
      const registry = parseOptionalAddressOption(opts.registry, '--registry');
      const { chain, rare } = createWriteCollectionClient(opts.chain, opts.chainId);

      log(`Setting royalty registry token receiver on ${chain}...`);
      if (registry !== undefined) log(`  Registry: ${registry}`);
      log(`  Contract: ${contract}`);
      log(`  Token ID: ${opts.tokenId}`);
      log(`  Receiver: ${receiver}`);
      log('Waiting for transaction confirmation...');

      const result = await rare.collection.setRoyaltyRegistryTokenReceiver({
        registry,
        contract,
        tokenId: opts.tokenId,
        receiver,
      });

      output(
        {
          txHash: result.txHash,
          blockNumber: result.receipt.blockNumber.toString(),
          registry: result.registry,
          contract: result.contract,
          tokenId: result.tokenId,
          receiver: result.receiver,
        },
        () => {
          console.log(`Transaction sent: ${result.txHash}`);
          console.log(`Token ${result.tokenId.toString()} royalty registry receiver set to: ${result.receiver}`);
        },
      );
    });

  return cmd;
}

function createRoyaltyRegistrySetContractPercentageCommand(): Command {
  const cmd = new Command('set-contract-percentage');
  cmd.description('Set a legacy RoyaltyRegistry percentage for a collection contract');

  cmd
    .requiredOption('--contract <address>', 'collection contract address')
    .requiredOption('--percentage <number>', 'royalty percentage, from 0 to 100')
    .option('--registry <address>', 'royalty registry address (defaults to the protocol registry)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: CollectionRoyaltyRegistryContractPercentageOptions) => {
      const contract = parseAddressOption(opts.contract, '--contract');
      const registry = parseOptionalAddressOption(opts.registry, '--registry');
      const { chain, rare } = createWriteCollectionClient(opts.chain, opts.chainId);

      log(`Setting royalty registry contract percentage on ${chain}...`);
      if (registry !== undefined) log(`  Registry: ${registry}`);
      log(`  Contract: ${contract}`);
      log(`  Percentage: ${opts.percentage}%`);
      log('Waiting for transaction confirmation...');

      const result = await rare.collection.setRoyaltyRegistryContractPercentage({
        registry,
        contract,
        percentage: opts.percentage,
      });

      output(
        {
          txHash: result.txHash,
          blockNumber: result.receipt.blockNumber.toString(),
          registry: result.registry,
          contract: result.contract,
          percentage: result.percentage,
        },
        () => {
          console.log(`Transaction sent: ${result.txHash}`);
          console.log(`Royalty registry contract percentage set to: ${result.percentage}%`);
        },
      );
    });

  return cmd;
}

function createRoyaltyRegistryCommand(): Command {
  const cmd = new Command('registry');
  cmd.description('Inspect and update legacy RoyaltyRegistry settings');
  cmd.addCommand(createRoyaltyRegistryStatusCommand());
  cmd.addCommand(createRoyaltyRegistrySetReceiverOverrideCommand());
  cmd.addCommand(createRoyaltyRegistrySetContractReceiverCommand());
  cmd.addCommand(createRoyaltyRegistrySetTokenReceiverCommand());
  cmd.addCommand(createRoyaltyRegistrySetContractPercentageCommand());
  return cmd;
}

function createRoyaltyCommand(): Command {
  const cmd = new Command('royalty');
  cmd.description('Inspect and update collection royalty receiver settings');
  cmd.addCommand(createRoyaltyStatusCommand());
  cmd.addCommand(createSetDefaultRoyaltyReceiverCommand());
  cmd.addCommand(createSetTokenRoyaltyReceiverCommand());
  cmd.addCommand(createRoyaltyRegistryCommand());
  return cmd;
}

function createMetadataStatusCommand(): Command {
  const cmd = new Command('status');
  cmd.description('Read Lazy Sovereign mint metadata configuration');

  cmd
    .requiredOption('--contract <address>', 'collection contract address')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: CollectionContractOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const { chain, rare } = createReadCollectionClient(opts.chain, opts.chainId);
        const result = await rare.collection.getMintConfig({ contract });

        output(
          {
            chain,
            contract: result.contract,
            baseUri: result.baseUri,
            tokenCount: result.tokenCount,
            lockedMetadata: result.lockedMetadata,
          },
          () => {
            console.log(`Base URI: ${result.baseUri}`);
            console.log(`Token count: ${result.tokenCount.toString()}`);
            console.log(`Locked metadata: ${result.lockedMetadata ? 'yes' : 'no'}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createUpdateBaseUriCommand(): Command {
  const cmd = new Command('update-base-uri');
  cmd.description('Update the Lazy Sovereign base metadata URI');

  cmd
    .requiredOption('--contract <address>', 'collection contract address')
    .requiredOption('--base-uri <uri>', 'new base URI')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: CollectionUpdateBaseUriOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const { chain, rare } = createWriteCollectionClient(opts.chain, opts.chainId);

        log(`Updating collection base URI on ${chain}...`);
        log(`  Contract: ${contract}`);
        log(`  Base URI: ${opts.baseUri}`);
        log('Waiting for transaction confirmation...');

        const result = await rare.collection.updateBaseUri({
          contract,
          baseUri: opts.baseUri,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            contract: result.contract,
            baseUri: result.baseUri,
          },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Base URI updated to: ${result.baseUri}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createUpdateTokenUriCommand(): Command {
  const cmd = new Command('update-token-uri');
  cmd.description('Update metadata URI for one Lazy Sovereign token');

  cmd
    .requiredOption('--contract <address>', 'collection contract address')
    .requiredOption('--token-id <id>', 'token ID to update')
    .requiredOption('--token-uri <uri>', 'new token metadata URI')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: CollectionUpdateTokenUriOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const { chain, rare } = createWriteCollectionClient(opts.chain, opts.chainId);

        log(`Updating token metadata URI on ${chain}...`);
        log(`  Contract: ${contract}`);
        log(`  Token ID: ${opts.tokenId}`);
        log(`  Token URI: ${opts.tokenUri}`);
        log('Waiting for transaction confirmation...');

        const result = await rare.collection.updateTokenUri({
          contract,
          tokenId: opts.tokenId,
          tokenUri: opts.tokenUri,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            contract: result.contract,
            tokenId: result.tokenId,
            tokenUri: result.tokenUri,
          },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Token ${result.tokenId.toString()} URI updated to: ${result.tokenUri}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createLockBaseUriCommand(): Command {
  const cmd = new Command('lock-base-uri');
  cmd.description('Lock Lazy Sovereign base metadata URI updates');

  cmd
    .requiredOption('--contract <address>', 'collection contract address')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: CollectionContractOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const { chain, rare } = createWriteCollectionClient(opts.chain, opts.chainId);

        log(`Locking collection base URI on ${chain}...`);
        log(`  Contract: ${contract}`);
        log('Waiting for transaction confirmation...');

        const result = await rare.collection.lockBaseUri({ contract });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            contract: result.contract,
            baseUri: result.baseUri,
          },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Base URI locked: ${result.baseUri}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createMetadataCommand(): Command {
  const cmd = new Command('metadata');
  cmd.description('Inspect and update Lazy Sovereign metadata settings');
  cmd.addCommand(createMetadataStatusCommand());
  cmd.addCommand(createUpdateBaseUriCommand());
  cmd.addCommand(createUpdateTokenUriCommand());
  cmd.addCommand(createLockBaseUriCommand());
  return cmd;
}

function createCollectionDeployCommand(): Command {
  const cmd = new Command('deploy');
  cmd.description('Deploy NFT collections through RARE factories');
  cmd.addCommand(deployErc721Command());
  cmd.addCommand(lazyBatchMintCmd());
  cmd.addCommand(createSovereignCollectionCommand());
  cmd.addCommand(createLazySovereignCollectionCommand());
  return cmd;
}

function createCollectionCreateCommand(): Command {
  const cmd = new Command('create');
  cmd.description('Create NFT collections through RARE factories');
  cmd.addCommand(lazyBatchMintCmd());
  cmd.addCommand(createSovereignCollectionCommand());
  cmd.addCommand(createLazySovereignCollectionCommand());
  return cmd;
}

export function collectionCommand(): Command {
  const cmd = new Command('collection');
  cmd.description('Create and manage NFT collections');
  cmd.addCommand(createCollectionListCommand());
  cmd.addCommand(createCollectionDeployCommand());
  cmd.addCommand(createCollectionCreateCommand());
  cmd.addCommand(mintCommand());
  cmd.addCommand(createMintBatchCommand());
  cmd.addCommand(createPrepareLazyMintCommand());
  cmd.addCommand(createTokenCreatorCommand());
  cmd.addCommand(createRoyaltyCommand());
  cmd.addCommand(createMetadataCommand());
  return cmd;
}

function createReadCollectionClient(chainInput: string | undefined, chainIdInput: string | undefined): CollectionCommandClient {
  const chain = getActiveChain(chainInput, chainIdInput);
  const publicClient = getPublicClient(chain);
  return {
    chain,
    rare: createRareClient({ publicClient }),
  };
}

function createWriteCollectionClient(chainInput: string | undefined, chainIdInput: string | undefined): CollectionCommandClient {
  const chain = getActiveChain(chainInput, chainIdInput);
  const { client } = getWalletClient(chain);
  const publicClient = getPublicClient(chain);
  return {
    chain,
    rare: createRareClient({ publicClient, walletClient: client }),
  };
}

function parseAddressOption(value: string, optionName: string): Address {
  if (!isAddress(value)) {
    throw new Error(`${optionName} must be a valid 0x address.`);
  }

  return getAddress(value);
}

function parseOptionalAddressOption(value: string | undefined, optionName: string): Address | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseAddressOption(value, optionName);
}
