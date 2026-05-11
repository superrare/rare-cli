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

type LazyBatchMintOptions = {
  maxTokens?: string;
  chain?: string;
  chainId?: string;
};

type CreateSovereignOptions = {
  maxTokens?: string;
  contractType?: string;
  chain?: string;
};

type CreateLazySovereignOptions = {
  maxTokens: string;
  contractType?: string;
  chain?: string;
};

type CollectionMintBatchOptions = {
  contract: string;
  baseUri: string;
  tokenCount: string;
  chain?: string;
};

type CollectionPrepareLazyMintOptions = {
  contract: string;
  baseUri: string;
  tokenCount: string;
  minter?: string;
  chain?: string;
};

type CollectionMintSpaceOptions = {
  contract: string;
  tokenUri: string;
  to?: string;
  royaltyReceiver?: string;
  chain?: string;
};

type CollectionTokenOptions = {
  contract: string;
  tokenId: string;
  chain?: string;
};

type CollectionRoyaltyStatusOptions = CollectionTokenOptions & {
  salePrice?: string;
};

type CollectionRoyaltyReceiverOptions = {
  contract: string;
  receiver: string;
  chain?: string;
};

type CollectionTokenRoyaltyReceiverOptions = CollectionRoyaltyReceiverOptions & {
  tokenId: string;
};

type CollectionContractOptions = {
  contract: string;
  chain?: string;
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
      log('Waiting for confirmation...');

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
    .action(async (name: string, symbol: string, opts: CreateSovereignOptions): Promise<void> => {
      const contractType = normalizeSovereignCollectionContractType(opts.contractType);
      const chain = getActiveChain(opts.chain);
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
      log('Waiting for confirmation...');

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
    .action(async (name: string, symbol: string, opts: CreateLazySovereignOptions): Promise<void> => {
      const contractType = normalizeLazySovereignCollectionContractType(opts.contractType);
      const chain = getActiveChain(opts.chain);
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
      log('Waiting for confirmation...');

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
    .requiredOption('--token-count <number>', 'number of tokens to mint')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: CollectionMintBatchOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const chain = getActiveChain(opts.chain);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });

        log(`Batch minting collection tokens on ${chain}...`);
        log(`  Contract: ${contract}`);
        log(`  Base URI: ${opts.baseUri}`);
        log(`  Token count: ${opts.tokenCount}`);
        log('Waiting for confirmation...');

        const result = await rare.collection.mintBatch({
          contract,
          baseUri: opts.baseUri,
          tokenCount: opts.tokenCount,
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
    .requiredOption('--token-count <number>', 'number of tokens to prepare')
    .option('--minter <address>', 'optional approved minter address')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: CollectionPrepareLazyMintOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const minter = opts.minter === undefined
          ? undefined
          : parseAddressOption(opts.minter, '--minter');
        const chain = getActiveChain(opts.chain);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });

        log(`Preparing Lazy Sovereign mint on ${chain}...`);
        log(`  Contract: ${contract}`);
        log(`  Base URI: ${opts.baseUri}`);
        log(`  Token count: ${opts.tokenCount}`);
        if (minter !== undefined) log(`  Minter: ${minter}`);
        log('Waiting for confirmation...');

        const result = await rare.collection.prepareLazyMint({
          contract,
          baseUri: opts.baseUri,
          tokenCount: opts.tokenCount,
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
    .action(async (opts: CollectionTokenOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const { chain, rare } = createReadCollectionClient(opts.chain);
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
    .option('--sale-price <raw>', 'raw sale price units used for the royalty quote')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: CollectionRoyaltyStatusOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const { chain, rare } = createReadCollectionClient(opts.chain);
        const result = await rare.collection.getRoyaltyInfo({
          contract,
          tokenId: opts.tokenId,
          salePrice: opts.salePrice,
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
    .action(async (opts: CollectionRoyaltyReceiverOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const receiver = parseAddressOption(opts.receiver, '--receiver');
        const { chain, rare } = createWriteCollectionClient(opts.chain);

        log(`Setting default royalty receiver on ${chain}...`);
        log(`  Contract: ${contract}`);
        log(`  Receiver: ${receiver}`);
        log('Waiting for confirmation...');

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
    .action(async (opts: CollectionTokenRoyaltyReceiverOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const receiver = parseAddressOption(opts.receiver, '--receiver');
        const { chain, rare } = createWriteCollectionClient(opts.chain);

        log(`Setting token royalty receiver on ${chain}...`);
        log(`  Contract: ${contract}`);
        log(`  Token ID: ${opts.tokenId}`);
        log(`  Receiver: ${receiver}`);
        log('Waiting for confirmation...');

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

function createRoyaltyCommand(): Command {
  const cmd = new Command('royalty');
  cmd.description('Inspect and update collection royalty receiver settings');
  cmd.addCommand(createRoyaltyStatusCommand());
  cmd.addCommand(createSetDefaultRoyaltyReceiverCommand());
  cmd.addCommand(createSetTokenRoyaltyReceiverCommand());
  return cmd;
}

function createMetadataStatusCommand(): Command {
  const cmd = new Command('status');
  cmd.description('Read Lazy Sovereign mint metadata configuration');

  cmd
    .requiredOption('--contract <address>', 'collection contract address')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: CollectionContractOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const { chain, rare } = createReadCollectionClient(opts.chain);
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
    .action(async (opts: CollectionUpdateBaseUriOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const { chain, rare } = createWriteCollectionClient(opts.chain);

        log(`Updating collection base URI on ${chain}...`);
        log(`  Contract: ${contract}`);
        log(`  Base URI: ${opts.baseUri}`);
        log('Waiting for confirmation...');

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
    .action(async (opts: CollectionUpdateTokenUriOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const { chain, rare } = createWriteCollectionClient(opts.chain);

        log(`Updating token metadata URI on ${chain}...`);
        log(`  Contract: ${contract}`);
        log(`  Token ID: ${opts.tokenId}`);
        log(`  Token URI: ${opts.tokenUri}`);
        log('Waiting for confirmation...');

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
    .action(async (opts: CollectionContractOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const { chain, rare } = createWriteCollectionClient(opts.chain);

        log(`Locking collection base URI on ${chain}...`);
        log(`  Contract: ${contract}`);
        log('Waiting for confirmation...');

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

function createRareSpaceCollectionCommand(): Command {
  const cmd = new Command('space');
  cmd.description('Create a RareSpace NFT collection');

  cmd
    .argument('<name>', 'name of the RareSpace collection')
    .argument('<symbol>', 'symbol of the RareSpace collection')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (name: string, symbol: string, opts: { chain?: string }) => {
      try {
        const chain = getActiveChain(opts.chain);
        const factoryAddress = requireContractAddress(chain, 'spaceFactory');
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });

        log(`Creating RareSpace collection on ${chain}...`);
        log(`  Name: ${name}`);
        log(`  Symbol: ${symbol}`);
        log(`  Factory: ${factoryAddress}`);
        log('Waiting for confirmation...');

        const result = await rare.collection.createSpace({ name, symbol });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            contract: result.contract,
            factory: result.factory,
            operator: result.operator,
          },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`\nRareSpace collection created at: ${result.contract}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createMintSpaceCommand(): Command {
  const cmd = new Command('mint-space');
  cmd.description('Mint a token from a RareSpace collection');

  cmd
    .requiredOption('--contract <address>', 'RareSpace collection contract address')
    .requiredOption('--token-uri <uri>', 'token metadata URI')
    .option('--to <address>', 'token receiver address')
    .option('--royalty-receiver <address>', 'royalty receiver address')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: CollectionMintSpaceOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const to = opts.to === undefined ? undefined : parseAddressOption(opts.to, '--to');
        const royaltyReceiver = opts.royaltyReceiver === undefined
          ? undefined
          : parseAddressOption(opts.royaltyReceiver, '--royalty-receiver');
        const { chain, rare } = createWriteCollectionClient(opts.chain);

        log(`Minting RareSpace token on ${chain}...`);
        log(`  Contract: ${contract}`);
        log(`  Token URI: ${opts.tokenUri}`);
        if (to !== undefined) log(`  Receiver: ${to}`);
        if (royaltyReceiver !== undefined) log(`  Royalty receiver: ${royaltyReceiver}`);
        log('Waiting for confirmation...');

        const result = await rare.collection.mintSpace({
          contract,
          tokenUri: opts.tokenUri,
          to,
          royaltyReceiver,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            contract: result.contract,
            tokenId: result.tokenId,
            tokenUri: result.tokenUri,
            to: result.to,
            royaltyReceiver: result.royaltyReceiver,
          },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Minted RareSpace token ID: ${result.tokenId.toString()}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createCollectionCreateCommand(): Command {
  const cmd = new Command('create');
  cmd.description('Create NFT collections through RARE factories');
  cmd.addCommand(lazyBatchMintCmd());
  cmd.addCommand(createSovereignCollectionCommand());
  cmd.addCommand(createLazySovereignCollectionCommand());
  cmd.addCommand(createRareSpaceCollectionCommand());
  return cmd;
}

export function collectionCommand(): Command {
  const cmd = new Command('collection');
  cmd.description('Create and manage NFT collections');
  cmd.addCommand(createCollectionCreateCommand());
  cmd.addCommand(createMintBatchCommand());
  cmd.addCommand(createPrepareLazyMintCommand());
  cmd.addCommand(createTokenCreatorCommand());
  cmd.addCommand(createRoyaltyCommand());
  cmd.addCommand(createMetadataCommand());
  cmd.addCommand(createMintSpaceCommand());
  return cmd;
}

function createReadCollectionClient(chainInput: string | undefined): CollectionCommandClient {
  const chain = getActiveChain(chainInput);
  const publicClient = getPublicClient(chain);
  return {
    chain,
    rare: createRareClient({ publicClient }),
  };
}

function createWriteCollectionClient(chainInput: string | undefined): CollectionCommandClient {
  const chain = getActiveChain(chainInput);
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
