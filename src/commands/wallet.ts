import { Command } from 'commander';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { readConfig, setChainConfig, writeConfig, getActiveChain } from '../config.js';
import { getConfiguredAccountAddress, getWalletClient } from '../client.js';
import { chainIds, supportedChains } from '../contracts/addresses.js';
import { output } from '../output.js';

type WalletGenerateOptions = {
  chain?: string;
  chainId?: string;
  save?: boolean;
};

type WalletAddressOptions = {
  chain?: string;
  chainId?: string;
};

export function walletCommand(): Command {
  const cmd = new Command('wallet');
  const supportedChainsText = supportedChains.join(', ');
  cmd.description('Wallet management');

  cmd
    .command('generate')
    .description('Generate a new Ethereum wallet and optionally save it to config')
    .option('--chain <chain>', `chain to save the key to (${supportedChainsText})`)
    .option('--chain-id <id>', `chain ID to use (${Object.entries(chainIds).map(([chain, id]) => `${id} (${chain})`).join(', ')})`)
    .option('--save', 'save the generated key to config for the specified chain')
    .action((opts: WalletGenerateOptions): void => {
      const selectedChain = opts.chain === undefined && opts.chainId === undefined
        ? 'sepolia'
        : getActiveChain(opts.chain, opts.chainId);
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);

      if (opts.save) {
        writeConfig(setChainConfig(readConfig(), selectedChain, {
          privateKey,
          privateKeyRef: undefined,
          accountAddress: undefined,
        }));
      }

      output({
        address: account.address,
        privateKey,
        ...(opts.save ? { saved: true, chain: selectedChain } : {}),
      }, () => {
        console.log('Generated new wallet:');
        console.log(`  Address:     ${account.address}`);
        console.log(`  Private Key: ${privateKey}`);
        console.log('');
        console.log('⚠ Store your private key securely. It will not be shown again.');
        if (opts.save) {
          console.log(`\nPrivate key saved to config for chain: ${selectedChain}`);
        }
      });
    });

  cmd
    .command('address')
    .description('Show the Ethereum address of the configured wallet')
    .option('--chain <chain>', `chain to use (${supportedChainsText})`)
    .option('--chain-id <id>', `chain ID to use (${Object.entries(chainIds).map(([chain, id]) => `${id} (${chain})`).join(', ')})`)
    .action((opts: WalletAddressOptions): void => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const address = getConfiguredAccountAddress(chain) ?? getWalletClient(chain).account.address;
      output({ address, chain }, () => {
        console.log(address);
      });
    });

  return cmd;
}
