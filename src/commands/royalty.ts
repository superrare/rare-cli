import { Command } from 'commander';
import { getAddress, isAddress, type Address } from 'viem';
import { getPublicClient, getWalletClient } from '../client.js';
import { getActiveChain } from '../config.js';
import { createRareClient } from '../sdk/client.js';
import type { SupportedChain } from '../contracts/addresses.js';
import type { RareClient } from '../sdk/client.js';
import { printError } from '../errors.js';
import { output, log } from '../output.js';

type RoyaltyStatusOptions = {
  contract: string;
  tokenId: string;
  price?: string;
  chain?: string;
  chainId?: string;
};

type RoyaltyOverrideOptions = {
  contract: string;
  lookup: string;
  chain?: string;
  chainId?: string;
};

type RoyaltyClient = {
  chain: SupportedChain;
  rare: RareClient;
};

function createReadClient(chainInput: string | undefined, chainIdInput: string | undefined): RoyaltyClient {
  const chain = getActiveChain(chainInput, chainIdInput);
  const publicClient = getPublicClient(chain);
  return { chain, rare: createRareClient({ publicClient }) };
}

function createWriteClient(chainInput: string | undefined, chainIdInput: string | undefined): RoyaltyClient {
  const chain = getActiveChain(chainInput, chainIdInput);
  const { client } = getWalletClient(chain);
  const publicClient = getPublicClient(chain);
  return { chain, rare: createRareClient({ publicClient, walletClient: client }) };
}

function parseAddressOption(value: string, optionName: string): Address {
  if (!isAddress(value)) {
    throw new Error(`${optionName} must be a valid 0x address.`);
  }
  return getAddress(value);
}

function createStatusCommand(): Command {
  const cmd = new Command('status');
  cmd.description('Resolve royalty payouts via the Manifold royalty engine');

  cmd
    .requiredOption('--contract <address>', 'NFT contract address')
    .requiredOption('--token-id <id>', 'token ID to quote')
    .option('--price <wei>', 'sale price (raw integer units) used for the royalty quote', '10000')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: RoyaltyStatusOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const { chain, rare } = createReadClient(opts.chain, opts.chainId);

        const result = await rare.royalty.status({
          contract,
          tokenId: opts.tokenId,
          price: opts.price,
        });

        output(
          {
            chain,
            contract: result.contract,
            tokenId: result.tokenId,
            price: result.price,
            recipients: result.recipients,
            totalAmount: result.totalAmount,
            lookupAddress: result.lookupAddress,
            overrideActive: result.overrideActive,
          },
          () => {
            console.log(`Engine quote @ price ${result.price.toString()}:`);
            if (result.recipients.length === 0) {
              console.log('  (no royalty recipients)');
            } else {
              for (const recipient of result.recipients) {
                console.log(`  ${recipient.receiver} -> ${recipient.amount.toString()}`);
              }
              console.log(`  Total: ${result.totalAmount.toString()}`);
            }
            console.log(`Registry lookup: ${result.lookupAddress}`);
            console.log(`Override active: ${result.overrideActive ? 'yes' : 'no'}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createOverrideCommand(): Command {
  const cmd = new Command('override');
  cmd.description(
    'Point the Manifold royalty registry at a different royalty lookup address for a collection',
  );

  cmd
    .requiredOption('--contract <address>', 'NFT contract address to override')
    .requiredOption('--lookup <address>', 'address that resolves royalties for the contract')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: RoyaltyOverrideOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const lookupAddress = parseAddressOption(opts.lookup, '--lookup');
        const { chain, rare } = createWriteClient(opts.chain, opts.chainId);

        log(`Setting royalty lookup override on ${chain}...`);
        log(`  Contract: ${contract}`);
        log(`  Lookup:   ${lookupAddress}`);
        log('Waiting for transaction confirmation...');

        const result = await rare.royalty.setOverride({ contract, lookupAddress });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            contract: result.contract,
            lookupAddress: result.lookupAddress,
          },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Override set: ${result.contract} -> ${result.lookupAddress}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

export function royaltyCommand(): Command {
  const cmd = new Command('royalty');
  cmd.description('Inspect and override Manifold royalty engine + registry settings');
  cmd.addCommand(createStatusCommand());
  cmd.addCommand(createOverrideCommand());
  return cmd;
}
