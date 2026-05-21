import { access, chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { delimiter, join } from 'node:path';
import { text } from 'node:stream/consumers';
import { describe, expect, it, type TestContext } from 'vitest';
import { isAddress, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { parseJsonStdout, runCli, withTempHome } from '../helpers/cli.js';

const batchListingRootArtifact = {
  root: '0xa01f005c90f56c0f2b981e045caf4949f489bf82e5d3c49effb1334cab26043a',
  currency: zeroAddress,
  amount: '1',
  splitAddresses: [],
  splitRatios: [],
  tokens: [
    { contract: '0x1111111111111111111111111111111111111111', tokenId: '1' },
    { contract: '0x1111111111111111111111111111111111111111', tokenId: '2' },
  ],
} as const;

const allowlistedBatchListingRootArtifact = {
  ...batchListingRootArtifact,
  allowList: {
    root: '0x27544996534742c5e4c082fa1ed524eea6991a4d0325902124bc233e8d7379af',
    addresses: [
      '0x1000000000000000000000000000000000000000',
      '0x2000000000000000000000000000000000000000',
    ],
    endTimestamp: '1234',
  },
} as const;

describe('built CLI deterministic behavior', () => {
  it('prints top-level help and version', async () => {
    await withTempHome(async (home) => {
      const help = await runCli(['--help'], { home });
      expect(help.code).toBe(0);
      expect(help.stdout).toContain('Usage: rare [options]');
      expect(help.stdout).toContain('CLI tool for interacting with the RARE protocol smart contracts');
      expect(help.stdout).not.toContain('\n  deploy');
      expect(help.stderr).toBe('');

      const version = await runCli(['--version'], { home });
      expect(version.code).toBe(0);
      expect(version.stdout.trim()).toBe('1.0.0');
      expect(version.stderr).toBe('');

      const removedDeploy = await runCli(['deploy'], { home });
      expect(removedDeploy.code).toBe(1);
      expect(removedDeploy.stderr).toContain("error: unknown command 'deploy'");
    });
  });

  it('writes and displays config without touching the real home directory', async () => {
    await withTempHome(async (home) => {
      const privateKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const expectedAddress = privateKeyToAccount(privateKey).address;
      const configure = await runCli([
        'configure',
        '--default-chain',
        'base-sepolia',
        '--chain',
        'sepolia',
        '--private-key',
        privateKey,
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
            privateKey,
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
            keySource: 'plaintext',
            privateKey: '0x0123...cdef',
            accountAddress: expectedAddress,
            rpcUrl: 'http://127.0.0.1:8545',
          },
        },
      });
    });
  });

  it('deletes config only after confirmation', async () => {
    await withTempHome(async (home) => {
      const configPath = join(home, '.rare', 'config.json');
      const configure = await runCli([
        'configure',
        '--chain',
        'sepolia',
        '--rpc-url',
        'http://127.0.0.1:8545',
      ], { home });
      expect(configure.code).toBe(0);

      const aborted = await runCli(['configure', 'delete'], { home, input: 'n\n' });
      expect(aborted.code).toBe(0);
      expect(aborted.stdout).toContain(`This will permanently delete rare config at ${configPath}.`);
      expect(aborted.stdout).toContain('This cannot be undone.');
      expect(aborted.stdout).toContain('Delete config? [y/N]');
      expect(aborted.stdout).toContain('Aborted.');
      expect(aborted.stderr).toBe('');
      expect(JSON.parse(await readFile(configPath, 'utf8'))).toEqual({
        chains: {
          sepolia: {
            rpcUrl: 'http://127.0.0.1:8545',
          },
        },
      });

      const deleted = await runCli(['configure', 'delete'], { home, input: 'yes\n' });
      expect(deleted.code).toBe(0);
      expect(deleted.stdout).toContain('This cannot be undone.');
      expect(deleted.stdout).toContain(`Deleted rare config: ${configPath}`);
      expect(deleted.stderr).toBe('');
      await expect(access(configPath)).rejects.toMatchObject({ code: 'ENOENT' });

      const missing = await runCli(['configure', 'delete', '--yes'], { home });
      expect(missing.code).toBe(0);
      expect(missing.stdout).toContain(`No rare config found at ${configPath}`);
      expect(missing.stderr).toBe('');
    });
  });

  it('configures a 1Password private key reference without storing plaintext', async () => {
    await withTempHome(async (home) => {
      const privateKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const previousPrivateKey = '0x1111111111111111111111111111111111111111111111111111111111111111';
      const expectedAddress = privateKeyToAccount(privateKey).address;
      const fakeOp = await createFakeOp(home);
      const env = fakeOpEnv(fakeOp.binDir, privateKey);

      const configurePlaintext = await runCli([
        'configure',
        '--chain',
        'sepolia',
        '--private-key',
        previousPrivateKey,
        '--rpc-url',
        'http://127.0.0.1:7545',
      ], { home });
      expect(configurePlaintext.code).toBe(0);

      const configure = await runCli([
        'configure',
        '--private-key-ref',
        'op://Private/rare-sepolia/private-key',
        '--rpc-url',
        'http://127.0.0.1:8545',
      ], { home, env });

      expect(configure.code).toBe(0);
      expect(configure.stdout).toContain('Configuration updated for chain: sepolia');
      expect(await readFile(fakeOp.logPath, 'utf8')).toBe('read op://Private/rare-sepolia/private-key\n');

      const config: unknown = JSON.parse(await readFile(join(home, '.rare', 'config.json'), 'utf8'));
      expect(config).toEqual({
        chains: {
          sepolia: {
            privateKeyRef: 'op://Private/rare-sepolia/private-key',
            accountAddress: expectedAddress,
            rpcUrl: 'http://127.0.0.1:8545',
          },
        },
      });

      const address = await runCli(['wallet', 'address', '--chain', 'sepolia'], {
        home,
        env: {
          ...env,
          FAKE_OP_FAIL: '1',
        },
      });

      expect(address.code).toBe(0);
      expect(address.stdout.trim()).toBe(expectedAddress);
      expect(await readFile(fakeOp.logPath, 'utf8')).toBe('read op://Private/rare-sepolia/private-key\n');

      const show = await runCli(['configure', '--show'], { home });
      expect(show.code).toBe(0);
      expect(JSON.parse(show.stdout)).toEqual({
        defaultChain: 'sepolia (default)',
        chains: {
          sepolia: {
            keySource: '1password',
            privateKeyRef: 'op://Private/rare-sepolia/private-key',
            accountAddress: expectedAddress,
            rpcUrl: 'http://127.0.0.1:8545',
          },
        },
      });
    });
  });

  it('accepts chain name or chain ID and rejects mismatched chain selectors', async () => {
    await withTempHome(async (home) => {
      const configureByChainId = await runCli([
        'configure',
        '--chain-id',
        '84532',
        '--rpc-url',
        'http://127.0.0.1:8545',
      ], { home });
      expect(configureByChainId.code).toBe(0);
      expect(configureByChainId.stdout).toContain('Configuration updated for chain: base-sepolia');

      const configureMatchingPair = await runCli([
        'configure',
        '--chain',
        'sepolia',
        '--chain-id',
        '11155111',
        '--rpc-url',
        'http://127.0.0.1:9545',
      ], { home });
      expect(configureMatchingPair.code).toBe(0);
      expect(configureMatchingPair.stdout).toContain('Configuration updated for chain: sepolia');

      const config: unknown = JSON.parse(await readFile(join(home, '.rare', 'config.json'), 'utf8'));
      expect(config).toEqual({
        chains: {
          'base-sepolia': {
            rpcUrl: 'http://127.0.0.1:8545',
          },
          sepolia: {
            rpcUrl: 'http://127.0.0.1:9545',
          },
        },
      });

      const mismatch = await runCli([
        'configure',
        '--chain',
        'sepolia',
        '--chain-id',
        '1',
        '--rpc-url',
        'http://127.0.0.1:7545',
      ], { home });
      expect(mismatch.code).toBe(1);
      expect(mismatch.stdout).toBe('');
      expect(mismatch.stderr).toContain('--chain "sepolia" does not match --chain-id "1"');

      const deployHelp = await runCli(['collection', 'deploy', 'erc721', '--help'], { home });
      expect(deployHelp.code).toBe(0);
      expect(deployHelp.stdout).toContain('--chain <chain>');
      expect(deployHelp.stdout).toContain('--chain-id <id>');

      const treeHelp = await runCli(['utils', 'tree', 'build', '--help'], { home });
      expect(treeHelp.code).toBe(0);
      expect(treeHelp.stdout).toContain('--chain <chain>');
      expect(treeHelp.stdout).toContain('--chain-id <id>');
    });
  });

  it('surfaces 1Password CLI failures through JSON error output', async () => {
    await withTempHome(async (home) => {
      const result = await runCli([
        '--json',
        'configure',
        '--chain',
        'sepolia',
        '--private-key-ref',
        'op://Private/rare-sepolia/private-key',
      ], {
        home,
        env: {
          PATH: join(home, 'empty-bin'),
        },
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      const error: unknown = JSON.parse(result.stderr);
      expect(error).toEqual(expect.objectContaining({
        error: true,
        message: 'failed to read 1Password secret reference op://Private/rare-sepolia/private-key with "op read"',
      }));
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

      const savedJson = parseJsonStdout<{
        address: string;
        privateKey: string;
        saved: true;
        chain: string;
      }>(await runCli(['--json', 'wallet', 'generate', '--save', '--chain', 'sepolia'], { home }));
      expect(isAddress(savedJson.address)).toBe(true);
      expect(savedJson.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
      expect(savedJson.saved).toBe(true);
      expect(savedJson.chain).toBe('sepolia');

      const config: unknown = JSON.parse(await readFile(join(home, '.rare', 'config.json'), 'utf8'));
      if (!isConfigWithSepoliaPrivateKey(config)) {
        throw new Error('Expected saved config to include a Sepolia private key.');
      }
      expect(config.chains.sepolia.privateKey).toBe(savedJson.privateKey);

      const addressJson = parseJsonStdout<{ address: string; chain: string }>(
        await runCli(['--json', 'wallet', 'address', '--chain', 'sepolia'], { home }),
      );
      expect(addressJson).toEqual({
        address: privateKeyToAccount(savedJson.privateKey).address,
        chain: 'sepolia',
      });
    });
  });

  it('does not auto-generate and print wallet secrets for JSON commands', async () => {
    await withTempHome(async (home) => {
      const result = await runCli([
        '--json',
        'wallet',
        'address',
        '--chain',
        'sepolia',
      ], { home });

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).not.toContain('Private Key:');
      expect(result.stderr).not.toMatch(/0x[0-9a-f]{64}/);

      const error: unknown = JSON.parse(result.stderr);
      expect(error).toEqual(expect.objectContaining({
        error: true,
        message: expect.stringContaining('no wallet configured for "sepolia"'),
      }));
    });
  });

  it('exposes liquid edition deployment help', async () => {
    await withTempHome(async (home) => {
      const liquid = await runCli(['liquid-edition', 'deploy', 'multicurve', '--help'], { home });
      expect(liquid.code).toBe(0);
      expect(liquid.stdout).toContain('Usage: rare liquid-edition deploy multicurve [options] <name> <symbol>');
      expect(liquid.stdout).toContain('--curves-file <path>');
      expect(liquid.stdout).toContain('--initial-rare-liquidity <amount>');
      expect(liquid.stdout).toContain('--total-supply <amount>');
      expect(liquid.stderr).toBe('');
    });
  });

  it('exposes liquid edition management help', async () => {
    await withTempHome(async (home) => {
      const liquid = await runCli(['liquid-edition', '--help'], { home });
      expect(liquid.code).toBe(0);
      expect(liquid.stdout).toContain('status');
      expect(liquid.stdout).toContain('token-uri');
      expect(liquid.stdout).toContain('set-render-contract');
      expect(liquid.stderr).toBe('');

      const status = await runCli(['liquid-edition', 'status', '--help'], { home });
      expect(status.code).toBe(0);
      expect(status.stdout).toContain('Usage: rare liquid-edition status [options]');
      expect(status.stdout).toContain('--contract <address>');
      expect(status.stderr).toBe('');

      const setRenderContract = await runCli(['liquid-edition', 'set-render-contract', '--help'], { home });
      expect(setRenderContract.code).toBe(0);
      expect(setRenderContract.stdout).toContain('--render-contract <address>');
      expect(setRenderContract.stderr).toBe('');
    });
  });

  it('exposes lazy batch mint collection help', async () => {
    await withTempHome(async (home) => {
      const collection = await runCli(['collection', '--help'], { home });
      expect(collection.code).toBe(0);
      expect(collection.stdout).toContain('deploy');
      expect(collection.stdout).not.toContain('create');
      expect(collection.stdout).toContain('mint');
      expect(collection.stderr).toBe('');

      const deploy = await runCli(['collection', 'deploy', '--help'], { home });
      const mint = await runCli(['collection', 'mint', '--help'], { home });
      expect(mint.code).toBe(0);
      expect(mint.stdout).toContain('Usage: rare collection mint [options]');
      expect(mint.stdout).toContain('--contract <address>');
      expect(mint.stdout).toContain('--token-uri <uri>');
      expect(mint.stdout).toContain('--royalty-receiver <address>');
      expect(mint.stderr).toBe('');

      expect(deploy.code).toBe(0);
      expect(deploy.stdout).toContain('erc721');
      expect(deploy.stdout).toContain('lazy-erc721');
      expect(deploy.stdout).toContain('lazy-batch-mint');
      expect(deploy.stdout).not.toContain('sovereign');
      expect(deploy.stderr).toBe('');

      const lazyErc721 = await runCli(['collection', 'deploy', 'lazy-erc721', '--help'], { home });
      expect(lazyErc721.code).toBe(0);
      expect(lazyErc721.stdout).toContain('Usage: rare collection deploy lazy-erc721 [options] <name> <symbol>');
      expect(lazyErc721.stdout).toContain('--contract-type <type>');
      expect(lazyErc721.stdout).toContain('--max-tokens <number>');
      expect(lazyErc721.stderr).toBe('');

      const lazyBatchMint = await runCli(['collection', 'deploy', 'lazy-batch-mint', '--help'], { home });
      expect(lazyBatchMint.code).toBe(0);
      expect(lazyBatchMint.stdout).toContain('Usage: rare collection deploy lazy-batch-mint [options] <name> <symbol>');
      expect(lazyBatchMint.stdout).toContain('--max-tokens <number>');
      expect(lazyBatchMint.stdout).toContain('--chain-id <id>');
      expect(lazyBatchMint.stderr).toBe('');
    });
  });

  it('exposes auction parity command help', async () => {
    await withTempHome(async (home) => {
      const create = await runCli(['auction', 'create', '--help'], { home });
      expect(create.code).toBe(0);
      expect(create.stdout).toContain('Usage: rare auction create [options]');
      expect(create.stdout).toContain('--type <type>');
      expect(create.stdout).toContain('--start-time <seconds>');
      expect(create.stdout).toContain('--split <addr=ratio>');
      expect(create.stderr).toBe('');
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

  it('validates write-command local inputs before wallet setup', async () => {
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'auction',
        'create',
        '--contract',
        'not-an-address',
        '--token-id',
        '1',
        '--price',
        '0.1',
        '--end-time',
        '2000000000',
        '--chain',
        'sepolia',
      ],
      'Error: --contract must be a valid EVM address.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'auction',
        'create',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--token-id',
        '-1',
        '--price',
        '0.1',
        '--end-time',
        '2000000000',
        '--chain',
        'sepolia',
      ],
      'Error: tokenId must be greater than or equal to 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'auction',
        'create',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--token-id',
        '1',
        '--price',
        '0.1',
        '--end-time',
        '1',
        '--chain',
        'sepolia',
      ],
      'Error: endTime must be after the auction start time.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'auction',
        'bid',
        '--contract',
        'not-an-address',
        '--token-id',
        '1',
        '--price',
        '0.1',
        '--chain',
        'sepolia',
      ],
      'Error: --contract must be a valid EVM address.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'auction',
        'bid',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--token-id',
        '1',
        '--price',
        '0',
        '--chain',
        'sepolia',
      ],
      'Error: price must be greater than 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'auction',
        'settle',
        '--contract',
        'not-an-address',
        '--token-id',
        '1',
        '--chain',
        'sepolia',
      ],
      'Error: --contract must be a valid EVM address.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'auction',
        'cancel',
        '--contract',
        'not-an-address',
        '--token-id',
        '1',
        '--chain',
        'sepolia',
      ],
      'Error: --contract must be a valid EVM address.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'auction',
        'batch',
        'create',
        '--root',
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        '--price',
        '0',
        '--end-time',
        '2000000000',
        '--chain',
        'sepolia',
      ],
      'Error: price must be greater than 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'auction',
        'batch',
        'settle',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--token-id',
        '-1',
        '--chain',
        'sepolia',
      ],
      'Error: tokenId must be greater than or equal to 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'auction',
        'batch',
        'create',
        '--root',
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        '--price',
        '0.1',
        '--end-time',
        '1',
        '--chain',
        'sepolia',
      ],
      'Error: endTime must be in the future.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'auction',
        'batch',
        'bid',
        '--creator',
        '0x1111111111111111111111111111111111111111',
        '--contract',
        '0x2222222222222222222222222222222222222222',
        '--token-id',
        '-1',
        '--price',
        '0.1',
        '--chain',
        'sepolia',
      ],
      'Error: tokenId must be greater than or equal to 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'auction',
        'batch',
        'bid',
        '--creator',
        '0x1111111111111111111111111111111111111111',
        '--contract',
        '0x2222222222222222222222222222222222222222',
        '--token-id',
        '1',
        '--price',
        '0',
        '--chain',
        'sepolia',
      ],
      'Error: price must be greater than 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'auction',
        'batch',
        'cancel',
        '--root',
        '0x1234',
        '--chain',
        'sepolia',
      ],
      'Error: --root must be a bytes32 hex string.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'collection',
        'mint-batch',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--base-uri',
        'ipfs://example/',
        '--amount',
        '0',
        '--chain',
        'sepolia',
      ],
      'Error: amount must be greater than 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'collection',
        'prepare-lazy-mint',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--base-uri',
        'ipfs://example/',
        '--amount',
        '0',
        '--chain',
        'sepolia',
      ],
      'Error: amount must be greater than 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'collection',
        'royalty',
        'set-default-percentage',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--percentage',
        '101',
        '--chain',
        'sepolia',
      ],
      'Error: percentage must be between 0 and 100.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'collection',
        'royalty',
        'set-token-receiver',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--token-id',
        '-1',
        '--receiver',
        '0x2222222222222222222222222222222222222222',
        '--chain',
        'sepolia',
      ],
      'Error: tokenId must be greater than or equal to 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'collection',
        'metadata',
        'update-token-uri',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--token-id',
        '-1',
        '--token-uri',
        'ipfs://example/1',
        '--chain',
        'sepolia',
      ],
      'Error: tokenId must be greater than or equal to 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'collection',
        'deploy',
        'erc721',
        'Test Collection',
        'TEST',
        '--max-tokens',
        '0',
        '--chain',
        'sepolia',
      ],
      'Error: maxTokens must be greater than 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'collection',
        'deploy',
        'lazy-batch-mint',
        'Test Collection',
        'TEST',
        '--max-tokens',
        '0',
        '--chain',
        'sepolia',
      ],
      'Error: maxTokens must be greater than 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'collection',
        'deploy',
        'lazy-erc721',
        'Test Collection',
        'TEST',
        '--max-tokens',
        '0',
        '--chain',
        'sepolia',
      ],
      'Error: maxTokens must be greater than 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'collection',
        'mint',
        '--contract',
        'not-an-address',
        '--token-uri',
        'ipfs://example/1',
        '--chain',
        'sepolia',
      ],
      'Error: --contract must be a valid EVM address.',
    );
    await expectLocalValidationBeforeWalletSetup(
      (home) => [
        'collection',
        'mint',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--name',
        'Test NFT',
        '--description',
        'Test description',
        '--image',
        join(home, 'missing-image.png'),
        '--chain',
        'sepolia',
      ],
      'Error: Could not read image file:',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'offer',
        'batch',
        'create',
        '--root',
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        '--price',
        '0',
        '--end-time',
        '2000000000',
        '--chain',
        'sepolia',
      ],
      'Error: price must be greater than 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'offer',
        'batch',
        'create',
        '--root',
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        '--price',
        '0.1',
        '--end-time',
        '1',
        '--chain',
        'sepolia',
      ],
      'Error: expiry must be in the future.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'offer',
        'batch',
        'accept',
        '--creator',
        '0x1111111111111111111111111111111111111111',
        '--contract',
        '0x2222222222222222222222222222222222222222',
        '--token-id',
        '-1',
        '--chain',
        'sepolia',
      ],
      'Error: tokenId must be greater than or equal to 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'import',
        'erc721',
        '--contract',
        'not-an-address',
        '--chain',
        'sepolia',
      ],
      'Error: --contract must be a valid EVM address.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'liquid-edition',
        'set-render-contract',
        '--contract',
        'not-an-address',
        '--render-contract',
        '0x2222222222222222222222222222222222222222',
        '--chain',
        'sepolia',
      ],
      'Error: --contract must be a valid EVM address.',
    );
    await expectLocalValidationBeforeWalletSetup(
      (home) => [
        'liquid-edition',
        'deploy',
        'multicurve',
        'Test Liquid',
        'TLQ',
        '--curve-preset',
        'low-demand',
        '--description',
        'Test liquid edition',
        '--image',
        join(home, 'missing-liquid-image.png'),
        '--yes',
        '--chain',
        'sepolia',
      ],
      'Error: Could not read image file:',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'listing',
        'create',
        '--contract',
        'not-an-address',
        '--token-id',
        '1',
        '--price',
        '0.1',
        '--chain',
        'sepolia',
      ],
      'Error: --contract must be a valid EVM address.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'listing',
        'create',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--token-id',
        '-1',
        '--price',
        '0.1',
        '--chain',
        'sepolia',
      ],
      'Error: tokenId must be greater than or equal to 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'listing',
        'create',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--token-id',
        '1',
        '--price',
        '-1',
        '--chain',
        'sepolia',
      ],
      'Error: price must be greater than or equal to 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'listing',
        'cancel',
        '--contract',
        'not-an-address',
        '--token-id',
        '1',
        '--chain',
        'sepolia',
      ],
      'Error: --contract must be a valid EVM address.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'listing',
        'buy',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--token-id',
        '1',
        '--price',
        '0',
        '--chain',
        'sepolia',
      ],
      'Error: price must be greater than 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'listing',
        'buy',
        '--contract',
        'not-an-address',
        '--token-id',
        '1',
        '--price',
        '0.1',
        '--chain',
        'sepolia',
      ],
      'Error: --contract must be a valid EVM address.',
    );
    await expectLocalValidationBeforeWalletSetup(
      async (home) => {
        const input = join(home, 'bad-batch-listing-root.json');
        await writeFile(input, '{}', 'utf8');
        return [
          'listing',
          'batch',
          'create',
          '--input',
          input,
          '--chain',
          'sepolia',
        ];
      },
      'Error: root must be a 0x-prefixed bytes32 hex string',
    );
    await expectLocalValidationBeforeWalletSetup(
      async (home) => {
        const input = join(home, 'bad-batch-listing-splits.json');
        await writeFile(input, JSON.stringify({
          root: '0x1111111111111111111111111111111111111111111111111111111111111111',
          currency: zeroAddress,
          amount: '1000000000000000000',
          splitAddresses: ['0x1111111111111111111111111111111111111111'],
          splitRatios: [],
          tokens: [
            { contract: '0x2222222222222222222222222222222222222222', tokenId: '1' },
            { contract: '0x2222222222222222222222222222222222222222', tokenId: '2' },
          ],
        }), 'utf8');
        return [
          'listing',
          'batch',
          'create',
          '--input',
          input,
          '--chain',
          'sepolia',
        ];
      },
      'Error: splitAddresses and splitRatios must have the same length.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'listing',
        'batch',
        'cancel',
        '--root',
        '0x1234',
        '--chain',
        'sepolia',
      ],
      'Error: --root must be a 0x-prefixed bytes32 hex string',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'listing',
        'batch',
        'cancel',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--token-id',
        '-1',
        '--chain',
        'sepolia',
      ],
      'Error: tokenId must be greater than or equal to 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'listing',
        'batch',
        'buy',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--token-id',
        '1',
        '--creator',
        'not-an-address',
        '--currency',
        'eth',
        '--price',
        '0.1',
        '--chain',
        'sepolia',
      ],
      'Error: --creator must be a valid EVM address.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'listing',
        'batch',
        'buy',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--token-id',
        '1',
        '--creator',
        '0x2222222222222222222222222222222222222222',
        '--currency',
        'eth',
        '--price',
        'abc',
        '--chain',
        'sepolia',
      ],
      'Error: Number `abc` is not a valid decimal number.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'listing',
        'batch',
        'set-allowlist',
        '--root',
        '0x1234',
        '--chain',
        'sepolia',
      ],
      'Error: --root must be a 0x-prefixed bytes32 hex string',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'listing',
        'batch',
        'set-allowlist',
        '--root',
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        '--allowlist-root',
        '0x2222222222222222222222222222222222222222222222222222222222222222',
        '--end-time',
        'abc',
        '--chain',
        'sepolia',
      ],
      'Error: endTime must be an integer.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'offer',
        'create',
        '--contract',
        'not-an-address',
        '--token-id',
        '1',
        '--price',
        '0.1',
        '--chain',
        'sepolia',
      ],
      'Error: --contract must be a valid EVM address.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'offer',
        'create',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--token-id',
        '-1',
        '--price',
        '0.1',
        '--chain',
        'sepolia',
      ],
      'Error: tokenId must be greater than or equal to 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'offer',
        'create',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--token-id',
        '1',
        '--price',
        '0',
        '--chain',
        'sepolia',
      ],
      'Error: price must be greater than 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'offer',
        'cancel',
        '--contract',
        'not-an-address',
        '--token-id',
        '1',
        '--chain',
        'sepolia',
      ],
      'Error: --contract must be a valid EVM address.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'offer',
        'accept',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--token-id',
        '1',
        '--price',
        '0',
        '--chain',
        'sepolia',
      ],
      'Error: price must be greater than 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'offer',
        'accept',
        '--contract',
        'not-an-address',
        '--token-id',
        '1',
        '--price',
        '0.1',
        '--chain',
        'sepolia',
      ],
      'Error: --contract must be a valid EVM address.',
    );
    await expectLocalValidationBeforeWalletSetup(
      async (home) => {
        const input = join(home, 'bad-allowlist-artifact.json');
        await writeFile(input, '{ "kind": ', 'utf8');
        return [
          'listing',
          'release',
          'allowlist',
          'set',
          '--contract',
          '0x1111111111111111111111111111111111111111',
          '--end-time',
          '2000000000',
          '--input',
          input,
          '--chain',
          'sepolia',
        ];
      },
      'Error: Malformed allowlist artifact JSON:',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'listing',
        'release',
        'configure',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--price',
        '0',
        '--max-mints',
        '-1',
        '--chain',
        'sepolia',
      ],
      'Error: maxMints must be an integer between 0 and 100.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'listing',
        'release',
        'configure',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--price',
        'abc',
        '--max-mints',
        '1',
        '--chain',
        'sepolia',
      ],
      'Error: Number `abc` is not a valid decimal number.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'listing',
        'release',
        'allowlist',
        'set',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--root',
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        '--end-time',
        'abc',
        '--chain',
        'sepolia',
      ],
      'Error: endTime must be a unix timestamp or ISO date string.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'listing',
        'release',
        'mint',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--quantity',
        '0',
        '--yes',
        '--chain',
        'sepolia',
      ],
      'Error: quantity must be greater than 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'listing',
        'release',
        'mint',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--price',
        'abc',
        '--yes',
        '--chain',
        'sepolia',
      ],
      'Error: Number `abc` is not a valid decimal number.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'listing',
        'release',
        'limits',
        'set-mint',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--limit',
        '-1',
        '--chain',
        'sepolia',
      ],
      'Error: limit must be greater than or equal to 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'listing',
        'release',
        'limits',
        'set-tx',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--limit',
        '-1',
        '--chain',
        'sepolia',
      ],
      'Error: limit must be greater than or equal to 0.',
    );
    await expectLocalValidationBeforeWalletSetup(
      async (home) => {
        const inputs = join(home, 'swap-inputs.json');
        await writeFile(inputs, '[]', 'utf8');
        return [
          'swap',
          'tokens',
          '--token-in',
          'not-an-address',
          '--amount-in',
          '1',
          '--token-out',
          '0x1111111111111111111111111111111111111111',
          '--min-amount-out',
          '1',
          '--commands',
          '0x',
          '--inputs-file',
          inputs,
          '--yes',
          '--chain',
          'sepolia',
        ];
      },
      'Error: token-in must be a valid EVM address.',
    );
    await expectLocalValidationBeforeWalletSetup(
      async (home) => {
        const inputs = join(home, 'swap-inputs.json');
        await writeFile(inputs, '[]', 'utf8');
        return [
          'swap',
          'buy-token',
          '--token',
          'not-an-address',
          '--amount-in',
          '1',
          '--route',
          'raw',
          '--min-amount-out',
          '1',
          '--commands',
          '0x',
          '--inputs-file',
          inputs,
          '--yes',
          '--chain',
          'sepolia',
        ];
      },
      'Error: token must be a valid EVM address.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'swap',
        'buy-token',
        '--token',
        'not-an-address',
        '--amount-in',
        '1',
        '--yes',
        '--chain',
        'sepolia',
      ],
      'Error: token must be a valid EVM address.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'swap',
        'buy-token',
        '--token',
        '0x1111111111111111111111111111111111111111',
        '--amount-in',
        'abc',
        '--yes',
        '--chain',
        'sepolia',
      ],
      'Error: Number `abc` is not a valid decimal number.',
    );
    await expectLocalValidationBeforeWalletSetup(
      async (home) => {
        const inputs = join(home, 'swap-inputs.json');
        await writeFile(inputs, '[]', 'utf8');
        return [
          'swap',
          'sell-token',
          '--token',
          'not-an-address',
          '--amount-in',
          '1',
          '--route',
          'raw',
          '--min-amount-out',
          '1',
          '--commands',
          '0x',
          '--inputs-file',
          inputs,
          '--yes',
          '--chain',
          'sepolia',
        ];
      },
      'Error: token must be a valid EVM address.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'swap',
        'sell-token',
        '--token',
        'not-an-address',
        '--amount-in',
        '1',
        '--yes',
        '--chain',
        'sepolia',
      ],
      'Error: token must be a valid EVM address.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'swap',
        'sell-token',
        '--token',
        '0x1111111111111111111111111111111111111111',
        '--amount-in',
        'abc',
        '--yes',
        '--chain',
        'sepolia',
      ],
      'Error: Number `abc` is not a valid decimal number.',
    );
    await expectLocalValidationBeforeWalletSetup(
      () => [
        'swap',
        'buy-rare',
        '--amount-in',
        '1',
        '--recipient',
        'not-an-address',
        '--yes',
        '--chain',
        'sepolia',
      ],
      'Error: recipient must be a valid EVM address.',
    );
  });

  it('lists supported currencies as JSON without wallet setup', async () => {
    await withTempHome(async (home) => {
      const currencies = parseJsonStdout<{ name: string; address: string }[]>(
        await runCli(['--json', 'currencies', '--chain', 'sepolia'], { home }),
      );

      expect(currencies).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'ETH', address: zeroAddress }),
        expect.objectContaining({ name: 'RARE' }),
        expect.objectContaining({ name: 'USDC' }),
      ]));
    });
  });

  it('imports an ERC-721 collection through the configured wallet owner', async () => {
    await withTempHome(async (home) => {
      await withRareApiFixture(async ({ baseUrl, requests }) => {
        const privateKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        const owner = privateKeyToAccount(privateKey).address;
        const contract = '0x1111111111111111111111111111111111111111';
        const configured = await runCli([
          'configure',
          '--chain',
          'sepolia',
          '--private-key',
          privateKey,
          '--rpc-url',
          'http://127.0.0.1:9',
        ], { home });
        expect(configured.code).toBe(0);

        const result = parseJsonStdout<{
          imported: true;
          chain: string;
          chainId: number;
          contract: string;
          owner: string;
        }>(
          await runCli([
            '--json',
            'import',
            'erc721',
            '--contract',
            contract,
            '--chain',
            'sepolia',
          ], {
            home,
            env: { RARE_API_BASE_URL: baseUrl },
            timeoutMs: 30_000,
          }),
        );

        expect(result).toEqual({
          imported: true,
          chain: 'sepolia',
          chainId: 11_155_111,
          contract,
          owner,
        });
        expect(requests).toEqual([
          expect.objectContaining({
            method: 'POST',
            pathname: '/v1/collections/import',
            body: {
              chainId: 11_155_111,
              contractAddress: contract,
              ownerAddress: owner.toLowerCase(),
            },
          }),
        ]);
      });
    });
  });

  it('covers read/API CLI command wiring and validation', async (ctx) => {
    await withTempHome(async (home) => {
      const tokenSearch = parseJsonStdout<{
        pagination: { page: number; perPage: number };
        data: { chainId: number; contractAddress: string; tokenId: string; universalTokenId: string }[];
      }>(
        skipIfRareApiUnavailable(ctx, await runCli(
          ['--json', 'search', 'nfts', '--chain', 'mainnet', '--per-page', '1'],
          { home, timeoutMs: 30_000 },
        )),
      );
      expect(tokenSearch.pagination).toMatchObject({ page: 1, perPage: 1 });
      expect(Array.isArray(tokenSearch.data)).toBe(true);
      const firstNft = tokenSearch.data[0];
      if (firstNft === undefined) {
        throw new Error('Expected at least one NFT search result.');
      }

      const nftGet = parseJsonStdout<{ universalTokenId: string }>(
        skipIfRareApiUnavailable(ctx, await runCli([
          '--json',
          'nft',
          'get',
          '--chain-id',
          String(firstNft.chainId),
          '--contract',
          firstNft.contractAddress,
          '--token-id',
          firstNft.tokenId,
        ], { home, timeoutMs: 30_000 })),
      );
      expect(nftGet.universalTokenId).toBe(firstNft.universalTokenId);

      const nftEvents = parseJsonStdout<{ pagination: { page: number; perPage: number }; data: unknown[] }>(
        skipIfRareApiUnavailable(ctx, await runCli([
          '--json',
          'search',
          'events',
          '--chain-id',
          String(firstNft.chainId),
          '--contract',
          firstNft.contractAddress,
          '--token-id',
          firstNft.tokenId,
          '--event-type',
          'CREATE_NFT',
          '--per-page',
          '1',
        ], { home, timeoutMs: 30_000 })),
      );
      expect(nftEvents.pagination).toMatchObject({ page: 1, perPage: 1 });
      expect(Array.isArray(nftEvents.data)).toBe(true);

      const collectionSearch = parseJsonStdout<{
        pagination: { page: number; perPage: number };
        data: { collectionId: string }[];
      }>(
        await runCli(['--json', 'search', 'collections', '--chain', 'mainnet', '--per-page', '1'], {
          home,
          timeoutMs: 30_000,
        }),
      );
      expect(collectionSearch.pagination).toMatchObject({ page: 1, perPage: 1 });
      expect(Array.isArray(collectionSearch.data)).toBe(true);
      const firstCollection = collectionSearch.data[0];
      if (firstCollection === undefined) {
        throw new Error('Expected at least one collection search result.');
      }

      const collectionGet = parseJsonStdout<{ collectionId: string }>(
        await runCli(['--json', 'collection', 'get', firstCollection.collectionId], {
          home,
          timeoutMs: 30_000,
        }),
      );
      expect(collectionGet.collectionId).toBe(firstCollection.collectionId);

      const collectionEvents = parseJsonStdout<{ pagination: { page: number; perPage: number }; data: unknown[] }>(
        await runCli([
          '--json',
          'search',
          'events',
          '--collection-id',
          firstCollection.collectionId,
          '--event-type',
          'CREATE_NFT',
          '--per-page',
          '1',
        ], { home, timeoutMs: 30_000 }),
      );
      expect(collectionEvents.pagination).toMatchObject({ page: 1, perPage: 1 });
      expect(Array.isArray(collectionEvents.data)).toBe(true);

      const user = parseJsonStdout<{ address: string }>(
        await runCli([
          '--json',
          'user',
          'get',
          '0x510FF10EFfd8b645D177b04541544DD54067C839',
        ], { home, timeoutMs: 30_000 }),
      );
      expect(user.address.toLowerCase()).toBe('0x510ff10effd8b645d177b04541544dd54067c839');

      const auctions = parseJsonStdout<{ pagination: { page: number; perPage: number }; data: unknown[] }>(
        skipIfRareApiUnavailable(ctx, await runCli([
          '--json',
          'search',
          'nfts',
          '--chain',
          'mainnet',
          '--auction-state',
          'RUNNING',
          '--per-page',
          '1',
        ], { home, timeoutMs: 30_000 })),
      );
      expect(auctions.pagination).toMatchObject({ page: 1, perPage: 1 });
      expect(Array.isArray(auctions.data)).toBe(true);

      const searchHelp = await runCli(['search', 'nfts', '--help'], { home });
      expect(searchHelp.code).toBe(0);
      expect(searchHelp.stdout).toContain('--has-auction');
      expect(searchHelp.stdout).toContain('--auction-state <state>');
      expect(searchHelp.stdout).toContain('--has-listing');
      expect(searchHelp.stdout).toContain('--has-offer');

      const searchEventsHelp = await runCli(['search', 'events', '--help'], { home });
      expect(searchEventsHelp.code).toBe(0);
      expect(searchEventsHelp.stdout).toContain('Usage: rare search events [options]');
      expect(searchEventsHelp.stdout).toContain('--collection-id <id>');
      expect(searchEventsHelp.stdout).toContain('--contract <address>');
      expect(searchEventsHelp.stdout).toContain('--token-id <id>');
      expect(searchEventsHelp.stdout).toContain('--event-type <type>');

      const userHelp = await runCli(['user', 'get', '--help'], { home });
      expect(userHelp.code).toBe(0);
      expect(userHelp.stdout).toContain('Usage: rare user get [options] <address>');
      expect(userHelp.stdout).not.toContain('--chain <chain>');
      expect(userHelp.stdout).not.toContain('--chain-id <id>');

      const removedUserLookupCommand = await runCli(['user', 'lookup'], { home });
      expect(removedUserLookupCommand.code).toBe(1);
      expect(removedUserLookupCommand.stderr).toContain("unknown command 'lookup'");

      const nftGetHelp = await runCli(['nft', 'get', '--help'], { home });
      expect(nftGetHelp.code).toBe(0);
      expect(nftGetHelp.stdout).toContain('Usage: rare nft get [options]');
      expect(nftGetHelp.stdout).toContain('--contract <address>');
      expect(nftGetHelp.stdout).toContain('--token-id <id>');

      const removedBatchCommand = await runCli(['batch'], { home });
      expect(removedBatchCommand.code).toBe(1);
      expect(removedBatchCommand.stderr).toContain("unknown command 'batch'");

      const configured = await runCli([
        'configure',
        '--chain',
        'sepolia',
        '--private-key',
        '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        '--rpc-url',
        'http://127.0.0.1:8545',
      ], { home });
      expect(configured.code).toBe(0);

      const badImport = await runCli([
        'import',
        'erc721',
        '--contract',
        'not-an-address',
        '--chain',
        'sepolia',
      ], { home });
      expect(badImport.code).toBe(1);
      expect(badImport.stdout).toBe('');
      expect(badImport.stderr).toContain('Error: --contract must be a valid EVM address.');

      const badStatus = await runCli([
        'status',
        '--contract',
        'not-an-address',
        '--chain',
        'sepolia',
      ], { home });
      expect(badStatus.code).toBe(1);
      expect(badStatus.stdout).toBe('');
      expect(badStatus.stderr).toContain('Error: --contract must be a valid EVM address.');
    });
  });

  it('exposes utility merkle and batch listing flags', async () => {
    await withTempHome(async (home) => {
      const proofHelp = await runCli(['utils', 'merkle', 'proof', '--help'], { home });
      expect(proofHelp.code).toBe(0);
      expect(proofHelp.stdout).toContain('Usage: rare utils merkle proof [options]');
      expect(proofHelp.stdout).toContain('--input <path>');
      expect(proofHelp.stdout).not.toContain('--root <path>');
      expect(proofHelp.stdout).toContain('--output <path>');
      expect(proofHelp.stdout).toContain('--buyer <address>');

      const createHelp = await runCli(['listing', 'batch', 'create', '--help'], { home });
      expect(createHelp.code).toBe(0);
      expect(createHelp.stdout).toContain('--input <path>');
      expect(createHelp.stdout).not.toContain('--root <path>');
      expect(createHelp.stdout).toContain('--yes');
      expect(createHelp.stdout).toContain('--chain-id <id>');
      expect(createHelp.stdout).not.toContain('--no-approve');

      const setAllowListHelp = await runCli(['listing', 'batch', 'set-allowlist', '--help'], { home });
      expect(setAllowListHelp.code).toBe(0);
      expect(setAllowListHelp.stdout).toContain('--input <path>');
      expect(setAllowListHelp.stdout).toContain('--root <hex>');
      expect(setAllowListHelp.stdout).toContain('--contract <address>');
      expect(setAllowListHelp.stdout).toContain('--token-id <id>');
      expect(setAllowListHelp.stdout).toContain('--allowlist-root <hex>');
      expect(setAllowListHelp.stdout).toContain('--end-time <unix>');
      expect(setAllowListHelp.stdout).not.toContain('--yes');

      const cancelHelp = await runCli(['listing', 'batch', 'cancel', '--help'], { home });
      expect(cancelHelp.code).toBe(0);
      expect(cancelHelp.stdout).toContain('--input <path>');
      expect(cancelHelp.stdout).toContain('--root <hex>');
      expect(cancelHelp.stdout).toContain('--contract <address>');
      expect(cancelHelp.stdout).toContain('--token-id <id>');
      expect(cancelHelp.stdout).not.toContain('--yes');
    });
  });

  it('exposes account market list command help', async () => {
    await withTempHome(async (home) => {
      const collection = await runCli(['collection', 'list', '--help'], { home });
      expect(collection.code).toBe(0);
      expect(collection.stdout).toContain('Usage: rare collection list [options]');
      expect(collection.stdout).toContain('--account <address>');
      expect(collection.stdout).toContain('--chain-id <id>');

      const listing = await runCli(['listing', 'list', '--help'], { home });
      expect(listing.code).toBe(0);
      expect(listing.stdout).toContain('Usage: rare listing list [options]');
      expect(listing.stdout).toContain('--account <address>');

      const offer = await runCli(['offer', 'list', '--help'], { home });
      expect(offer.code).toBe(0);
      expect(offer.stdout).toContain('Usage: rare offer list [options]');
      expect(offer.stdout).toContain('--side <maker|taker>');

      const auction = await runCli(['auction', 'list', '--help'], { home });
      expect(auction.code).toBe(0);
      expect(auction.stdout).toContain('Usage: rare auction list [options]');
      expect(auction.stdout).toContain('--side <maker|taker>');

      const batchListing = await runCli(['listing', 'batch', 'list', '--help'], { home });
      expect(batchListing.code).toBe(0);
      expect(batchListing.stdout).toContain('Usage: rare listing batch list [options]');
      expect(batchListing.stdout).toContain('--account <address>');
    });
  });

  it('lists collections owned by an account', async (ctx) => {
    await withTempHome(async (home) => {
      await withRareApiFixture(async ({ baseUrl, requests }) => {
        const account = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
        const result = parseJsonStdout<{
          pagination: { page: number; perPage: number; totalCount: number };
          data: { collectionId: string }[];
        }>(
          skipIfRareApiUnavailable(ctx, await runCli([
            '--json',
            'collection',
            'list',
            '--account',
            account,
            '--chain',
            'mainnet',
            '--page',
            '2',
            '--per-page',
            '1',
          ], {
            home,
            env: { RARE_API_BASE_URL: baseUrl },
            timeoutMs: 30_000,
          })),
        );

        expect(result.pagination).toMatchObject({ page: 2, perPage: 1, totalCount: 1 });
        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.collectionId).toBe('mainnet-owned-collection');
        expect(requests).toEqual([
          expect.objectContaining({
            pathname: '/v1/collections',
            query: expect.objectContaining({
              ownerAddress: account,
              chainId: '1',
              page: '2',
              perPage: '1',
            }),
          }),
        ]);
      });
    });
  });

  it('lists auctions for an account as maker and taker', async (ctx) => {
    await withTempHome(async (home) => {
      await withRareApiFixture(async ({ baseUrl, requests }) => {
        const account = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
        const baseArgs = [
          '--json',
          'auction',
          'list',
          '--account',
          account,
          '--chain',
          'mainnet',
          '--per-page',
          '1',
        ];

        for (const side of ['maker', 'taker']) {
          const result = parseJsonStdout<{ pagination: { page: number; perPage: number; totalCount: number }; data: { universalTokenId: string }[] }>(
            skipIfRareApiUnavailable(ctx, await runCli([...baseArgs, '--side', side], {
              home,
              env: { RARE_API_BASE_URL: baseUrl },
              timeoutMs: 30_000,
            })),
          );

          expect(result.pagination).toMatchObject({ page: 1, perPage: 1, totalCount: 1 });
          expect(result.data).toHaveLength(1);
          expect(result.data[0]?.universalTokenId).toBe(`mainnet-auction-${side}`);
        }

        expect(requests).toEqual([
          expect.objectContaining({
            pathname: '/v1/nfts',
            query: expect.objectContaining({
              auctionCreatorAddress: account,
              chainId: '1',
              hasAuction: 'true',
              page: '1',
              perPage: '1',
            }),
          }),
          expect.objectContaining({
            pathname: '/v1/nfts',
            query: expect.objectContaining({
              auctionBidderAddress: account,
              chainId: '1',
              hasAuction: 'true',
              page: '1',
              perPage: '1',
            }),
          }),
        ]);
      });
    });
  });

  it('lists token listings, batch listings, and offers for an account', async (ctx) => {
    await withTempHome(async (home) => {
      await withRareApiFixture(async ({ baseUrl, requests }) => {
        const account = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
        const listing = parseJsonStdout<{ pagination: { page: number; perPage: number; totalCount: number }; data: { universalTokenId: string }[] }>(
          skipIfRareApiUnavailable(ctx, await runCli([
            '--json',
            'listing',
            'list',
            '--account',
            account,
            '--chain',
            'mainnet',
            '--page',
            '3',
            '--per-page',
            '2',
          ], {
            home,
            env: { RARE_API_BASE_URL: baseUrl },
            timeoutMs: 30_000,
          })),
        );
        expect(listing.pagination).toMatchObject({ page: 3, perPage: 2, totalCount: 1 });
        expect(listing.data[0]?.universalTokenId).toBe('mainnet-token-listing');

        const batchListing = parseJsonStdout<{ data: { universalTokenId: string }[] }>(
          skipIfRareApiUnavailable(ctx, await runCli([
            '--json',
            'listing',
            'batch',
            'list',
            '--account',
            account,
            '--chain',
            'mainnet',
            '--per-page',
            '1',
          ], {
            home,
            env: { RARE_API_BASE_URL: baseUrl },
            timeoutMs: 30_000,
          })),
        );
        expect(batchListing.data[0]?.universalTokenId).toBe('mainnet-batch-listing');

        for (const side of ['maker', 'taker']) {
          const offer = parseJsonStdout<{ data: { universalTokenId: string }[] }>(
            skipIfRareApiUnavailable(ctx, await runCli([
              '--json',
              'offer',
              'list',
              '--account',
              account,
              '--side',
              side,
              '--chain',
              'mainnet',
              '--per-page',
              '1',
            ], {
              home,
              env: { RARE_API_BASE_URL: baseUrl },
              timeoutMs: 30_000,
            })),
          );
          expect(offer.data[0]?.universalTokenId).toBe(`mainnet-offer-${side}`);
        }

        expect(requests).toEqual([
          expect.objectContaining({
            pathname: '/v1/nfts',
            query: expect.objectContaining({
              ownerAddress: account,
              chainId: '1',
              hasListing: 'true',
              listingType: 'SALE_PRICE',
              page: '3',
              perPage: '2',
            }),
          }),
          expect.objectContaining({
            pathname: '/v1/nfts',
            query: expect.objectContaining({
              ownerAddress: account,
              chainId: '1',
              hasListing: 'true',
              listingType: 'BATCH_SALE_PRICE',
              page: '1',
              perPage: '1',
            }),
          }),
          expect.objectContaining({
            pathname: '/v1/nfts',
            query: expect.objectContaining({
              offerBuyerAddress: account,
              chainId: '1',
              hasOffer: 'true',
              page: '1',
              perPage: '1',
            }),
          }),
          expect.objectContaining({
            pathname: '/v1/nfts',
            query: expect.objectContaining({
              ownerAddress: account,
              chainId: '1',
              hasOffer: 'true',
              page: '1',
              perPage: '1',
            }),
          }),
        ]);
      });
    });
  });

  it('lists auction results discovered through NFT search', async (ctx) => {
    await withTempHome(async (home) => {
      const search = parseJsonStdout<{ data: AuctionSearchNft[] }>(
        skipIfRareApiUnavailable(ctx, await runCli([
          '--json',
          'search',
          'nfts',
          '--chain',
          'mainnet',
          '--has-auction',
          '--auction-state',
          'RUNNING',
          '--per-page',
          '10',
        ], { home, timeoutMs: 30_000 })),
      );
      const candidate = findAuctionListCandidate(search.data);
      if (candidate === undefined) {
        ctx.skip('Rare API did not return a running auction with a bidder to verify auction list.');
        return;
      }
      const maker = parseJsonStdout<{ data: AuctionSearchNft[] }>(
        skipIfRareApiUnavailable(ctx, await runCli([
          '--json',
          'auction',
          'list',
          '--account',
          candidate.auction.sellerAddress,
          '--side',
          'maker',
          '--chain',
          'mainnet',
          '--per-page',
          '50',
        ], { home, timeoutMs: 30_000 })),
      );
      expectAuctionSearchResult(maker.data, candidate, 'maker');

      const taker = parseJsonStdout<{ data: AuctionSearchNft[] }>(
        skipIfRareApiUnavailable(ctx, await runCli([
          '--json',
          'auction',
          'list',
          '--account',
          candidate.bidder,
          '--side',
          'taker',
          '--chain',
          'mainnet',
          '--per-page',
          '50',
        ], { home, timeoutMs: 30_000 })),
      );
      expectAuctionSearchResult(taker.data, candidate, 'taker');
    });
  });

  it('rejects invalid account market list options before API requests', async () => {
    await withTempHome(async (home) => {
      const invalidAccount = await runCli(['listing', 'list', '--account', 'not-an-address'], { home });
      expect(invalidAccount.code).toBe(1);
      expect(invalidAccount.stderr).toContain('--account must be a valid EVM address.');

      const invalidSide = await runCli([
        'offer',
        'list',
        '--account',
        '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        '--side',
        'both',
      ], { home });
      expect(invalidSide.code).toBe(1);
      expect(invalidSide.stderr).toContain('--side must be one of: maker, taker');

      const invalidPage = await runCli([
        'auction',
        'list',
        '--account',
        '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        '--side',
        'maker',
        '--page',
        '0',
      ], { home });
      expect(invalidPage.code).toBe(1);
      expect(invalidPage.stderr).toContain('--page must be a positive integer.');

      const invalidSearchPage = await runCli([
        'search',
        'nfts',
        '--page',
        '10abc',
      ], { home });
      expect(invalidSearchPage.code).toBe(1);
      expect(invalidSearchPage.stderr).toContain('--page must be a positive integer.');
    });
  });

  it('exposes utility tree command help', async () => {
    await withTempHome(async (home) => {
      const build = await runCli(['utils', 'tree', 'build', '--help'], { home });
      expect(build.code).toBe(0);
      expect(build.stdout).toContain('Usage: rare utils tree build [options]');
      expect(build.stdout).toContain('--input <path>');
      expect(build.stdout).toContain('--chain-id <id>');
      expect(build.stderr).toBe('');

      const proof = await runCli(['utils', 'tree', 'proof', '--help'], { home });
      expect(proof.code).toBe(0);
      expect(proof.stdout).toContain('Usage: rare utils tree proof [options]');
      expect(proof.stdout).toContain('--contract <address>');
      expect(proof.stdout).toContain('--token-id <id>');
      expect(proof.stderr).toBe('');

      const offerCreate = await runCli(['offer', 'batch', 'create', '--help'], { home });
      expect(offerCreate.code).toBe(0);
      expect(offerCreate.stdout).toContain('Usage: rare offer batch create [options]');
      expect(offerCreate.stdout).toContain('--price <amount>');
      expect(offerCreate.stdout).toContain('--end-time <time>');
      expect(offerCreate.stderr).toBe('');

      const offerAccept = await runCli(['offer', 'batch', 'accept', '--help'], { home });
      expect(offerAccept.code).toBe(0);
      expect(offerAccept.stdout).toContain('Usage: rare offer batch accept [options]');
      expect(offerAccept.stdout).toContain('--proof <path>');
      expect(offerAccept.stdout).toContain('--creator <address>');
      expect(offerAccept.stderr).toBe('');

      const auctionCreate = await runCli(['auction', 'batch', 'create', '--help'], { home });
      expect(auctionCreate.code).toBe(0);
      expect(auctionCreate.stdout).toContain('Usage: rare auction batch create [options]');
      expect(auctionCreate.stdout).toContain('--price <amount>');
      expect(auctionCreate.stdout).toContain('--end-time <time>');
      expect(auctionCreate.stderr).toBe('');

      const auctionBid = await runCli(['auction', 'batch', 'bid', '--help'], { home });
      expect(auctionBid.code).toBe(0);
      expect(auctionBid.stdout).toContain('Usage: rare auction batch bid [options]');
      expect(auctionBid.stdout).toContain('--proof <path>');
      expect(auctionBid.stdout).toContain('--creator <address>');
      expect(auctionBid.stderr).toBe('');
    });
  });

  it('exposes token-specific offer flags on the offer commands', async () => {
    await withTempHome(async (home) => {
      const create = await runCli(['offer', 'create', '--help'], { home });
      expect(create.code).toBe(0);
      expect(create.stdout).toContain('Usage: rare offer create [options]');
      expect(create.stdout).toContain('--contract <address>');
      expect(create.stdout).toContain('--token-id <id>');
      expect(create.stdout).toContain('--price <amount>');
      expect(create.stdout).not.toContain('--collection <address>');
      expect(create.stderr).toBe('');

      const accept = await runCli(['offer', 'accept', '--help'], { home });
      expect(accept.code).toBe(0);
      expect(accept.stdout).toContain('Usage: rare offer accept [options]');
      expect(accept.stdout).toContain('--contract <address>');
      expect(accept.stdout).toContain('--token-id <id>');
      expect(accept.stdout).not.toContain('--collection <address>');
      expect(accept.stdout).not.toContain('--buyer <address>');
      expect(accept.stderr).toBe('');

      const status = await runCli(['offer', 'status', '--help'], { home });
      expect(status.code).toBe(0);
      expect(status.stdout).toContain('Usage: rare offer status [options]');
      expect(status.stdout).toContain('--contract <address>');
      expect(status.stdout).not.toContain('--collection <address>');
      expect(status.stdout).not.toContain('--account <address>');
      expect(status.stderr).toBe('');
    });
  });

  it('exposes token-specific listing flags on the listing commands', async () => {
    await withTempHome(async (home) => {
      const create = await runCli(['listing', 'create', '--help'], { home });
      expect(create.code).toBe(0);
      expect(create.stdout).toContain('Usage: rare listing create [options]');
      expect(create.stdout).toContain('--contract <address>');
      expect(create.stdout).toContain('--token-id <id>');
      expect(create.stdout).toContain('--price <amount>');
      expect(create.stdout).not.toContain('--collection <address>');
      expect(create.stderr).toBe('');

      const buy = await runCli(['listing', 'buy', '--help'], { home });
      expect(buy.code).toBe(0);
      expect(buy.stdout).toContain('Usage: rare listing buy [options]');
      expect(buy.stdout).toContain('--contract <address>');
      expect(buy.stdout).toContain('--token-id <id>');
      expect(buy.stdout).toContain('--yes');
      expect(buy.stdout).not.toContain('--collection <address>');
      expect(buy.stdout).not.toContain('--seller <address>');
      expect(buy.stderr).toBe('');

      const status = await runCli(['listing', 'status', '--help'], { home });
      expect(status.code).toBe(0);
      expect(status.stdout).toContain('Usage: rare listing status [options]');
      expect(status.stdout).toContain('--contract <address>');
      expect(status.stdout).not.toContain('--collection <address>');
      expect(status.stdout).not.toContain('--account <address>');
      expect(status.stderr).toBe('');
    });
  });

  it('builds and verifies utility token tree artifacts without wallet setup', async () => {
    await withTempHome(async (home) => {
      const input = join(home, 'batch-tokens.csv');
      const artifactPath = join(home, 'batch-token-artifact.json');
      const proofPath = join(home, 'batch-token-proof.json');
      await writeFile(input, [
        'contract_address,token_id,chain_id',
        '0x2222222222222222222222222222222222222222,2,11155111',
        '0x1111111111111111111111111111111111111111,10,11155111',
        '0x1111111111111111111111111111111111111111,1,11155111',
        '',
      ].join('\n'), 'utf8');

      const build = parseJsonStdout<{
        root: string;
        count: number;
        chainId: number;
        output: string;
      }>(await runCli([
        '--json',
        'utils',
        'tree',
        'build',
        '--input',
        input,
        '--output',
        artifactPath,
      ], { home }));

      expect(build).toEqual({
        root: '0xc7f290f1b2d1f0644c2b52ff9de94e33f0d877c8708cc9e2abbcbfb6af169f4e',
        count: 3,
        chainId: 11_155_111,
        output: artifactPath,
      });

      const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
      expect(artifact.tokens).toEqual([
        { contractAddress: '0x1111111111111111111111111111111111111111', tokenId: '1', chainId: 11_155_111 },
        { contractAddress: '0x1111111111111111111111111111111111111111', tokenId: '10', chainId: 11_155_111 },
        { contractAddress: '0x2222222222222222222222222222222222222222', tokenId: '2', chainId: 11_155_111 },
      ]);

      const proof = parseJsonStdout<{
        root: string;
        contractAddress: string;
        tokenId: string;
        proofLength: number;
        valid: boolean;
        output: string;
      }>(await runCli([
        '--json',
        'utils',
        'tree',
        'proof',
        '--input',
        artifactPath,
        '--contract',
        '0x2222222222222222222222222222222222222222',
        '--token-id',
        '2',
        '--output',
        proofPath,
      ], { home }));

      expect(proof.root).toBe(build.root);
      expect(proof.contractAddress).toBe('0x2222222222222222222222222222222222222222');
      expect(proof.tokenId).toBe('2');
      expect(proof.proofLength).toBe(1);
      expect(proof.valid).toBe(true);
      expect(proof.output).toBe(proofPath);

      const verify = parseJsonStdout<{
        root: string;
        contractAddress: string;
        tokenId: string;
        valid: boolean;
      }>(await runCli([
        '--json',
        'utils',
        'tree',
        'verify',
        '--input',
        artifactPath,
        '--contract',
        '0x2222222222222222222222222222222222222222',
        '--token-id',
        '2',
        '--proof',
        proofPath,
      ], { home }));

      expect(verify).toEqual({
        root: build.root,
        contractAddress: '0x2222222222222222222222222222222222222222',
        tokenId: '2',
        valid: true,
      });

      const wrongRoot = `0x${'00'.repeat(32)}`;
      const mismatchedVerify = parseJsonStdout<{
        root: string;
        contractAddress: string;
        tokenId: string;
        valid: boolean;
      }>(await runCli([
        '--json',
        'utils',
        'tree',
        'verify',
        '--input',
        artifactPath,
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--token-id',
        '1',
        '--root',
        wrongRoot,
      ], { home }));

      expect(mismatchedVerify).toEqual({
        root: wrongRoot,
        contractAddress: '0x1111111111111111111111111111111111111111',
        tokenId: '1',
        valid: false,
      });
    });
  });

  it('builds utility merkle proof artifacts from batch listing root artifacts', async () => {
    await withTempHome(async (home) => {
      const input = join(home, 'batch-listing-root.json');
      const proofPath = join(home, 'batch-listing-proof.json');
      await writeFile(input, JSON.stringify(batchListingRootArtifact), 'utf8');

      const proof = parseJsonStdout<{
        root: string;
        contract: string;
        tokenId: string;
        proof: string[];
      }>(await runCli([
        '--json',
        'utils',
        'merkle',
        'proof',
        '--input',
        input,
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--token-id',
        '1',
        '--output',
        proofPath,
      ], { home }));

      expect(proof).toEqual({
        root: '0xa01f005c90f56c0f2b981e045caf4949f489bf82e5d3c49effb1334cab26043a',
        contract: '0x1111111111111111111111111111111111111111',
        tokenId: '1',
        proof: ['0xfde38319eec56e703ba771c1e2abddca86188674940372bdfed26cec392ec314'],
      });

      const writtenProof = JSON.parse(await readFile(proofPath, 'utf8'));
      expect(writtenProof).toEqual(proof);
    });
  });

  it('includes allowlist proof fields for utility merkle proofs when buyer is provided', async () => {
    await withTempHome(async (home) => {
      const input = join(home, 'allowlisted-batch-listing-root.json');
      await writeFile(input, JSON.stringify(allowlistedBatchListingRootArtifact), 'utf8');

      const proof = parseJsonStdout<{
        root: string;
        contract: string;
        tokenId: string;
        proof: string[];
        allowListProof: string[];
        allowListAddress: string;
      }>(await runCli([
        '--json',
        'utils',
        'merkle',
        'proof',
        '--input',
        input,
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--token-id',
        '1',
        '--buyer',
        '0x1000000000000000000000000000000000000000',
      ], { home }));

      expect(proof).toEqual({
        root: '0xa01f005c90f56c0f2b981e045caf4949f489bf82e5d3c49effb1334cab26043a',
        contract: '0x1111111111111111111111111111111111111111',
        tokenId: '1',
        proof: ['0xfde38319eec56e703ba771c1e2abddca86188674940372bdfed26cec392ec314'],
        allowListProof: ['0x8dfad888a2f79bcfe6633c369a5652e94379f63f5849d8e8fe519c586bb49633'],
        allowListAddress: '0x1000000000000000000000000000000000000000',
      });
    });
  });

  it('rejects utility merkle proofs for allowlisted roots without a matching buyer', async () => {
    await withTempHome(async (home) => {
      const input = join(home, 'allowlisted-batch-listing-root.json');
      await writeFile(input, JSON.stringify(allowlistedBatchListingRootArtifact), 'utf8');

      const missingBuyer = await runCli([
        'utils',
        'merkle',
        'proof',
        '--input',
        input,
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--token-id',
        '1',
      ], { home });

      expect(missingBuyer.code).toBe(1);
      expect(missingBuyer.stdout).toBe('');
      expect(missingBuyer.stderr).toContain(
        'This root has an allowlist; pass buyer address to buildMerkleProofArtifact to include allowListProof',
      );

      const nonMemberBuyer = await runCli([
        'utils',
        'merkle',
        'proof',
        '--input',
        input,
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--token-id',
        '1',
        '--buyer',
        '0x3000000000000000000000000000000000000000',
      ], { home });

      expect(nonMemberBuyer.code).toBe(1);
      expect(nonMemberBuyer.stdout).toBe('');
      expect(nonMemberBuyer.stderr).toContain('Buyer 0x3000000000000000000000000000000000000000 is not in the allowlist');
    });
  });

  it('rejects malformed utility token trees before wallet setup', async () => {
    await withTempHome(async (home) => {
      const input = join(home, 'bad-batch-tokens.csv');
      await writeFile(input, 'contract,tokenId\nnot-an-address,1\n', 'utf8');

      const result = await runCli([
        'utils',
        'tree',
        'build',
        '--input',
        input,
      ], { home });

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('batch token at index 0 contractAddress must be a valid 0x address.');
    });
  });

  it('rejects malformed batch offer inputs before wallet setup', async () => {
    await withTempHome(async (home) => {
      const missingRoot = await runCli([
        'offer',
        'batch',
        'create',
        '--price',
        '0.1',
        '--end-time',
        '1778500000',
      ], { home });

      expect(missingRoot.code).toBe(1);
      expect(missingRoot.stdout).toBe('');
      expect(missingRoot.stderr).toContain('Pass --input, or pass --root as an override.');

      const proof = join(home, 'bad-batch-proof.json');
      await writeFile(proof, JSON.stringify({
        root: '0xc7f290f1b2d1f0644c2b52ff9de94e33f0d877c8708cc9e2abbcbfb6af169f4e',
        proof: ['0x1234'],
      }), 'utf8');

      const badProof = await runCli([
        'offer',
        'batch',
        'accept',
        '--creator',
        '0x2222222222222222222222222222222222222222',
        '--proof',
        proof,
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--token-id',
        '1',
      ], { home });

      expect(badProof.code).toBe(1);
      expect(badProof.stdout).toBe('');
      expect(badProof.stderr).toContain('proof[0] must be a bytes32 hex string.');
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
      expect(help.stdout).not.toContain('staking');
      expect(help.stdout).toContain('mint');
      expect(help.stdout).toContain('status');

      const configureHelp = await runCli(['listing', 'release', 'configure', '--help'], { home });
      expect(configureHelp.code).toBe(0);
      expect(configureHelp.stdout).toContain('--chain-id <id>');

      const statusHelp = await runCli(['listing', 'release', 'status', '--help'], { home });
      expect(statusHelp.code).toBe(0);
      expect(statusHelp.stdout).toContain('--account <address>');
      expect(statusHelp.stdout).toContain('--chain-id <id>');
      expect(statusHelp.stdout).not.toContain('--wallet');

      const mintHelp = await runCli(['listing', 'release', 'mint', '--help'], { home });
      expect(mintHelp.code).toBe(0);
      expect(mintHelp.stdout).toContain('--quantity <number>');
      expect(mintHelp.stdout).not.toContain('--amount <number>');
      expect(mintHelp.stdout).toContain('--proof <file>');
      expect(mintHelp.stdout).toContain('--chain-id <id>');

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

  it('rejects malformed release mint proof files before wallet setup', async () => {
    await withTempHome(async (home) => {
      const proof = join(home, 'bad-proof.json');
      await writeFile(proof, JSON.stringify({ proof: ['0x1234'] }), 'utf8');

      const result = await runCli([
        'listing',
        'release',
        'mint',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--proof',
        proof,
      ], { home });

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('proof[0] must be a 32-byte hex string.');
    });
  });

  it('reports release file read failures with cause details in JSON mode', async () => {
    await withTempHome(async (home) => {
      const missing = join(home, 'missing-allowlist.csv');

      const result = await runCli([
        '--json',
        'listing',
        'release',
        'allowlist',
        'build',
        '--input',
        missing,
      ], { home });

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      const error: unknown = JSON.parse(result.stderr);
      expect(isErrorJson(error)).toBe(true);
      if (!isErrorJson(error)) {
        throw new Error('Expected JSON error output.');
      }
      expect(error.message).toContain(`Unable to read allowlist input "${missing}"`);
      expect(error.causes?.some((cause) => cause.includes('ENOENT'))).toBe(true);
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

  it('does not expose removed collection deployment aliases', async () => {
    await withTempHome(async (home) => {
      const create = await runCli(['collection', 'create'], { home });
      expect(create.code).toBe(1);
      expect(create.stderr).toContain("error: unknown command 'create'");

      const sovereign = await runCli(['collection', 'deploy', 'sovereign'], { home });
      expect(sovereign.code).toBe(1);
      expect(sovereign.stderr).toContain("error: unknown command 'sovereign'");

      const lazySovereign = await runCli(['collection', 'deploy', 'lazy-sovereign'], { home });
      expect(lazySovereign.code).toBe(1);
      expect(lazySovereign.stderr).toContain("error: unknown command 'lazy-sovereign'");
    });
  });

  it('exposes collection batch mint command help', async () => {
    await withTempHome(async (home) => {
      const result = await runCli(['collection', 'mint-batch', '--help'], { home });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage: rare collection mint-batch [options]');
      expect(result.stdout).toContain('--contract <address>');
      expect(result.stdout).toContain('--base-uri <uri>');
      expect(result.stdout).toContain('--amount <number>');
      expect(result.stdout).not.toContain('--token-count <number>');
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
      expect(result.stdout).toContain('--amount <number>');
      expect(result.stdout).not.toContain('--token-count <number>');
      expect(result.stdout).toContain('--minter <address>');
      expect(result.stderr).toBe('');
    });
  });

  it('rejects generated mint metadata options before wallet setup', async () => {
    await withTempHome(async (home) => {
      const result = await runCli([
        'collection',
        'mint',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--name',
        'Rare Test',
        '--description',
        'A test NFT',
        '--chain',
        'sepolia',
      ], { home });

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Error: --image is required when not using --token-uri');
    });
  });

  it('uploads and pins generated collection mint metadata before contract write', async (ctx) => {
    await withTempHome(async (home) => {
      await withRareApiFixture(async ({ baseUrl, requests }) => {
        const imagePath = join(home, 'mint-image.png');
        await writeFile(imagePath, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
        const configure = await runCli([
          'configure',
          '--chain',
          'sepolia',
          '--private-key',
          '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          '--rpc-url',
          'http://127.0.0.1:9',
        ], { home });
        expect(configure.code).toBe(0);

        const result = skipIfRareApiUnavailable(ctx, await runCli([
          '--json',
          'collection',
          'mint',
          '--contract',
          '0x1111111111111111111111111111111111111111',
          '--name',
          'Rare Generated Metadata E2E',
          '--description',
          'Exercises the metadata upload shell before the RPC write.',
          '--image',
          imagePath,
          '--tag',
          'e2e',
          '--attribute',
          'Flow=Generated',
          '--chain',
          'sepolia',
        ], {
          home,
          env: { RARE_API_BASE_URL: baseUrl },
          timeoutMs: 30_000,
        }));

        expect(result.code).toBe(1);
        expect(result.stdout).toBe('');
        expect(requests.map((request) => request.pathname)).toEqual([
          '/v1/nfts/metadata/media/uploads',
          '/upload-part/1',
          '/v1/nfts/metadata/media/uploads/complete',
          '/v1/nfts/metadata/media/generate',
          '/v1/nfts/metadata',
        ]);
      });
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
        '--amount',
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
      expect(royalty.stdout).toContain('--price <raw>');
      expect(royalty.stderr).toBe('');

      const royaltySetDefault = await runCli(['collection', 'royalty', 'set-default-receiver', '--help'], { home });
      expect(royaltySetDefault.code).toBe(0);
      expect(royaltySetDefault.stdout).toContain('Usage: rare collection royalty set-default-receiver [options]');
      expect(royaltySetDefault.stdout).toContain('--receiver <address>');
      expect(royaltySetDefault.stderr).toBe('');

      const royaltySetPercentage = await runCli(['collection', 'royalty', 'set-default-percentage', '--help'], { home });
      expect(royaltySetPercentage.code).toBe(0);
      expect(royaltySetPercentage.stdout).toContain('Usage: rare collection royalty set-default-percentage [options]');
      expect(royaltySetPercentage.stdout).toContain('--percentage <number>');
      expect(royaltySetPercentage.stderr).toBe('');

      const royaltySetToken = await runCli(['collection', 'royalty', 'set-token-receiver', '--help'], { home });
      expect(royaltySetToken.code).toBe(0);
      expect(royaltySetToken.stdout).toContain('Usage: rare collection royalty set-token-receiver [options]');
      expect(royaltySetToken.stdout).toContain('--token-id <id>');
      expect(royaltySetToken.stderr).toBe('');

      const metadataStatus = await runCli(['collection', 'metadata', 'status', '--help'], { home });
      expect(metadataStatus.code).toBe(0);
      expect(metadataStatus.stdout).toContain('Usage: rare collection metadata status [options]');
      expect(metadataStatus.stdout).toContain('--contract <address>');
      expect(metadataStatus.stderr).toBe('');

      const metadata = await runCli(['collection', 'metadata', 'update-base-uri', '--help'], { home });
      expect(metadata.code).toBe(0);
      expect(metadata.stdout).toContain('Usage: rare collection metadata update-base-uri [options]');
      expect(metadata.stdout).toContain('--base-uri <uri>');
      expect(metadata.stderr).toBe('');

      const metadataToken = await runCli(['collection', 'metadata', 'update-token-uri', '--help'], { home });
      expect(metadataToken.code).toBe(0);
      expect(metadataToken.stdout).toContain('Usage: rare collection metadata update-token-uri [options]');
      expect(metadataToken.stdout).toContain('--token-uri <uri>');
      expect(metadataToken.stderr).toBe('');

      const metadataLock = await runCli(['collection', 'metadata', 'lock-base-uri', '--help'], { home });
      expect(metadataLock.code).toBe(0);
      expect(metadataLock.stdout).toContain('Usage: rare collection metadata lock-base-uri [options]');
      expect(metadataLock.stdout).toContain('--contract <address>');
      expect(metadataLock.stderr).toBe('');
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

      const percentageResult = await runCli([
        'collection',
        'royalty',
        'set-default-percentage',
        '--contract',
        'not-an-address',
        '--percentage',
        '15',
      ], { home });

      expect(percentageResult.code).toBe(1);
      expect(percentageResult.stdout).toBe('');
      expect(percentageResult.stderr).toContain('Error: --contract must be a valid 0x address.');

      const registryResult = await runCli(['collection', 'royalty', 'registry'], { home });
      expect(registryResult.code).toBe(1);
      expect(registryResult.stdout).toBe('');
      expect(registryResult.stderr).toContain("unknown command 'registry'");
    });
  });

  it('rejects Lazy ERC-721 collection deployment on chains without a configured factory before wallet setup', async () => {
    await withTempHome(async (home) => {
      const result = await runCli([
        'collection',
        'deploy',
        'lazy-erc721',
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

type RareApiFixtureRequest = {
  method: string;
  pathname: string;
  query: Record<string, string>;
  body?: unknown;
};

type AuctionSearchNft = {
  universalTokenId: string;
  contractAddress: string;
  tokenId: string;
  market: {
    auctions: AuctionSearchAuction[];
  };
};

type AuctionSearchAuction = {
  sellerAddress: string;
  highestBidder: {
    address: string;
  };
};

type AuctionListCandidate = {
  nft: AuctionSearchNft;
  auction: AuctionSearchAuction;
  bidder: string;
};

function findAuctionListCandidate(nfts: AuctionSearchNft[]): AuctionListCandidate | undefined {
  for (const nft of nfts) {
    for (const auction of nft.market.auctions) {
      const bidder = auction.highestBidder.address;
      if (isAddress(auction.sellerAddress) && isAddress(bidder) && bidder !== zeroAddress) {
        return { nft, auction, bidder };
      }
    }
  }
  return undefined;
}

function expectAuctionSearchResult(
  nfts: AuctionSearchNft[],
  candidate: AuctionListCandidate,
  side: 'maker' | 'taker',
): void {
  const matched = nfts.some((nft) =>
    nft.universalTokenId === candidate.nft.universalTokenId &&
    nft.contractAddress.toLowerCase() === candidate.nft.contractAddress.toLowerCase() &&
    nft.tokenId === candidate.nft.tokenId &&
    nft.market.auctions.some((auction) =>
      side === 'maker'
        ? auction.sellerAddress.toLowerCase() === candidate.auction.sellerAddress.toLowerCase()
        : auction.highestBidder.address.toLowerCase() === candidate.bidder.toLowerCase(),
    ),
  );
  expect(matched).toBe(true);
}

async function withRareApiFixture<T>(
  fn: (fixture: { baseUrl: string; requests: RareApiFixtureRequest[] }) => Promise<T>,
): Promise<T> {
  const requests: RareApiFixtureRequest[] = [];
  const server = createServer((req, res) => {
    void handleRareApiFixtureRequest(req, res, requests, () => server.address())
      .catch((error: unknown) => {
        writeJsonResponse(res, 500, { error: error instanceof Error ? error.message : String(error) });
      });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    await closeServer(server);
    throw new Error('Rare API fixture server did not bind to a TCP port.');
  }

  try {
    return await fn({
      baseUrl: `http://127.0.0.1:${address.port}`,
      requests,
    });
  } finally {
    await closeServer(server);
  }
}

async function handleRareApiFixtureRequest(
  req: IncomingMessage,
  res: ServerResponse,
  requests: RareApiFixtureRequest[],
  serverAddress: () => ReturnType<ReturnType<typeof createServer>['address']>,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://rare-api.test');
  const body = url.pathname === '/v1/collections/import' ? JSON.parse(await text(req)) as unknown : undefined;
  // eslint-disable-next-line functional/immutable-data -- Test fixture records requests made by CLI subprocesses.
  requests.push({
    method: req.method ?? 'GET',
    pathname: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    ...(body === undefined ? {} : { body }),
  });

  if (url.pathname === '/v1/collections/import') {
    writeJsonResponse(res, 200, { imported: true });
    return;
  }

  if (url.pathname === '/v1/nfts') {
    writeJsonResponse(res, 200, buildNftListFixture(url));
    return;
  }

  if (url.pathname === '/v1/collections') {
    writeJsonResponse(res, 200, buildCollectionListFixture(url));
    return;
  }

  if (url.pathname === '/v1/nfts/metadata/media/uploads') {
    const address = serverAddress();
    if (address === null || typeof address === 'string') {
      writeJsonResponse(res, 500, { error: 'fixture server is unavailable' });
      return;
    }
    writeJsonResponse(res, 201, {
      uploadId: 'upload-1',
      key: 'media/mint-image.png',
      bucket: 'rare-cli-e2e',
      partSize: 10,
      presignedUrls: [`http://127.0.0.1:${address.port}/upload-part/1`],
      gatewayBaseUrl: 'https://fixture.example',
    });
    return;
  }

  if (url.pathname === '/upload-part/1') {
    res.writeHead(200, { etag: 'fixture-etag' });
    res.end();
    return;
  }

  if (url.pathname === '/v1/nfts/metadata/media/uploads/complete') {
    writeJsonResponse(res, 200, {
      cid: 'bafymedia',
      ipfsUrl: 'ipfs://bafymedia',
      gatewayUrl: 'https://fixture.example/ipfs/bafymedia',
    });
    return;
  }

  if (url.pathname === '/v1/nfts/metadata/media/generate') {
    writeJsonResponse(res, 200, {
      media: {
        uri: 'ipfs://bafymedia',
        mimeType: 'image/png',
        size: 4,
        dimensions: '1x1',
      },
    });
    return;
  }

  if (url.pathname === '/v1/nfts/metadata') {
    writeJsonResponse(res, 201, {
      cid: 'bafymetadata',
      ipfsUrl: 'ipfs://bafymetadata',
      gatewayUrl: 'https://fixture.example/ipfs/bafymetadata',
      metadata: {
        name: 'Rare Generated Metadata E2E',
        description: 'Exercises the metadata upload shell before the RPC write.',
        image: 'ipfs://bafymedia',
        media: {
          uri: 'ipfs://bafymedia',
          mimeType: 'image/png',
          size: 4,
          dimensions: '1x1',
        },
        tags: ['e2e'],
        attributes: [{ trait_type: 'Flow', value: 'Generated' }],
      },
    });
    return;
  }

  writeJsonResponse(res, 404, { error: `Unhandled fixture path: ${url.pathname}` });
}

function buildNftListFixture(url: URL): unknown {
  if (url.searchParams.get('hasAuction') === 'true') {
    return buildAuctionListFixture(url);
  }

  if (url.searchParams.get('hasListing') === 'true') {
    return buildNftSearchFixture(
      url,
      url.searchParams.get('listingType') === 'BATCH_SALE_PRICE'
        ? 'mainnet-batch-listing'
        : 'mainnet-token-listing',
    );
  }

  if (url.searchParams.get('hasOffer') === 'true') {
    const side = url.searchParams.has('offerBuyerAddress') ? 'maker' : 'taker';
    return buildNftSearchFixture(url, `mainnet-offer-${side}`);
  }

  return buildNftSearchFixture(url, 'mainnet-nft');
}

function buildAuctionListFixture(url: URL): unknown {
  const side = url.searchParams.has('auctionCreatorAddress') ? 'maker' : 'taker';
  return buildNftSearchFixture(url, `mainnet-auction-${side}`);
}

function buildNftSearchFixture(url: URL, universalTokenId: string): unknown {
  return {
    data: [
      {
        universalTokenId,
      },
    ],
    pagination: {
      page: Number(url.searchParams.get('page') ?? 1),
      perPage: Number(url.searchParams.get('perPage') ?? 24),
      totalCount: 1,
      totalPages: 1,
    },
  };
}

function buildCollectionListFixture(url: URL): unknown {
  return {
    data: [
      {
        collectionId: 'mainnet-owned-collection',
      },
    ],
    pagination: {
      page: Number(url.searchParams.get('page') ?? 1),
      perPage: Number(url.searchParams.get('perPage') ?? 24),
      totalCount: 1,
      totalPages: 1,
    },
  };
}

function writeJsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function skipIfRareApiUnavailable<T extends { code: number | null; stderr: string }>(
  ctx: TestContext,
  result: T,
): T {
  if (result.code !== 0 && result.stderr.includes('"Status: 500"') && result.stderr.includes('"Path: /v1/nfts"')) {
    ctx.skip('Rare API /v1/nfts returned 500.');
  }
  return result;
}

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

function isErrorJson(value: unknown): value is { message: string; causes?: string[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string' &&
    (!('causes' in value) || (Array.isArray(value.causes) && value.causes.every((cause) => typeof cause === 'string')))
  );
}

async function expectLocalValidationBeforeWalletSetup(
  argsForHome: (home: string) => string[] | Promise<string[]>,
  expectedError: string,
): Promise<void> {
  await withTempHome(async (home) => {
    const result = await runCli(await argsForHome(home), { home });

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(expectedError);
    await expect(access(join(home, '.rare', 'config.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
}

async function createFakeOp(home: string): Promise<{ binDir: string; logPath: string }> {
  const binDir = join(home, 'bin');
  const logPath = join(home, 'op.log');
  const opPath = join(binDir, 'op');
  await mkdir(binDir, { recursive: true });
  await writeFile(logPath, '', 'utf8');
  await writeFile(opPath, [
    '#!/usr/bin/env node',
    "const { appendFileSync } = require('node:fs');",
    "const args = process.argv.slice(2);",
    "appendFileSync(process.env.FAKE_OP_LOG, `${args.join(' ')}\\n`);",
    "if (process.env.FAKE_OP_FAIL === '1') {",
    "  console.error('fake op failure');",
    '  process.exit(42);',
    '}',
    "if (args[0] !== 'read') {",
    "  console.error(`unexpected fake op command: ${args.join(' ')}`);",
    '  process.exit(2);',
    '}',
    "if (process.env.FAKE_OP_PRIVATE_KEY === undefined) {",
    "  console.error('missing fake private key');",
    '  process.exit(3);',
    '}',
    'console.log(process.env.FAKE_OP_PRIVATE_KEY);',
    '',
  ].join('\n'), 'utf8');
  await chmod(opPath, 0o755);
  return { binDir, logPath };
}

function fakeOpEnv(binDir: string, privateKey: string): NodeJS.ProcessEnv {
  return {
    PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
    FAKE_OP_LOG: join(binDir, '..', 'op.log'),
    FAKE_OP_PRIVATE_KEY: privateKey,
  };
}
