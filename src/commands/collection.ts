import { Command } from 'commander';
import { getAddress, isAddress, type Address } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { createRareClient } from '../sdk/client.js';
import { requireContractAddress, type SupportedChain } from '../contracts/addresses.js';
import type { RareClient } from '../sdk/client.js';
import {
  lazySovereignCollectionContractTypes,
  normalizeLazySovereignCollectionContractType,
  planCollectionMintBatch,
  planCollectionPrepareLazyMint,
  planCollectionRoyaltyPercentage,
  planCollectionTokenReceiver,
  planCollectionTokenUri,
} from '../sdk/collection-core.js';
import { toPositiveInteger } from '../sdk/amounts-core.js';
import { printError } from '../errors.js';
import { output, log, printCollection } from '../output.js';
import { createCollectionListCommand } from './account-market-list.js';
import { mintCommand } from './mint.js';
import { deployErc721Command } from './deploy.js';

type LazyBatchMintOptions = {
  maxTokens?: string;
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
  chain?: string;
  chainId?: string;
};

type CollectionPrepareLazyMintOptions = {
  contract: string;
  baseUri: string;
  amount?: string;
  minter?: string;
  chain?: string;
  chainId?: string;
};

type CollectionTokenOptions = {
  contract: string;
  tokenId: string;
  chain?: string;
  chainId?: string;
};

type CollectionRoyaltyStatusOptions = CollectionTokenOptions & {
  price?: string;
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

type CollectionRoyaltyPercentageOptions = {
  contract: string;
  percentage: string;
  chain?: string;
  chainId?: string;
};

type CollectionContractOptions = {
  contract: string;
  chain?: string;
  chainId?: string;
};

type CollectionReadOptions = {
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
    .action(async (name: string, symbol: string, opts: LazyBatchMintOptions): Promise<void> => {
      const maxTokens = opts.maxTokens === undefined ? undefined : toPositiveInteger(opts.maxTokens, 'maxTokens');
      const chain = getActiveChain(opts.chain, opts.chainId);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Deploying Lazy Sovereign Batch Mint collection on ${chain}...`);
      log(`  Name: ${name}`);
      log(`  Symbol: ${symbol}`);
      if (maxTokens !== undefined) log(`  Max tokens: ${maxTokens.toString()}`);
      else log(`  Max tokens: uncapped`);
      log('Waiting for transaction confirmation...');

      const result = await rare.collection.deploy.lazyBatchMint({
        name,
        symbol,
        maxTokens,
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

function deployLazyErc721CollectionCommand(): Command {
  const cmd = new Command('lazy-erc721');
  cmd.description('Deploy a Lazy ERC-721 collection for RareMinter release minting');

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
    .action(async (name: string, symbol: string, opts: CreateLazySovereignOptions): Promise<void> => {
      const contractType = normalizeLazySovereignCollectionContractType(opts.contractType);
      const maxTokens = toPositiveInteger(opts.maxTokens, 'maxTokens');
      const chain = getActiveChain(opts.chain, opts.chainId);
      const factoryAddress = requireContractAddress(chain, 'lazySovereignFactory');
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Deploying Lazy ERC-721 collection on ${chain}...`);
      log(`  Name: ${name}`);
      log(`  Symbol: ${symbol}`);
      log(`  Contract type: ${contractType ?? 'lazy'}`);
      log(`  Factory: ${factoryAddress}`);
      log(`  Max tokens: ${maxTokens.toString()}`);
      log('Waiting for transaction confirmation...');

      try {
        const result = await rare.collection.deploy.lazyErc721({
          name,
          symbol,
          maxTokens,
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
            console.log(`\nLazy ERC-721 collection deployed at: ${result.contract}`);
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
    .requiredOption('--amount <number>', 'number of tokens to mint')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: CollectionMintBatchOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const amount = opts.amount;
        if (amount === undefined) {
          throw new Error('collection mint-batch requires --amount.');
        }
        const plan = planCollectionMintBatch({ contract, baseUri: opts.baseUri, amount });
        const chain = getActiveChain(opts.chain, opts.chainId);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });

        log(`Batch minting collection tokens on ${chain}...`);
        log(`  Contract: ${contract}`);
        log(`  Base URI: ${opts.baseUri}`);
        log(`  Amount: ${plan.tokenCount.toString()}`);
        log('Waiting for transaction confirmation...');

        const result = await rare.collection.mintBatch({
          contract,
          baseUri: opts.baseUri,
          amount: plan.tokenCount,
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
    .requiredOption('--amount <number>', 'number of tokens to prepare')
    .option('--minter <address>', 'optional approved minter address')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: CollectionPrepareLazyMintOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const amount = opts.amount;
        if (amount === undefined) {
          throw new Error('collection prepare-lazy-mint requires --amount.');
        }
        const minter = opts.minter === undefined
          ? undefined
          : parseAddressOption(opts.minter, '--minter');
        const plan = planCollectionPrepareLazyMint({ contract, baseUri: opts.baseUri, amount, minter });
        const chain = getActiveChain(opts.chain, opts.chainId);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });

        log(`Preparing Lazy Sovereign mint on ${chain}...`);
        log(`  Contract: ${contract}`);
        log(`  Base URI: ${opts.baseUri}`);
        log(`  Amount: ${plan.tokenCount.toString()}`);
        if (minter !== undefined) log(`  Minter: ${minter}`);
        log('Waiting for transaction confirmation...');

        const result = await rare.collection.prepareLazyMint({
          contract,
          baseUri: opts.baseUri,
          amount: plan.tokenCount,
          minter,
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
        const result = await rare.collection.royalty.status({
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

function createSetDefaultRoyaltyPercentageCommand(): Command {
  const cmd = new Command('set-default-percentage');
  cmd.description('Set the default royalty percentage for a Sovereign-style collection');

  cmd
    .requiredOption('--contract <address>', 'collection contract address')
    .requiredOption('--percentage <number>', 'royalty percentage, from 0 to 100')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: CollectionRoyaltyPercentageOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const plan = planCollectionRoyaltyPercentage({ contract, percentage: opts.percentage });
        const { chain, rare } = createWriteCollectionClient(opts.chain, opts.chainId);

        log(`Setting default royalty percentage on ${chain}...`);
        log(`  Contract: ${contract}`);
        log(`  Percentage: ${plan.percentage}%`);
        log('Waiting for transaction confirmation...');

        const result = await rare.collection.setDefaultRoyaltyPercentage({
          contract,
          percentage: plan.percentage,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            contract: result.contract,
            percentage: result.percentage,
          },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Default royalty percentage set to: ${result.percentage}%`);
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
        const plan = planCollectionTokenReceiver({ contract, tokenId: opts.tokenId, receiver });
        const { chain, rare } = createWriteCollectionClient(opts.chain, opts.chainId);

        log(`Setting token royalty receiver on ${chain}...`);
        log(`  Contract: ${plan.contract}`);
        log(`  Token ID: ${plan.tokenId.toString()}`);
        log(`  Receiver: ${plan.receiver}`);
        log('Waiting for transaction confirmation...');

        const result = await rare.collection.setTokenRoyaltyReceiver({
          contract: plan.contract,
          tokenId: plan.tokenId,
          receiver: plan.receiver,
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
  cmd.addCommand(createSetDefaultRoyaltyPercentageCommand());
  cmd.addCommand(createSetTokenRoyaltyReceiverCommand());
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
        const result = await rare.collection.metadata.status({ contract });

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
        const plan = planCollectionTokenUri({ contract, tokenId: opts.tokenId, tokenUri: opts.tokenUri });
        const { chain, rare } = createWriteCollectionClient(opts.chain, opts.chainId);

        log(`Updating token metadata URI on ${chain}...`);
        log(`  Contract: ${plan.contract}`);
        log(`  Token ID: ${plan.tokenId.toString()}`);
        log(`  Token URI: ${plan.tokenUri}`);
        log('Waiting for transaction confirmation...');

        const result = await rare.collection.updateTokenUri({
          contract: plan.contract,
          tokenId: plan.tokenId,
          tokenUri: plan.tokenUri,
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
  cmd.addCommand(deployLazyErc721CollectionCommand());
  cmd.addCommand(lazyBatchMintCmd());
  return cmd;
}

export function collectionCommand(): Command {
  const cmd = new Command('collection');
  cmd.description('Create and manage NFT collections');
  cmd.addCommand(createCollectionGetCommand());
  cmd.addCommand(createCollectionListCommand());
  cmd.addCommand(createCollectionDeployCommand());
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

function createCollectionGetCommand(): Command {
  const cmd = new Command('get');
  cmd.description('Get a collection by ID');

  cmd
    .argument('<id>', 'collection ID')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (id: string, opts: CollectionReadOptions): Promise<void> => {
      const { rare } = createReadCollectionClient(opts.chain, opts.chainId);

      log(`Fetching collection ${id}...`);

      try {
        const result = await rare.collection.get(id);
        output(result, () => {
          printCollection(result);
        });
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
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
