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
    .option('--royalty-receiver <address>', 'royalty receiver address')
    .option('--chain <chain>', 'chain to use (sepolia or mainnet)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const { client, account } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const contractAddress = opts.contract as `0x${string}`;

      console.log(`Minting NFT on ${chain}...`);
      console.log(`  Contract: ${contractAddress}`);
      console.log(`  URI: ${opts.uri}`);
      if (opts.to) console.log(`  To: ${opts.to}`);
      if (opts.royaltyReceiver) console.log(`  Royalty receiver: ${opts.royaltyReceiver}`);

      let txHash: `0x${string}`;

      if (opts.to && opts.royaltyReceiver) {
        txHash = await client.writeContract({
          address: contractAddress,
          abi: tokenAbi,
          functionName: 'mintToWithRoyaltyRecipient',
          args: [opts.to as `0x${string}`, opts.uri, opts.royaltyReceiver as `0x${string}`],
          account,
          chain: undefined,
        });
      } else if (opts.to) {
        txHash = await client.writeContract({
          address: contractAddress,
          abi: tokenAbi,
          functionName: 'mintTo',
          args: [opts.to as `0x${string}`, opts.uri],
          account,
          chain: undefined,
        });
      } else if (opts.royaltyReceiver) {
        txHash = await client.writeContract({
          address: contractAddress,
          abi: tokenAbi,
          functionName: 'addNewTokenWithRoyaltyRecipient',
          args: [opts.uri, opts.royaltyReceiver as `0x${string}`],
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

      // Parse Transfer event to get token ID
      const { parseEventLogs } = await import('viem');
      const logs = parseEventLogs({
        abi: tokenAbi,
        logs: receipt.logs,
        eventName: 'Transfer',
      });

      if (logs.length > 0) {
        const tokenId = logs[0].args.tokenId;
        console.log(`\nNFT minted! Token ID: ${tokenId}`);
      } else {
        console.log(`\nTransaction confirmed. Block: ${receipt.blockNumber}`);
      }
    });

  return cmd;
}
