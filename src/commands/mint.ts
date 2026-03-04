import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { tokenAbi } from '../contracts/abis/token.js';

export function mintCommand(): Command {
  const cmd = new Command('mint');
  cmd.description('Mint a new NFT on a deployed token contract');

  cmd
    .requiredOption('--contract <address>', 'token contract address')
    .requiredOption('--uri <uri>', 'token metadata URI')
    .option('--to <address>', 'recipient address (defaults to caller)')
    .option('--royalty-receiver <address>', 'royalty receiver address (defaults to caller)')
    .option('--chain <chain>', 'chain to use (sepolia or mainnet)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client, account } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const contractAddress = opts.contract as `0x${string}`;
      const useMintTo = opts.to || opts.royaltyReceiver;

      console.log(`Minting NFT on ${chain}...`);
      console.log(`  Contract: ${contractAddress}`);
      console.log(`  URI: ${opts.uri}`);

      let txHash: `0x${string}`;

      if (useMintTo) {
        const receiver = (opts.to ?? account.address) as `0x${string}`;
        const royaltyReceiver = (opts.royaltyReceiver ?? account.address) as `0x${string}`;
        console.log(`  To: ${receiver}`);
        console.log(`  Royalty receiver: ${royaltyReceiver}`);
        txHash = await client.writeContract({
          address: contractAddress,
          abi: tokenAbi,
          functionName: 'mintTo',
          args: [opts.uri, receiver, royaltyReceiver],
          account,
          chain: undefined,
        });
      } else {
        txHash = await client.writeContract({
          address: contractAddress,
          abi: tokenAbi,
          functionName: 'addNewToken',
          args: [opts.uri],
          account,
          chain: undefined,
        });
      }

      console.log(`Transaction sent: ${txHash}`);
      console.log('Waiting for confirmation...');

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      const { parseEventLogs } = await import('viem');
      const logs = parseEventLogs({
        abi: tokenAbi,
        logs: receipt.logs,
        eventName: 'Transfer',
      });

      if (logs.length > 0) {
        console.log(`\nNFT minted! Token ID: ${logs[0].args.tokenId}`);
      } else {
        console.log(`\nTransaction confirmed. Block: ${receipt.blockNumber}`);
      }
    });

  return cmd;
}
