import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient } from '../client.js';
import { createRareClient } from '../sdk/client.js';
import { parseAddress } from '../sdk/validation.js';
import { printError } from '../errors.js';
import { output } from '../output.js';
import type { RareClient } from '../sdk/types.js';

type StatusOptions = {
  contract: string;
  tokenId?: string;
  chain?: string;
  chainId?: string;
};

type TokenInfo = Awaited<ReturnType<RareClient['token']['getTokenInfo']>>;

export function statusCommand(): Command {
  const cmd = new Command('status');
  cmd.description('Query token contract information (read-only)');

  cmd
    .requiredOption('--contract <address>', 'token contract address')
    .option('--token-id <id>', 'token ID to query (optional)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: StatusOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient });
      const contractAddress = parseAddress(opts.contract, '--contract');

      try {
        const contractInfo = await rare.token.getContractInfo({ contract: contractAddress });
        const tokenInfo = opts.tokenId === undefined
          ? undefined
          : await readTokenInfo(rare, contractAddress, opts.tokenId);

        output(
          {
            contract: contractInfo,
            ...(opts.tokenId !== undefined ? { token: tokenInfo } : {}),
          },
          () => {
            console.log('\nContract Info:');
            console.log(`  Address:      ${contractInfo.contract}`);
            console.log(`  Chain:        ${contractInfo.chain}`);
            console.log(`  Name:         ${contractInfo.name}`);
            console.log(`  Symbol:       ${contractInfo.symbol}`);
            console.log(`  Total Supply: ${contractInfo.totalSupply?.toString() ?? 'unavailable'}`);

            if (opts.tokenId !== undefined) {
              if (tokenInfo) {
                console.log(`\nToken #${tokenInfo.tokenId}:`);
                console.log(`  Owner:    ${tokenInfo.owner}`);
                console.log(`  URI:      ${tokenInfo.tokenUri}`);
              } else {
                console.log(`\nToken #${opts.tokenId}: not found or error reading token`);
              }
            }
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

async function readTokenInfo(
  rare: RareClient,
  contract: `0x${string}`,
  tokenId: string,
): Promise<TokenInfo | null> {
  try {
    return await rare.token.getTokenInfo({ contract, tokenId });
  } catch {
    return null;
  }
}
