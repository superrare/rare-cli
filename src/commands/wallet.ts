import { Command } from 'commander';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { readConfig, writeConfig, getActiveChain } from '../config.js';
import { getWalletClient } from '../client.js';
import type { SupportedChain } from '../contracts/addresses.js';

export function walletCommand(): Command {
  const cmd = new Command('wallet');
  cmd.description('Wallet management');

  cmd
    .command('generate')
    .description('Generate a new Ethereum wallet and optionally save it to config')
    .option('--chain <chain>', 'chain to save the key to (sepolia or mainnet)')
    .option('--save', 'save the generated key to config for the specified chain')
    .action((opts) => {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);

      console.log('Generated new wallet:');
      console.log(`  Address:     ${account.address}`);
      console.log(`  Private Key: ${privateKey}`);
      console.log('');
      console.log('⚠ Store your private key securely. It will not be shown again.');

      if (opts.save) {
        const chain: SupportedChain = opts.chain ?? 'sepolia';
        if (chain !== 'sepolia' && chain !== 'mainnet') {
          console.error('Error: --chain must be "sepolia" or "mainnet"');
          process.exit(1);
        }
        const config = readConfig();
        if (!config.chains[chain]) {
          config.chains[chain] = {};
        }
        config.chains[chain]!.privateKey = privateKey;
        writeConfig(config);
        console.log(`\nPrivate key saved to config for chain: ${chain}`);
      }
    });

  cmd
    .command('address')
    .description('Show the Ethereum address of the configured wallet')
    .option('--chain <chain>', 'chain to use (sepolia or mainnet)')
    .action((opts) => {
      const chain = getActiveChain(opts.chain);
      const { account } = getWalletClient(chain);
      console.log(account.address);
    });

  return cmd;
}
