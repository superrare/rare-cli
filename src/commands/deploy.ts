import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { createRareClient } from '../sdk/client.js';

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

      console.log(`Deploying ERC-721 contract on ${chain}...`);
      console.log(`  Factory: ${rare.contracts.factory}`);
      console.log(`  Name: ${name}`);
      console.log(`  Symbol: ${symbol}`);
      if (opts.maxTokens) console.log(`  Max tokens: ${opts.maxTokens}`);
      console.log('Waiting for confirmation...');

      const result = await rare.deploy.erc721({
        name,
        symbol,
        maxTokens: opts.maxTokens,
      });
      console.log(`Transaction sent: ${result.txHash}`);

      if (result.contract) {
        console.log(`\nERC-721 contract deployed at: ${result.contract}`);
      } else {
        console.log(`\nTransaction confirmed. Block: ${result.receipt.blockNumber}`);
        console.log('Could not parse deployed address from logs.');
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
