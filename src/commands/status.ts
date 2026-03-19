import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient } from '../client.js';
import { createRareClient } from '../sdk/client.js';

export function statusCommand(): Command {
  const cmd = new Command('status');
  cmd.description('Query token contract information (read-only)');

  cmd
    .requiredOption('--contract <address>', 'token contract address')
    .option('--token-id <id>', 'token ID to query (optional)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient });
      const contractAddress = opts.contract as `0x${string}`;

      const contractInfo = await rare.token.getContractInfo({ contract: contractAddress });

      console.log('\nContract Info:');
      console.log(`  Address:      ${contractInfo.contract}`);
      console.log(`  Chain:        ${contractInfo.chain}`);
      console.log(`  Name:         ${contractInfo.name}`);
      console.log(`  Symbol:       ${contractInfo.symbol}`);
      console.log(`  Total Supply: ${contractInfo.totalSupply}`);

      if (opts.tokenId !== undefined) {
        try {
          const tokenInfo = await rare.token.getTokenInfo({
            contract: contractAddress,
            tokenId: opts.tokenId,
          });
          console.log(`\nToken #${tokenInfo.tokenId}:`);
          console.log(`  Owner:    ${tokenInfo.owner}`);
          console.log(`  URI:      ${tokenInfo.tokenUri}`);
        } catch (err) {
          console.log(`\nToken #${opts.tokenId}: not found or error reading token`);
        }
      }
    });

  return cmd;
}
