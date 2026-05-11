import { readFile } from 'node:fs/promises';
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

      const config = JSON.parse(await readFile(join(home, '.rare', 'config.json'), 'utf8'));
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
      expect(JSON.parse(show.stdout)).toEqual({
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

      const config = JSON.parse(await readFile(join(home, '.rare', 'config.json'), 'utf8'));
      expect(config.chains.sepolia.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
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

  it('exposes collection owner tool command help', async () => {
    await withTempHome(async (home) => {
      const creator = await runCli(['collection', 'creator', '--help'], { home });
      expect(creator.code).toBe(0);
      expect(creator.stdout).toContain('Usage: rare collection creator [options]');
      expect(creator.stdout).toContain('--token-id <id>');
      expect(creator.stderr).toBe('');

      const royalty = await runCli(['collection', 'royalty', 'status', '--help'], { home });
      expect(royalty.code).toBe(0);
      expect(royalty.stdout).toContain('Usage: rare collection royalty status [options]');
      expect(royalty.stdout).toContain('--sale-price <raw>');
      expect(royalty.stderr).toBe('');

      const metadata = await runCli(['collection', 'metadata', 'update-base-uri', '--help'], { home });
      expect(metadata.code).toBe(0);
      expect(metadata.stdout).toContain('Usage: rare collection metadata update-base-uri [options]');
      expect(metadata.stdout).toContain('--base-uri <uri>');
      expect(metadata.stderr).toBe('');
    });
  });

  it('rejects invalid collection owner tool addresses before wallet setup', async () => {
    await withTempHome(async (home) => {
      const result = await runCli([
        'collection',
        'royalty',
        'set-default-receiver',
        '--contract',
        'not-an-address',
        '--receiver',
        '0x2222222222222222222222222222222222222222',
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
