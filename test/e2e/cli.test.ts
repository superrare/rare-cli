import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAddress } from 'viem';
import { parseJsonStdout, runCli, withTempHome } from '../helpers/cli.js';

describe('built CLI deterministic behavior', () => {
  it('prints top-level help and version', async () => {
    await withTempHome(async (home) => {
      const help = await runCli(['--help'], { home });
      expect(help.code).toBe(0);
      expect(help.stdout).toContain('Usage: rare [options]');
      expect(help.stdout).toContain('CLI tool for interacting with the RARE protocol smart contracts');
      expect(help.stderr).toBe('');

      const version = await runCli(['--version'], { home });
      expect(version.code).toBe(0);
      expect(version.stdout.trim()).toBe('1.0.0');
      expect(version.stderr).toBe('');
    });
  });

  it('writes and displays config without touching the real home directory', async () => {
    await withTempHome(async (home) => {
      const configure = await runCli([
        'configure',
        '--default-chain',
        'base-sepolia',
        '--chain',
        'sepolia',
        '--private-key',
        '0xabc123',
        '--rpc-url',
        'http://127.0.0.1:8545',
      ], { home });
      expect(configure.code).toBe(0);
      expect(configure.stdout).toContain('Default chain set to: base-sepolia');
      expect(configure.stdout).toContain('Configuration updated for chain: sepolia');

      const config: unknown = JSON.parse(await readFile(join(home, '.rare', 'config.json'), 'utf8'));
      expect(config).toEqual({
        defaultChain: 'base-sepolia',
        chains: {
          sepolia: {
            privateKey: '0xabc123',
            rpcUrl: 'http://127.0.0.1:8545',
          },
        },
      });

      const show = await runCli(['configure', '--show'], { home });
      expect(show.code).toBe(0);
      const shownConfig: unknown = JSON.parse(show.stdout);
      expect(shownConfig).toEqual({
        defaultChain: 'base-sepolia',
        chains: {
          sepolia: {
            privateKey: '0xabc1...c123',
            rpcUrl: 'http://127.0.0.1:8545',
          },
        },
      });
    });
  });

  it('generates wallet JSON output and can save generated keys to isolated config', async () => {
    await withTempHome(async (home) => {
      const json = parseJsonStdout<{ address: string; privateKey: string }>(
        await runCli(['--json', 'wallet', 'generate'], { home }),
      );
      expect(isAddress(json.address)).toBe(true);
      expect(json.privateKey).toMatch(/^0x[0-9a-f]{64}$/);

      const saved = await runCli(['wallet', 'generate', '--save', '--chain', 'sepolia'], { home });
      expect(saved.code).toBe(0);
      expect(saved.stdout).toContain('Private key saved to config for chain: sepolia');

      const config: unknown = JSON.parse(await readFile(join(home, '.rare', 'config.json'), 'utf8'));
      if (!isConfigWithSepoliaPrivateKey(config)) {
        throw new Error('Expected saved config to include a Sepolia private key.');
      }
      expect(config.chains.sepolia.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
    });
  });

  it('exposes liquid edition deployment help', async () => {
    await withTempHome(async (home) => {
      const deploy = await runCli(['deploy', '--help'], { home });
      expect(deploy.code).toBe(0);
      expect(deploy.stdout).toContain('liquid-edition');
      expect(deploy.stdout).not.toContain('liquid-token');
      expect(deploy.stderr).toBe('');

      const liquid = await runCli(['deploy', 'liquid-edition', '--help'], { home });
      expect(liquid.code).toBe(0);
      expect(liquid.stdout).toContain('Usage: rare deploy liquid-edition [options] <name> <symbol>');
      expect(liquid.stdout).toContain('--curves-file <path>');
      expect(liquid.stdout).toContain('--initial-rare-liquidity <amount>');
      expect(liquid.stderr).toBe('');
    });
  });

  it('exposes lazy batch mint collection help', async () => {
    await withTempHome(async (home) => {
      const collection = await runCli(['collection', '--help'], { home });
      expect(collection.code).toBe(0);
      expect(collection.stdout).toContain('create');
      expect(collection.stderr).toBe('');

      const create = await runCli(['collection', 'create', '--help'], { home });
      expect(create.code).toBe(0);
      expect(create.stdout).toContain('lazy-batch-mint');
      expect(create.stderr).toBe('');

      const lazyBatchMint = await runCli(['collection', 'create', 'lazy-batch-mint', '--help'], { home });
      expect(lazyBatchMint.code).toBe(0);
      expect(lazyBatchMint.stdout).toContain('Usage: rare collection create lazy-batch-mint [options] <name> <symbol>');
      expect(lazyBatchMint.stdout).toContain('--max-tokens <number>');
      expect(lazyBatchMint.stdout).toContain('--chain-id <id>');
      expect(lazyBatchMint.stderr).toBe('');
    });
  });

  it('returns a non-zero exit and stderr for invalid non-chain configuration input', async () => {
    await withTempHome(async (home) => {
      const result = await runCli(['configure', '--default-chain', 'not-a-chain'], { home });

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Error: --default-chain must be one of: mainnet, sepolia, base, base-sepolia');
    });
  });

  it('exposes aligned batch listing flags', async () => {
    await withTempHome(async (home) => {
      const proofHelp = await runCli(['listing', 'batch', 'merkle', 'proof', '--help'], { home });
      expect(proofHelp.code).toBe(0);
      expect(proofHelp.stdout).toContain('--output <path>');
      expect(proofHelp.stdout).toContain('--buyer <address>');

      const createHelp = await runCli(['listing', 'batch', 'create', '--help'], { home });
      expect(createHelp.code).toBe(0);
      expect(createHelp.stdout).toContain('--yes');
      expect(createHelp.stdout).toContain('--chain-id <id>');
      expect(createHelp.stdout).not.toContain('--no-approve');

      const setAllowListHelp = await runCli(['listing', 'batch', 'set-allowlist', '--help'], { home });
      expect(setAllowListHelp.code).toBe(0);
      expect(setAllowListHelp.stdout).toContain('--allowlist-root <hex>');
      expect(setAllowListHelp.stdout).toContain('--end-timestamp <unix>');
    });
  });

  it('wires listing release commands and validates user-visible inputs before RPC setup', async () => {
    await withTempHome(async (home) => {
      const help = await runCli(['listing', 'release', '--help'], { home });
      expect(help.code).toBe(0);
      expect(help.stdout).toContain('RareMinter release subcommands');
      expect(help.stdout).toContain('configure');
      expect(help.stdout).toContain('allowlist');
      expect(help.stdout).toContain('limits');
      expect(help.stdout).toContain('staking');
      expect(help.stdout).toContain('status');

      const configureHelp = await runCli(['listing', 'release', 'configure', '--help'], { home });
      expect(configureHelp.code).toBe(0);
      expect(configureHelp.stdout).toContain('--chain-id <id>');

      const statusHelp = await runCli(['listing', 'release', 'status', '--help'], { home });
      expect(statusHelp.code).toBe(0);
      expect(statusHelp.stdout).toContain('--account <address>');
      expect(statusHelp.stdout).toContain('--chain-id <id>');
      expect(statusHelp.stdout).not.toContain('--wallet');

      const allowlistProofHelp = await runCli(['listing', 'release', 'allowlist', 'proof', '--help'], { home });
      expect(allowlistProofHelp.code).toBe(0);
      expect(allowlistProofHelp.stdout).toContain('--input <file>');
      expect(allowlistProofHelp.stdout).toContain('--account <address>');
      expect(allowlistProofHelp.stdout).toContain('--output <file>');
      expect(allowlistProofHelp.stdout).not.toContain('--artifact');
      expect(allowlistProofHelp.stdout).not.toContain('--wallet');
      expect(allowlistProofHelp.stdout).not.toContain('--address');

      const result = await runCli(['listing', 'release', 'status', '--contract', 'not-an-address'], { home });
      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Error: Invalid contract address: "not-an-address".');
    });
  });

  it('builds and consumes release allowlist artifacts without RPC setup', async () => {
    await withTempHome(async (home) => {
      const input = join(home, 'allowlist.csv');
      const artifactPath = join(home, 'allowlist-artifact.json');
      const wallet = '0x0000000000000000000000000000000000000001';

      await writeFile(input, `wallet\n${wallet}\n0x0000000000000000000000000000000000000002\n`, 'utf8');

      const build = await runCli([
        'listing',
        'release',
        'allowlist',
        'build',
        '--input',
        input,
        '--output',
        artifactPath,
      ], { home });
      expect(build.code).toBe(0);
      expect(build.stdout).toContain('Allowlist artifact written');
      expect(build.stdout).toContain('Wallets: 2');

      const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
      expect(artifact.root).toMatch(/^0x[0-9a-f]{64}$/);
      expect(artifact.wallets).toHaveLength(2);

      const proof = parseJsonStdout<{ root: string; address: string; proof: string[] }>(
        await runCli([
          '--json',
          'listing',
          'release',
          'allowlist',
          'proof',
          '--input',
          artifactPath,
          '--account',
          wallet,
        ], { home }),
      );
      expect(proof.root).toBe(artifact.root);
      expect(proof.address).toBe(wallet);
      expect(proof.proof).toEqual(expect.any(Array));
    });
  });

  it('exposes the Sovereign collection create command help', async () => {
    await withTempHome(async (home) => {
      const result = await runCli(['collection', 'create', 'sovereign', '--help'], { home });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage: rare collection create sovereign [options] <name> <symbol>');
      expect(result.stdout).toContain('--contract-type <type>');
      expect(result.stdout).toContain('--max-tokens <number>');
      expect(result.stderr).toBe('');
    });
  });

  it('exposes the Lazy Sovereign collection create command help', async () => {
    await withTempHome(async (home) => {
      const result = await runCli(['collection', 'create', 'lazy-sovereign', '--help'], { home });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage: rare collection create lazy-sovereign [options] <name> <symbol>');
      expect(result.stdout).toContain('--contract-type <type>');
      expect(result.stdout).toContain('--max-tokens <number>');
      expect(result.stderr).toBe('');
    });
  });

  it('exposes collection batch mint command help', async () => {
    await withTempHome(async (home) => {
      const result = await runCli(['collection', 'mint-batch', '--help'], { home });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage: rare collection mint-batch [options]');
      expect(result.stdout).toContain('--contract <address>');
      expect(result.stdout).toContain('--base-uri <uri>');
      expect(result.stdout).toContain('--token-count <number>');
      expect(result.stderr).toBe('');
    });
  });

  it('exposes collection lazy prepare command help', async () => {
    await withTempHome(async (home) => {
      const result = await runCli(['collection', 'prepare-lazy-mint', '--help'], { home });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage: rare collection prepare-lazy-mint [options]');
      expect(result.stdout).toContain('--contract <address>');
      expect(result.stdout).toContain('--base-uri <uri>');
      expect(result.stdout).toContain('--token-count <number>');
      expect(result.stdout).toContain('--minter <address>');
      expect(result.stderr).toBe('');
    });
  });

  it('rejects invalid collection mint addresses before wallet setup', async () => {
    await withTempHome(async (home) => {
      const result = await runCli([
        'collection',
        'mint-batch',
        '--contract',
        'not-an-address',
        '--base-uri',
        'ipfs://batch',
        '--token-count',
        '2',
      ], { home });

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Error: --contract must be a valid 0x address.');
    });
  });

  it('rejects Sovereign collection creation on chains without a configured factory before wallet setup', async () => {
    await withTempHome(async (home) => {
      const result = await runCli([
        'collection',
        'create',
        'sovereign',
        'Test',
        'TST',
        '--chain',
        'base',
      ], { home });

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('RARE Protocol sovereignFactory contract is not configured on "base".');
    });
  });

  it('rejects Lazy Sovereign collection creation on chains without a configured factory before wallet setup', async () => {
    await withTempHome(async (home) => {
      const result = await runCli([
        'collection',
        'create',
        'lazy-sovereign',
        'Test',
        'TST',
        '--max-tokens',
        '10',
        '--chain',
        'base',
      ], { home });

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('RARE Protocol lazySovereignFactory contract is not configured on "base".');
    });
  });
});

function isConfigWithSepoliaPrivateKey(value: unknown): value is {
  chains: { sepolia: { privateKey: string } };
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'chains' in value &&
    typeof value.chains === 'object' &&
    value.chains !== null &&
    'sepolia' in value.chains &&
    typeof value.chains.sepolia === 'object' &&
    value.chains.sepolia !== null &&
    'privateKey' in value.chains.sepolia &&
    typeof value.chains.sepolia.privateKey === 'string'
  );
}
