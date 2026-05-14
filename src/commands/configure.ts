import { Command } from 'commander';
import { privateKeyToAccount } from 'viem/accounts';
import {
  parsePrivateKeyReference,
  readConfig,
  setChainConfig,
  setDefaultChain,
  writeConfig,
  type ChainConfig,
} from '../config.js';
import { isSupportedChain, supportedChains } from '../contracts/addresses.js';
import { parseHexString } from '../sdk/validation.js';
import { readOnePasswordPrivateKey } from '../one-password.js';

type ConfigureOptions = {
  chain?: string;
  privateKey?: string;
  privateKeyRef?: string;
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
    .option('--private-key-ref <ref>', '1Password secret reference for the specified chain private key')
    .option('--rpc-url <url>', 'custom RPC URL for the specified chain')
    .option('--default-chain <chain>', 'set the default chain')
    .option('--show', 'display current configuration')
    .action(async (opts: ConfigureOptions): Promise<void> => {
      const config = readConfig();

      if (opts.show) {
        const display = {
          defaultChain: config.defaultChain ?? 'sepolia (default)',
          chains: Object.fromEntries(
            Object.entries(config.chains).map(([chain, chainCfg]) => [
              chain,
              {
                keySource: getKeySourceLabel(chainCfg),
                privateKey: chainCfg.privateKey !== undefined
                  ? `${chainCfg.privateKey.slice(0, 6)}...${chainCfg.privateKey.slice(-4)}`
                  : undefined,
                privateKeyRef: chainCfg.privateKeyRef,
                walletAddress: chainCfg.walletAddress,
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
        if (opts.privateKey !== undefined && opts.privateKeyRef !== undefined) {
          throw new Error('--private-key and --private-key-ref cannot be used together.');
        }

        const keySourceUpdates = await getKeySourceUpdates(opts);
        const nextConfig = setChainConfig(configWithDefaultChain, opts.chain, {
          ...keySourceUpdates,
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

function getKeySourceLabel(chainCfg: ChainConfig): string | undefined {
  if (chainCfg.privateKey !== undefined) return 'plaintext';
  if (chainCfg.privateKeyRef !== undefined) return '1password';
  return undefined;
}

async function getKeySourceUpdates(opts: ConfigureOptions): Promise<ChainConfig> {
  if (opts.privateKey !== undefined) {
    return {
      privateKey: parseHexString(opts.privateKey, '--private-key'),
      privateKeyRef: undefined,
      walletAddress: undefined,
    };
  }

  if (opts.privateKeyRef !== undefined) {
    const privateKeyRef = parsePrivateKeyReference(opts.privateKeyRef, '--private-key-ref');
    const privateKey = await readOnePasswordPrivateKey(privateKeyRef);
    return {
      privateKey: undefined,
      privateKeyRef,
      walletAddress: privateKeyToAccount(privateKey).address,
    };
  }

  return {};
}
