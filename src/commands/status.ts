import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient } from '../client.js';
import { createRareClient } from '../sdk/client.js';
import { parseAddress } from '../sdk/validation.js';
import { output } from '../output.js';
import type { RareClient } from '../sdk/client.js';
import { toNonNegativeInteger } from '../sdk/amounts-core.js';

type StatusOptions = {
  contract: string;
  tokenId?: string;
  chain?: string;
  chainId?: string;
};

type TokenInfo = NonNullable<Awaited<ReturnType<RareClient['token']['status']>>['token']>;
type TokenReader = {
  token: Pick<RareClient['token'], 'status'>;
};

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

      const { contract: contractInfo } = await rare.token.status({ contract: contractAddress });
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
              console.log(`\nToken #${opts.tokenId}: not found`);
            }
          }
        },
      );

    });

  return cmd;
}

export async function readTokenInfo(
  rare: TokenReader,
  contract: `0x${string}`,
  tokenId: string,
): Promise<TokenInfo | null> {
  const normalizedTokenId = toNonNegativeInteger(tokenId, 'tokenId');
  try {
    const status = await rare.token.status({ contract, tokenId: normalizedTokenId });
    return status.token ?? null;
  } catch (error) {
    if (isTokenNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

function isTokenNotFoundError(error: unknown): boolean {
  return errorMessages(error).some((message) =>
    /nonexistent token/iu.test(message) ||
    /invalid token id/iu.test(message) ||
    /erc721nonexistenttoken/iu.test(message) ||
    /token (?:does not exist|not found)/iu.test(message) ||
    /not found.*token/iu.test(message)
  );
}

function errorMessages(error: unknown): string[] {
  if (!(error instanceof Error)) {
    return [];
  }

  return [
    error.message,
    ...stringArrayProperty(error, 'metaMessages'),
    ...errorMessages(error.cause),
  ];
}

function stringArrayProperty(value: object, key: string): string[] {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  const property = descriptor === undefined ? undefined : descriptor.value as unknown;
  return Array.isArray(property) && property.every((item) => typeof item === 'string') ? property : [];
}
