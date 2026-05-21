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
import { isPrivateKeyString, parsePrivateKey } from '../sdk/validation.js';
import { readOnePasswordPrivateKey, readOnePasswordSecret } from '../one-password.js';
import { isJsonMode, output } from '../output.js';

type ConfigureOptions = {
  chain?: string;
  chainId?: string;
  privateKey?: string;
  privateKeyRef?: string;
  uniswapApiKey?: string;
  uniswapApiKeyRef?: string;
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
    .option('--uniswap-api-key <key>', 'Uniswap API key for hosted fallback routes')
    .option('--uniswap-api-key-ref <ref>', '1Password secret reference for the Uniswap API key')
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
                uniswapApiKey: chainCfg.uniswapApiKey !== undefined ? maskSecret(chainCfg.uniswapApiKey) : undefined,
                uniswapApiKeyRef: chainCfg.uniswapApiKeyRef,
              },
            ])
          ),
        };
        console.log(JSON.stringify(display, null, 2));
        return;
      }

      if (opts.defaultChain !== undefined && !isSupportedChain(opts.defaultChain)) {
        throw new Error(`--default-chain must be one of: ${supportedChainsText}`);
      }

      const configWithDefaultChain = opts.defaultChain === undefined
        ? config
        : setDefaultChain(config, opts.defaultChain);
      const selectedChain = getSelectedChain(opts, configWithDefaultChain);

      const defaultChainMessages = opts.defaultChain === undefined
        ? []
        : [`Default chain set to: ${opts.defaultChain}`];

      const chainConfigUpdates = selectedChain === undefined
        ? undefined
        : await getChainConfigUpdates(opts);
      const nextConfig = selectedChain === undefined || chainConfigUpdates === undefined
        ? configWithDefaultChain
        : setChainConfig(configWithDefaultChain, selectedChain, chainConfigUpdates);
      const messages = selectedChain === undefined
        ? defaultChainMessages
        : [...defaultChainMessages, `Configuration updated for chain: ${selectedChain}`];

      if (opts.defaultChain === undefined && selectedChain === undefined) {
        cmd.help();
      }

      if (messages.length > 0) {
        writeConfig(nextConfig);
        output(
          {
            updated: true,
            path: getConfigFilePath(),
            defaultChain: nextConfig.defaultChain ?? null,
            chain: selectedChain ?? null,
          },
          () => {
            for (const message of messages) {
              console.log(message);
            }
          },
        );
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
  return (
    opts.privateKey !== undefined ||
    opts.privateKeyRef !== undefined ||
    opts.rpcUrl !== undefined ||
    opts.uniswapApiKey !== undefined ||
    opts.uniswapApiKeyRef !== undefined
  );
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
      privateKey: parsePrivateKey(opts.privateKey, '--private-key'),
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

async function getChainConfigUpdates(opts: ConfigureOptions): Promise<ChainConfig> {
  if (opts.privateKey !== undefined && opts.privateKeyRef !== undefined) {
    throw new Error('--private-key and --private-key-ref cannot be used together.');
  }
  if (opts.uniswapApiKey !== undefined && opts.uniswapApiKeyRef !== undefined) {
    throw new Error('--uniswap-api-key and --uniswap-api-key-ref cannot be used together.');
  }

  return {
    ...(await getKeySourceUpdates(opts)),
    ...(await getUniswapApiKeyUpdates(opts)),
    ...(opts.rpcUrl === undefined ? {} : { rpcUrl: opts.rpcUrl }),
  };
}

async function getUniswapApiKeyUpdates(opts: ConfigureOptions): Promise<ChainConfig> {
  if (opts.uniswapApiKey !== undefined) {
    const uniswapApiKey = parseUniswapApiKey(opts.uniswapApiKey, '--uniswap-api-key');
    return {
      uniswapApiKey,
      uniswapApiKeyRef: undefined,
    };
  }

  if (opts.uniswapApiKeyRef !== undefined) {
    const uniswapApiKeyRef = parsePrivateKeyReference(opts.uniswapApiKeyRef, '--uniswap-api-key-ref');
    parseUniswapApiKey(
      await readOnePasswordSecret(uniswapApiKeyRef),
      `1Password Uniswap API key at ${uniswapApiKeyRef}`,
    );
    return {
      uniswapApiKey: undefined,
      uniswapApiKeyRef,
    };
  }

  return {};
}

function parseUniswapApiKey(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${field} must not be empty.`);
  }
  return trimmed;
}

function maskSecret(value: string): string {
  return value.length <= 10 ? '[redacted]' : `${value.slice(0, 6)}...${value.slice(-4)}`;
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
