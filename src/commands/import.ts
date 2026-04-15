import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getWalletClient } from '../client.js';
import { chainIds } from '../contracts/addresses.js';
import { importErc721 } from '../sdk/api.js';
import { output, log } from '../output.js';

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

      log(`Importing ERC-721 contract...`);
      log(`  Chain:    ${chain} (${chainId})`);
      log(`  Contract: ${contractAddress}`);
      log(`  Owner:    ${ownerAddress}`);

      await importErc721({
        chainId,
        contract: contractAddress as `0x${string}`,
        owner: ownerAddress as `0x${string}`,
      });

      output(
        { imported: true, chain, chainId, contract: contractAddress, owner: ownerAddress },
        () => {
          console.log(`\nContract imported successfully.`);
        },
      );
    });

  return cmd;
}
