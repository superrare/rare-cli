import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getWalletClient } from '../client.js';
import { chainIds } from '../contracts/addresses.js';
import { importErc721 } from '../ipfs.js';

export function importCommand(): Command {
  const cmd = new Command('import');
  cmd.description('Import contracts into the RARE Protocol registry');

  cmd
    .command('erc721')
    .description('Import an ERC-721 contract')
    .requiredOption('--contract <address>', 'contract address to import')
    .option('--chain <chain>', 'chain the contract is deployed on')
    .action(async (opts) => {
      const chain = getActiveChain(opts.chain);
      const ownerAddress = getWalletClient(chain).account.address;
      const contractAddress = opts.contract as string;
      const chainId = chainIds[chain];

      console.log(`Importing ERC-721 contract...`);
      console.log(`  Chain:    ${chain} (${chainId})`);
      console.log(`  Contract: ${contractAddress}`);
      console.log(`  Owner:    ${ownerAddress}`);

      await importErc721({
        chainId,
        contractAddress,
        ownerAddress,
      });

      console.log(`\nContract imported successfully.`);
    });

  return cmd;
}
