import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { createRareClient } from '../sdk/client.js';
import { printError } from '../errors.js';
import { output, log } from '../output.js';

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
    .action(
      async (
        name: string,
        symbol: string,
        opts: { maxTokens?: string; chain?: string; chainId?: string },
      ) => {
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

        try {
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
        } catch (error) {
          printError(error);
        }
      },
    );

  return cmd;
}

function collectionCreateCmd(): Command {
  const cmd = new Command('create');
  cmd.description('Create a new collection');
  cmd.addCommand(lazyBatchMintCmd());
  return cmd;
}

export function collectionCommand(): Command {
  const cmd = new Command('collection');
  cmd.description('Collection management subcommands');
  cmd.addCommand(collectionCreateCmd());
  return cmd;
}
