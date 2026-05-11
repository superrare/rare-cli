import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { createRareClient } from '../sdk/client.js';
import { requireContractAddress } from '../contracts/addresses.js';
import { normalizeSovereignCollectionContractType, sovereignCollectionContractTypes } from '../sdk/collection-core.js';
import { printError } from '../errors.js';
import { output, log } from '../output.js';

type CreateSovereignOptions = {
  maxTokens?: string;
  contractType?: string;
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

function createCollectionCreateCommand(): Command {
  const cmd = new Command('create');
  cmd.description('Create NFT collections through RARE factories');
  cmd.addCommand(createSovereignCollectionCommand());
  return cmd;
}

export function collectionCommand(): Command {
  const cmd = new Command('collection');
  cmd.description('Create and manage NFT collections');
  cmd.addCommand(createCollectionCreateCommand());
  return cmd;
}
