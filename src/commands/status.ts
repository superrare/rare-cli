import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient } from '../client.js';
import { tokenAbi } from '../contracts/abis/token.js';

export function statusCommand(): Command {
  const cmd = new Command('status');
  cmd.description('Query token contract information (read-only)');

  cmd
    .requiredOption('--contract <address>', 'token contract address')
    .option('--token-id <id>', 'token ID to query (optional)')
    .option('--chain <chain>', 'chain to use (sepolia or mainnet)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const publicClient = getPublicClient(chain);
      const contractAddress = opts.contract as `0x${string}`;

      const [name, symbol, totalSupply] = await Promise.all([
        publicClient.readContract({
          address: contractAddress,
          abi: tokenAbi,
          functionName: 'name',
        }),
        publicClient.readContract({
          address: contractAddress,
          abi: tokenAbi,
          functionName: 'symbol',
        }),
        publicClient.readContract({
          address: contractAddress,
          abi: tokenAbi,
          functionName: 'totalSupply',
        }),
      ]);

      console.log('\nContract Info:');
      console.log(`  Address:      ${contractAddress}`);
      console.log(`  Chain:        ${chain}`);
      console.log(`  Name:         ${name}`);
      console.log(`  Symbol:       ${symbol}`);
      console.log(`  Total Supply: ${totalSupply}`);

      if (opts.tokenId !== undefined) {
        const tokenId = BigInt(opts.tokenId);
        try {
          const [owner, uri] = await Promise.all([
            publicClient.readContract({
              address: contractAddress,
              abi: tokenAbi,
              functionName: 'ownerOf',
              args: [tokenId],
            }),
            publicClient.readContract({
              address: contractAddress,
              abi: tokenAbi,
              functionName: 'tokenURI',
              args: [tokenId],
            }),
          ]);
          console.log(`\nToken #${opts.tokenId}:`);
          console.log(`  Owner:    ${owner}`);
          console.log(`  URI:      ${uri}`);
        } catch (err) {
          console.log(`\nToken #${opts.tokenId}: not found or error reading token`);
        }
      }
    });

  return cmd;
}
