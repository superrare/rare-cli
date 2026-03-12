import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { getContractAddresses } from '../contracts/addresses.js';
import { factoryAbi } from '../contracts/abis/factory.js';

function deployErc721Command(): Command {
  const cmd = new Command('erc721');
  cmd.description('Deploy a new ERC-721 NFT contract via the RARE factory');

  cmd
    .argument('<name>', 'name of the NFT collection')
    .argument('<symbol>', 'symbol of the NFT collection')
    .option('--max-tokens <number>', 'maximum number of tokens (optional)')
    .option('--chain <chain>', 'chain to use (sepolia or mainnet)')
    .action(async (name: string, symbol: string, opts: { maxTokens?: string; chain?: string }) => {
      const chain = getActiveChain(opts.chain);
      const { client, account } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const factoryAddress = getContractAddresses(chain).factory;

      console.log(`Deploying ERC-721 contract on ${chain}...`);
      console.log(`  Factory: ${factoryAddress}`);
      console.log(`  Name: ${name}`);
      console.log(`  Symbol: ${symbol}`);
      if (opts.maxTokens) console.log(`  Max tokens: ${opts.maxTokens}`);

      let txHash: `0x${string}`;
      if (opts.maxTokens) {
        txHash = await client.writeContract({
          address: factoryAddress,
          abi: factoryAbi,
          functionName: 'createSovereignBatchMint',
          args: [name, symbol, BigInt(opts.maxTokens)],
          account,
          chain: undefined,
        });
      } else {
        txHash = await client.writeContract({
          address: factoryAddress,
          abi: factoryAbi,
          functionName: 'createSovereignBatchMint',
          args: [name, symbol],
          account,
          chain: undefined,
        });
      }

      console.log(`Transaction sent: ${txHash}`);
      console.log('Waiting for confirmation...');

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      const { parseEventLogs } = await import('viem');
      const logs = parseEventLogs({
        abi: factoryAbi,
        logs: receipt.logs,
        eventName: 'SovereignBatchMintCreated',
      });

      if (logs.length > 0) {
        const deployedAddress = logs[0].args.contractAddress;
        console.log(`\nERC-721 contract deployed at: ${deployedAddress}`);
      } else {
        console.log(`\nTransaction confirmed. Block: ${receipt.blockNumber}`);
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
