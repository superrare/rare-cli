import { text } from 'node:stream/consumers';
import { createInterface } from 'node:readline/promises';
import { Command } from 'commander';
import { privateKeyToAccount } from 'viem/accounts';
import {
  configFileExists,
  deleteConfig,
  getConfigFilePath,
  getActiveChain,
  parsePrivateKeyReference,
  readConfig,
  setChainConfig,
  setDefaultChain,
  writeConfig,
  type ChainConfig,
  type Config,
} from '../config.js';
import { chainIds, isSupportedChain, supportedChains, type SupportedChain } from '../contracts/addresses.js';
import { isPrivateKeyString, parseHexString } from '../sdk/validation.js';
import { readOnePasswordPrivateKey } from '../one-password.js';
import { isJsonMode, output } from '../output.js';

type ConfigureOptions = {
  chain?: string;
  chainId?: string;
  privateKey?: string;
  privateKeyRef?: string;
  rpcUrl?: string;
  defaultChain?: string;
  show?: boolean;
};

type DeleteConfigOptions = {
  yes?: boolean;
};

export function configureCommand(): Command {
  const cmd = new Command('configure');
  const supportedChainsText = supportedChains.join(', ');
  cmd.description('Set or view configuration');

  cmd
    .option('--chain <chain>', `chain to configure (${supportedChainsText})`)
    .option('--chain-id <id>', `chain ID to use (${Object.entries(chainIds).map(([chain, id]) => `${id} (${chain})`).join(', ')})`)
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
                accountAddress: getAccountAddress(chainCfg),
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
      const selectedChain = getSelectedChain(opts, configWithDefaultChain);

      if (opts.defaultChain) {
        if (!isSupportedChain(opts.defaultChain)) {
          throw new Error(`--default-chain must be one of: ${supportedChainsText}`);
        }
        writeConfig(configWithDefaultChain);
        console.log(`Default chain set to: ${opts.defaultChain}`);
      }

      if (selectedChain !== undefined) {
        if (opts.privateKey !== undefined && opts.privateKeyRef !== undefined) {
          throw new Error('--private-key and --private-key-ref cannot be used together.');
        }

        const keySourceUpdates = await getKeySourceUpdates(opts);
        const nextConfig = setChainConfig(configWithDefaultChain, selectedChain, {
          ...keySourceUpdates,
          ...(opts.rpcUrl === undefined ? {} : { rpcUrl: opts.rpcUrl }),
        });

        writeConfig(nextConfig);
        console.log(`Configuration updated for chain: ${selectedChain}`);
      }

      if (opts.defaultChain === undefined && selectedChain === undefined) {
        cmd.help();
      }
    });

  cmd.addCommand(deleteConfigCommand());

  return cmd;
}

function getSelectedChain(opts: ConfigureOptions, config: Config): SupportedChain | undefined {
  if (opts.chain !== undefined || opts.chainId !== undefined) {
    return getActiveChain(opts.chain, opts.chainId);
  }

  if (hasChainConfigUpdates(opts)) {
    return config.defaultChain ?? 'sepolia';
  }

  return undefined;
}

function hasChainConfigUpdates(opts: ConfigureOptions): boolean {
  return opts.privateKey !== undefined || opts.privateKeyRef !== undefined || opts.rpcUrl !== undefined;
}

function deleteConfigCommand(): Command {
  const cmd = new Command('delete');
  cmd.description('Delete the local rare configuration file');

  cmd
    .option('--yes', 'skip the interactive confirmation prompt')
    .action(async (opts: DeleteConfigOptions): Promise<void> => {
      const configPath = getConfigFilePath();

      if (!configFileExists()) {
        output(
          { deleted: false, path: configPath },
          () => {
            console.log(`No rare config found at ${configPath}`);
          },
        );
        return;
      }

      if (!opts.yes) {
        if (isJsonMode()) {
          throw new Error('rare configure delete requires --yes when --json is enabled.');
        }

        if (!(await confirmDeleteConfig(configPath))) {
          console.log('Aborted.');
          return;
        }
      }

      const deleted = deleteConfig();
      output(
        { deleted, path: configPath },
        () => {
          console.log(deleted ? `Deleted rare config: ${configPath}` : `No rare config found at ${configPath}`);
        },
      );
    });

  return cmd;
}

function getKeySourceLabel(chainCfg: ChainConfig): string | undefined {
  if (chainCfg.privateKey !== undefined) return 'plaintext';
  if (chainCfg.privateKeyRef !== undefined) return '1password';
  return undefined;
}

function getAccountAddress(chainCfg: ChainConfig): string | undefined {
  if (chainCfg.privateKeyRef !== undefined) return chainCfg.accountAddress;
  if (chainCfg.privateKey !== undefined && isPrivateKeyString(chainCfg.privateKey)) {
    return privateKeyToAccount(chainCfg.privateKey).address;
  }

  return undefined;
}

async function getKeySourceUpdates(opts: ConfigureOptions): Promise<ChainConfig> {
  if (opts.privateKey !== undefined) {
    return {
      privateKey: parseHexString(opts.privateKey, '--private-key'),
      privateKeyRef: undefined,
      accountAddress: undefined,
    };
  }

  if (opts.privateKeyRef !== undefined) {
    const privateKeyRef = parsePrivateKeyReference(opts.privateKeyRef, '--private-key-ref');
    const privateKey = await readOnePasswordPrivateKey(privateKeyRef);
    return {
      privateKey: undefined,
      privateKeyRef,
      accountAddress: privateKeyToAccount(privateKey).address,
    };
  }

  return {};
}

async function confirmDeleteConfig(configPath: string): Promise<boolean> {
  console.log(`This will permanently delete rare config at ${configPath}.`);
  console.log('This cannot be undone.');

  return isAffirmativeResponse(await readConfirmation('Delete config? [y/N] '));
}

async function readConfirmation(prompt: string): Promise<string> {
  if (process.stdin.isTTY) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      return await rl.question(prompt);
    } finally {
      rl.close();
    }
  }

  process.stdout.write(prompt);
  const input = await text(process.stdin);
  process.stdout.write('\n');
  return input.split(/\r?\n/, 1)[0] ?? '';
}

function isAffirmativeResponse(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes';
}
