import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient } from '../client.js';
import { createRareClient } from '../sdk/client.js';
import type { NftIdentityParams } from '../sdk/nft-core.js';
import { parseAddress } from '../sdk/validation.js';
import { chainIds } from '../contracts/addresses.js';
import { printError } from '../errors.js';
import { log, output, printNft } from '../output.js';

type NftReadOptions = {
  chain?: string;
  chainId?: string;
  contract: string;
  tokenId: string;
};

export function nftCommand(): Command {
  const cmd = new Command('nft');
  cmd.description('Read NFT data from the RARE Protocol API');

  cmd
    .command('get')
    .description('Get an NFT by chain, contract, and token ID')
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: NftReadOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const rare = createRareClient({ publicClient: getPublicClient(chain) });
      const nft = parseNftIdentityOptions(opts, chainIds[chain]);

      log(`Fetching NFT ${nft.contract}/${nft.tokenId.toString()} on ${nft.chainId?.toString() ?? chain}...`);

      try {
        const result = await rare.nft.get(nft);
        output(result, () => {
          printNft(result);
        });
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function parseNftIdentityOptions(
  opts: NftReadOptions,
  defaultChainId: number,
): NftIdentityParams {
  return {
    chainId: opts.chainId ?? defaultChainId,
    contract: parseAddress(opts.contract, '--contract'),
    tokenId: opts.tokenId,
  };
}
