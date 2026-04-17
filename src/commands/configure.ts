import { Command } from 'commander';
import { readConfig, writeConfig } from '../config.js';
import { isSupportedChain, supportedChains, type SupportedChain } from '../contracts/addresses.js';

export function configureCommand(): Command {
  const cmd = new Command('configure');
  const supportedChainsText = supportedChains.join(', ');
  cmd.description('Set or view configuration');

  cmd
    .option('--chain <chain>', `chain to configure (${supportedChainsText})`)
    .option('--private-key <key>', 'private key for the specified chain')
    .option('--rpc-url <url>', 'custom RPC URL for the specified chain')
    .option('--backup-service-url <url>', 'override the default preservation service URL')
    .option('--backup-payment-chain <chain>', `default preservation payment chain (${supportedChainsText})`)
    .option('--backup-gateway-url <url>', 'default IPFS gateway for preservation fetches')
    .option('--backup-max-bytes <bytes>', 'default preservation byte cap')
    .option('--default-chain <chain>', 'set the default chain')
    .option('--show', 'display current configuration')
    .action((opts) => {
      const config = readConfig();
      config.preservation ??= {};

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
          preservation: config.preservation,
        };
        console.log(JSON.stringify(display, null, 2));
        return;
      }

      if (opts.defaultChain) {
        if (!isSupportedChain(opts.defaultChain)) {
          console.error(`Error: --default-chain must be one of: ${supportedChainsText}`);
          process.exit(1);
        }
        config.defaultChain = opts.defaultChain as SupportedChain;
        writeConfig(config);
        console.log(`Default chain set to: ${opts.defaultChain}`);
      }

      if (opts.chain) {
        if (!isSupportedChain(opts.chain)) {
          console.error(`Error: --chain must be one of: ${supportedChainsText}`);
          process.exit(1);
        }
        const chain = opts.chain as SupportedChain;
        if (!config.chains[chain]) {
          config.chains[chain] = {};
        }
        if (opts.privateKey) {
          config.chains[chain]!.privateKey = opts.privateKey;
        }
        if (opts.rpcUrl) {
          config.chains[chain]!.rpcUrl = opts.rpcUrl;
        }
      }

      if (opts.backupServiceUrl !== undefined) {
        validateUrl(opts.backupServiceUrl, '--backup-service-url');
        config.preservation.serviceUrl = opts.backupServiceUrl;
      }

      if (opts.backupPaymentChain !== undefined) {
        if (!isSupportedChain(opts.backupPaymentChain)) {
          console.error(`Error: --backup-payment-chain must be one of: ${supportedChainsText}`);
          process.exit(1);
        }
        config.preservation.defaultPaymentChain = opts.backupPaymentChain as SupportedChain;
      }

      if (opts.backupGatewayUrl !== undefined) {
        validateUrl(opts.backupGatewayUrl, '--backup-gateway-url');
        config.preservation.gatewayUrl = opts.backupGatewayUrl;
      }

      if (opts.backupMaxBytes !== undefined) {
        const maxBytes = Number.parseInt(opts.backupMaxBytes, 10);
        if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
          console.error('Error: --backup-max-bytes must be a positive integer');
          process.exit(1);
        }
        config.preservation.maxBytes = maxBytes;
      }

      if (
        opts.defaultChain ||
        opts.chain ||
        opts.backupServiceUrl !== undefined ||
        opts.backupPaymentChain !== undefined ||
        opts.backupGatewayUrl !== undefined ||
        opts.backupMaxBytes !== undefined
      ) {
        writeConfig(config);
      }

      if (opts.chain) {
        console.log(`Configuration updated for chain: ${opts.chain}`);
      } else if (
        opts.backupServiceUrl !== undefined ||
        opts.backupPaymentChain !== undefined ||
        opts.backupGatewayUrl !== undefined ||
        opts.backupMaxBytes !== undefined
      ) {
        console.log('Preservation defaults updated.');
      }

      if (
        !opts.show &&
        !opts.defaultChain &&
        !opts.chain &&
        opts.backupServiceUrl === undefined &&
        opts.backupPaymentChain === undefined &&
        opts.backupGatewayUrl === undefined &&
        opts.backupMaxBytes === undefined
      ) {
        cmd.help();
      }
    });

  return cmd;
}

function validateUrl(value: string, flag: string): void {
  try {
    new URL(value);
  } catch {
    console.error(`Error: ${flag} must be a valid URL`);
    process.exit(1);
  }
}
