import { Command } from 'commander';
import { getAddress, isAddress, type Address } from 'viem';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { createRareClient } from '../sdk/client.js';
import { requireContractAddress } from '../contracts/addresses.js';
import {
  lazySovereignCollectionContractTypes,
  normalizeLazySovereignCollectionContractType,
  normalizeSovereignCollectionContractType,
  sovereignCollectionContractTypes,
} from '../sdk/collection-core.js';
import { printError } from '../errors.js';
import { output, log } from '../output.js';

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
    .action(async (name: string, symbol: string, opts: CreateSovereignOptions) => {
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
    .action(async (name: string, symbol: string, opts: CreateLazySovereignOptions) => {
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

function createCollectionCreateCommand(): Command {
  const cmd = new Command('create');
  cmd.description('Create NFT collections through RARE factories');
  cmd.addCommand(createSovereignCollectionCommand());
  cmd.addCommand(createLazySovereignCollectionCommand());
  return cmd;
}

export function collectionCommand(): Command {
  const cmd = new Command('collection');
  cmd.description('Create and manage NFT collections');
  cmd.addCommand(createCollectionCreateCommand());
  cmd.addCommand(createMintBatchCommand());
  cmd.addCommand(createPrepareLazyMintCommand());
  return cmd;
}

function parseAddressOption(value: string, optionName: string): Address {
  if (!isAddress(value)) {
    throw new Error(`${optionName} must be a valid 0x address.`);
  }

  return getAddress(value);
}
