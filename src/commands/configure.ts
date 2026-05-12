import { Command } from 'commander';
import { readConfig, setChainConfig, setDefaultChain, writeConfig } from '../config.js';
import { isSupportedChain, supportedChains } from '../contracts/addresses.js';
import { parseHexString } from '../sdk/validation.js';

type ConfigureOptions = {
  chain?: string;
  privateKey?: string;
  rpcUrl?: string;
  defaultChain?: string;
  show?: boolean;
};

export function configureCommand(): Command {
  const cmd = new Command('configure');
  const supportedChainsText = supportedChains.join(', ');
  cmd.description('Set or view configuration');

  cmd
    .option('--chain <chain>', `chain to configure (${supportedChainsText})`)
    .option('--private-key <key>', 'private key for the specified chain')
    .option('--rpc-url <url>', 'custom RPC URL for the specified chain')
    .option('--default-chain <chain>', 'set the default chain')
    .option('--show', 'display current configuration')
    .action((opts: ConfigureOptions): void => {
      const config = readConfig();

      if (opts.show) {
        const display = {
          defaultChain: config.defaultChain ?? 'sepolia (default)',
          chains: Object.fromEntries(
            Object.entries(config.chains).map(([chain, chainCfg]) => [
              chain,
              {
                privateKey: chainCfg.privateKey !== undefined
                  ? `${chainCfg.privateKey.slice(0, 6)}...${chainCfg.privateKey.slice(-4)}`
                  : undefined,
                rpcUrl: chainCfg.rpcUrl,
              },
            ])
          ),
        };
        console.log(JSON.stringify(display, null, 2));
        return;
      }

      const configWithDefaultChain = opts.defaultChain && isSupportedChain(opts.defaultChain)
        ? setDefaultChain(config, opts.defaultChain)
        : config;

      if (opts.defaultChain) {
        if (!isSupportedChain(opts.defaultChain)) {
          throw new Error(`--default-chain must be one of: ${supportedChainsText}`);
        }
        writeConfig(configWithDefaultChain);
        console.log(`Default chain set to: ${opts.defaultChain}`);
      }

      if (opts.chain) {
        if (!isSupportedChain(opts.chain)) {
          throw new Error(`--chain must be one of: ${supportedChainsText}`);
        }
        const privateKey = opts.privateKey ? parseHexString(opts.privateKey, '--private-key') : undefined;
        const nextConfig = setChainConfig(configWithDefaultChain, opts.chain, {
          ...(privateKey === undefined ? {} : { privateKey }),
          ...(opts.rpcUrl === undefined ? {} : { rpcUrl: opts.rpcUrl }),
        });

        writeConfig(nextConfig);
        console.log(`Configuration updated for chain: ${opts.chain}`);
      }

      if (opts.defaultChain === undefined && opts.chain === undefined) {
        cmd.help();
      }
    });

  return cmd;
}
