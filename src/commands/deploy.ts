import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { contractAddresses } from '../contracts/addresses.js';
import { factoryAbi } from '../contracts/abis/factory.js';

export function deployCommand(): Command {
  const cmd = new Command('deploy');
  cmd.description('Deploy a new NFT contract via the RARE factory');

  cmd
    .requiredOption('--name <name>', 'name of the NFT collection')
    .requiredOption('--symbol <symbol>', 'symbol of the NFT collection')
    .option('--max-tokens <number>', 'maximum number of tokens (optional)')
    .option('--chain <chain>', 'chain to use (sepolia or mainnet)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client, account } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const factoryAddress = contractAddresses[chain].factory;

      console.log(`Deploying NFT contract on ${chain}...`);
      console.log(`  Factory: ${factoryAddress}`);
      console.log(`  Name: ${opts.name}`);
      console.log(`  Symbol: ${opts.symbol}`);
      if (opts.maxTokens) console.log(`  Max tokens: ${opts.maxTokens}`);

      let txHash: `0x${string}`;
      if (opts.maxTokens) {
        txHash = await client.writeContract({
          address: factoryAddress,
          abi: factoryAbi,
          functionName: 'createSovereignNFTContractWithMaxTokens',
          args: [opts.name, opts.symbol, BigInt(opts.maxTokens)],
          account,
          chain: undefined,
        });
      } else {
        txHash = await client.writeContract({
          address: factoryAddress,
          abi: factoryAbi,
          functionName: 'createSovereignNFTContract',
          args: [opts.name, opts.symbol],
          account,
          chain: undefined,
        });
      }

      console.log(`Transaction sent: ${txHash}`);
      console.log('Waiting for confirmation...');

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      // Parse the SovereignNFTContractCreated event to get deployed address
      const { parseEventLogs } = await import('viem');
      const logs = parseEventLogs({
        abi: factoryAbi,
        logs: receipt.logs,
        eventName: 'SovereignNFTContractCreated',
      });

      if (logs.length > 0) {
        const deployedAddress = logs[0].args.contractAddress;
        console.log(`\nNFT contract deployed at: ${deployedAddress}`);
      } else {
        console.log(`\nTransaction confirmed. Block: ${receipt.blockNumber}`);
        console.log('Could not parse deployed address from logs.');
      }
    });

  return cmd;
}
