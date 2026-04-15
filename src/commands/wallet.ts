import { Command } from 'commander';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { readConfig, writeConfig, getActiveChain } from '../config.js';
import { getWalletClient } from '../client.js';
import { isSupportedChain, supportedChains, type SupportedChain } from '../contracts/addresses.js';
import { output } from '../output.js';

export function walletCommand(): Command {
  const cmd = new Command('wallet');
  const supportedChainsText = supportedChains.join(', ');
  cmd.description('Wallet management');

  cmd
    .command('generate')
    .description('Generate a new Ethereum wallet and optionally save it to config')
    .option('--chain <chain>', `chain to save the key to (${supportedChainsText})`)
    .option('--save', 'save the generated key to config for the specified chain')
    .action((opts) => {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);

      output({ address: account.address, privateKey }, () => {
        console.log('Generated new wallet:');
        console.log(`  Address:     ${account.address}`);
        console.log(`  Private Key: ${privateKey}`);
        console.log('');
        console.log('⚠ Store your private key securely. It will not be shown again.');
      });

      if (opts.save) {
        const selectedChain = opts.chain ?? 'sepolia';
        if (!isSupportedChain(selectedChain)) {
          console.error(`Error: --chain must be one of: ${supportedChainsText}`);
          process.exit(1);
        }
        const chain: SupportedChain = selectedChain;
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
    .option('--chain <chain>', `chain to use (${supportedChainsText})`)
    .action((opts) => {
      const chain = getActiveChain(opts.chain);
      const { account } = getWalletClient(chain);
      console.log(account.address);
    });

  return cmd;
}
