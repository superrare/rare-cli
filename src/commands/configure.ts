import { Command } from 'commander';
import { readConfig, writeConfig } from '../config.js';
import type { SupportedChain } from '../contracts/addresses.js';

export function configureCommand(): Command {
  const cmd = new Command('configure');
  cmd.description('Set or view configuration');

  cmd
    .option('--chain <chain>', 'chain to configure (sepolia or mainnet)')
    .option('--private-key <key>', 'private key for the specified chain')
    .option('--rpc-url <url>', 'custom RPC URL for the specified chain')
    .option('--default-chain <chain>', 'set the default chain')
    .option('--show', 'display current configuration')
    .action((opts) => {
      const config = readConfig();

      if (opts.show) {
        const display = {
          defaultChain: config.defaultChain ?? 'sepolia (default)',
          chains: Object.fromEntries(
            Object.entries(config.chains).map(([chain, chainCfg]) => [
              chain,
              {
                privateKey: chainCfg?.privateKey
                  ? chainCfg.privateKey.slice(0, 6) + '...' + chainCfg.privateKey.slice(-4)
                  : undefined,
                rpcUrl: chainCfg?.rpcUrl,
              },
            ])
          ),
        };
        console.log(JSON.stringify(display, null, 2));
        return;
      }

      if (opts.defaultChain) {
        if (opts.defaultChain !== 'sepolia' && opts.defaultChain !== 'mainnet') {
          console.error('Error: --default-chain must be "sepolia" or "mainnet"');
          process.exit(1);
        }
        config.defaultChain = opts.defaultChain as SupportedChain;
        writeConfig(config);
        console.log(`Default chain set to: ${opts.defaultChain}`);
      }

      if (opts.chain) {
        const chain = opts.chain as SupportedChain;
        if (chain !== 'sepolia' && chain !== 'mainnet') {
          console.error('Error: --chain must be "sepolia" or "mainnet"');
          process.exit(1);
        }
        if (!config.chains[chain]) {
          config.chains[chain] = {};
        }
        if (opts.privateKey) {
          config.chains[chain]!.privateKey = opts.privateKey;
        }
        if (opts.rpcUrl) {
          config.chains[chain]!.rpcUrl = opts.rpcUrl;
        }
        writeConfig(config);
        console.log(`Configuration updated for chain: ${chain}`);
      }

      if (!opts.show && !opts.defaultChain && !opts.chain) {
        cmd.help();
      }
    });

  return cmd;
}
