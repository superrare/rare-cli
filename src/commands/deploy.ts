import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { createRareClient } from '../sdk/client.js';
import { printError } from '../errors.js';
import { output, log } from '../output.js';

function deployErc721Command(): Command {
  const cmd = new Command('erc721');
  cmd.description('Deploy a new ERC-721 NFT contract via the RARE factory');

  cmd
    .argument('<name>', 'name of the NFT collection')
    .argument('<symbol>', 'symbol of the NFT collection')
    .option('--max-tokens <number>', 'maximum number of tokens (optional)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (name: string, symbol: string, opts: { maxTokens?: string; chain?: string }) => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Deploying ERC-721 contract on ${chain}...`);
      log(`  Factory: ${rare.contracts.factory}`);
      log(`  Name: ${name}`);
      log(`  Symbol: ${symbol}`);
      if (opts.maxTokens) log(`  Max tokens: ${opts.maxTokens}`);
      log('Waiting for confirmation...');

      try {
        const result = await rare.deploy.erc721({
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
            console.log(`\nERC-721 contract deployed at: ${result.contract}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

export function deployCommand(): Command {
  const cmd = new Command('deploy');
  cmd.description('Deploy a new contract via the RARE protocol');

  cmd.addCommand(deployErc721Command());

  return cmd;
}
