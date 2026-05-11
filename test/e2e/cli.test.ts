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

  it('exposes RareSpace collection commands', async () => {
    await withTempHome(async (home) => {
      const create = await runCli(['collection', 'create', 'space', '--help'], { home });
      expect(create.code).toBe(0);
      expect(create.stdout).toContain('Usage: rare collection create space [options] <name> <symbol>');
      expect(create.stderr).toBe('');

      const mint = await runCli(['collection', 'mint-space', '--help'], { home });
      expect(mint.code).toBe(0);
      expect(mint.stdout).toContain('Usage: rare collection mint-space [options]');
      expect(mint.stdout).toContain('--token-uri <uri>');
      expect(mint.stdout).toContain('--royalty-receiver <address>');
      expect(mint.stderr).toBe('');
    });
  });

  it('exposes auction parity command help', async () => {
    await withTempHome(async (home) => {
      const create = await runCli(['auction', 'create', '--help'], { home });
      expect(create.code).toBe(0);
      expect(create.stdout).toContain('Usage: rare auction create [options]');
      expect(create.stdout).toContain('--type <type>');
      expect(create.stdout).toContain('--start-time <seconds>');
      expect(create.stdout).toContain('--split-recipient <address>');
      expect(create.stdout).toContain('--split-ratio <percent>');
      expect(create.stderr).toBe('');
    });
  });

  it('exposes release allowlist and configuration command help', async () => {
    await withTempHome(async (home) => {
      const allowlist = await runCli(['release', 'allowlist', 'build', '--help'], { home });
      expect(allowlist.code).toBe(0);
      expect(allowlist.stdout).toContain('Usage: rare release allowlist build [options]');
      expect(allowlist.stdout).toContain('--input <path>');
      expect(allowlist.stderr).toBe('');

      const set = await runCli(['release', 'allowlist', 'set', '--help'], { home });
      expect(set.code).toBe(0);
      expect(set.stdout).toContain('Usage: rare release allowlist set [options]');
      expect(set.stdout).toContain('--end-timestamp <seconds>');
      expect(set.stderr).toBe('');

      const proof = await runCli(['release', 'allowlist', 'proof', '--help'], { home });
      expect(proof.code).toBe(0);
      expect(proof.stdout).toContain('--account <address>');
      expect(proof.stdout).not.toContain('--address <address>');
      expect(proof.stderr).toBe('');

      const verify = await runCli(['release', 'allowlist', 'verify', '--help'], { home });
      expect(verify.code).toBe(0);
      expect(verify.stdout).toContain('--account <address>');
      expect(verify.stdout).not.toContain('--address <address>');
      expect(verify.stderr).toBe('');

      const limits = await runCli(['release', 'limits', 'set-mint', '--help'], { home });
      expect(limits.code).toBe(0);
      expect(limits.stdout).toContain('Usage: rare release limits set-mint [options]');
      expect(limits.stdout).toContain('--limit <number>');
      expect(limits.stderr).toBe('');

      const mint = await runCli(['release', 'mint', '--help'], { home });
      expect(mint.code).toBe(0);
      expect(mint.stdout).toContain('Usage: rare release mint [options]');
      expect(mint.stdout).toContain('--quantity <number>');
      expect(mint.stdout).toContain('--proof <path>');
      expect(mint.stderr).toBe('');
    });
  });

  it('exposes batch marketplace tree command help', async () => {
    await withTempHome(async (home) => {
      const build = await runCli(['batch', 'tree', 'build', '--help'], { home });
      expect(build.code).toBe(0);
      expect(build.stdout).toContain('Usage: rare batch tree build [options]');
      expect(build.stdout).toContain('--input <path>');
      expect(build.stdout).toContain('--chain-id <id>');
      expect(build.stderr).toBe('');

      const proof = await runCli(['batch', 'tree', 'proof', '--help'], { home });
      expect(proof.code).toBe(0);
      expect(proof.stdout).toContain('Usage: rare batch tree proof [options]');
      expect(proof.stdout).toContain('--contract <address>');
      expect(proof.stdout).toContain('--token-id <id>');
      expect(proof.stderr).toBe('');

      const offerCreate = await runCli(['batch', 'offer', 'create', '--help'], { home });
      expect(offerCreate.code).toBe(0);
      expect(offerCreate.stdout).toContain('Usage: rare batch offer create [options]');
      expect(offerCreate.stdout).toContain('--amount <amount>');
      expect(offerCreate.stdout).toContain('--expiry <seconds>');
      expect(offerCreate.stderr).toBe('');

      const offerAccept = await runCli(['batch', 'offer', 'accept', '--help'], { home });
      expect(offerAccept.code).toBe(0);
      expect(offerAccept.stdout).toContain('Usage: rare batch offer accept [options]');
      expect(offerAccept.stdout).toContain('--proof <path>');
      expect(offerAccept.stdout).toContain('--creator <address>');
      expect(offerAccept.stderr).toBe('');

      const auctionCreate = await runCli(['batch', 'auction', 'create', '--help'], { home });
      expect(auctionCreate.code).toBe(0);
      expect(auctionCreate.stdout).toContain('Usage: rare batch auction create [options]');
      expect(auctionCreate.stdout).toContain('--reserve <amount>');
      expect(auctionCreate.stdout).toContain('--duration <seconds>');
      expect(auctionCreate.stderr).toBe('');

      const auctionBid = await runCli(['batch', 'auction', 'bid', '--help'], { home });
      expect(auctionBid.code).toBe(0);
      expect(auctionBid.stdout).toContain('Usage: rare batch auction bid [options]');
      expect(auctionBid.stdout).toContain('--proof <path>');
      expect(auctionBid.stdout).toContain('--creator <address>');
      expect(auctionBid.stderr).toBe('');
    });
  });

  it('exposes collection-wide offer flags on the offer commands', async () => {
    await withTempHome(async (home) => {
      const create = await runCli(['offer', 'create', '--help'], { home });
      expect(create.code).toBe(0);
      expect(create.stdout).toContain('Usage: rare offer create [options]');
      expect(create.stdout).toContain('--contract <address>');
      expect(create.stdout).toContain('--token-id <id>');
      expect(create.stdout).toContain('--collection <address>');
      expect(create.stdout).toContain('--amount <amount>');
      expect(create.stderr).toBe('');

      const accept = await runCli(['offer', 'accept', '--help'], { home });
      expect(accept.code).toBe(0);
      expect(accept.stdout).toContain('Usage: rare offer accept [options]');
      expect(accept.stdout).toContain('--collection <address>');
      expect(accept.stdout).toContain('--buyer <address>');
      expect(accept.stdout).toContain('--token-id <id>');
      expect(accept.stderr).toBe('');

      const status = await runCli(['offer', 'status', '--help'], { home });
      expect(status.code).toBe(0);
      expect(status.stdout).toContain('Usage: rare offer status [options]');
      expect(status.stdout).toContain('--collection <address>');
      expect(status.stdout).toContain('--account <address>');
      expect(status.stderr).toBe('');
    });
  });

  it('exposes collection-wide listing flags on the listing commands', async () => {
    await withTempHome(async (home) => {
      const create = await runCli(['listing', 'create', '--help'], { home });
      expect(create.code).toBe(0);
      expect(create.stdout).toContain('Usage: rare listing create [options]');
      expect(create.stdout).toContain('--contract <address>');
      expect(create.stdout).toContain('--token-id <id>');
      expect(create.stdout).toContain('--collection <address>');
      expect(create.stdout).toContain('--amount <amount>');
      expect(create.stderr).toBe('');

      const buy = await runCli(['listing', 'buy', '--help'], { home });
      expect(buy.code).toBe(0);
      expect(buy.stdout).toContain('Usage: rare listing buy [options]');
      expect(buy.stdout).toContain('--collection <address>');
      expect(buy.stdout).toContain('--seller <address>');
      expect(buy.stdout).toContain('--token-id <id>');
      expect(buy.stderr).toBe('');

      const status = await runCli(['listing', 'status', '--help'], { home });
      expect(status.code).toBe(0);
      expect(status.stdout).toContain('Usage: rare listing status [options]');
      expect(status.stdout).toContain('--collection <address>');
      expect(status.stdout).toContain('--account <address>');
      expect(status.stderr).toBe('');
    });
  });

  it('builds and verifies release allowlist artifacts without wallet setup', async () => {
    await withTempHome(async (home) => {
      const input = join(home, 'allowlist.csv');
      const artifactPath = join(home, 'allowlist-artifact.json');
      await writeFile(input, [
        'address',
        '0x2222222222222222222222222222222222222222',
        '0x1111111111111111111111111111111111111111',
        '',
      ].join('\n'), 'utf8');

      const build = parseJsonStdout<{
        root: string;
        count: number;
        output: string;
      }>(await runCli([
        '--json',
        'release',
        'allowlist',
        'build',
        '--input',
        input,
        '--output',
        artifactPath,
      ], { home }));

      expect(build.root).toMatch(/^0x[0-9a-f]{64}$/);
      expect(build.count).toBe(2);
      expect(build.output).toBe(artifactPath);

      const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
      expect(artifact.root).toBe(build.root);
      expect(artifact.addresses).toEqual([
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
      ]);

      const proof = parseJsonStdout<{
        root: string;
        address: string;
        valid: boolean;
        proof: string[];
      }>(await runCli([
        '--json',
        'release',
        'allowlist',
        'proof',
        '--input',
        artifactPath,
        '--account',
        '0x2222222222222222222222222222222222222222',
      ], { home }));

      expect(proof.root).toBe(build.root);
      expect(proof.valid).toBe(true);
      expect(proof.proof).toHaveLength(1);

      const verify = parseJsonStdout<{
        root: string;
        address: string;
        valid: boolean;
      }>(await runCli([
        '--json',
        'release',
        'allowlist',
        'verify',
        '--input',
        artifactPath,
        '--account',
        '0x2222222222222222222222222222222222222222',
      ], { home }));

      expect(verify).toEqual({
        root: build.root,
        address: '0x2222222222222222222222222222222222222222',
        valid: true,
      });
    });
  });

  it('builds and verifies batch marketplace token tree artifacts without wallet setup', async () => {
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
        'batch',
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
        'batch',
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
        'batch',
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
    });
  });

  it('rejects malformed batch token trees before wallet setup', async () => {
    await withTempHome(async (home) => {
      const input = join(home, 'bad-batch-tokens.csv');
      await writeFile(input, 'contract,tokenId\nnot-an-address,1\n', 'utf8');

      const result = await runCli([
        'batch',
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
        'batch',
        'offer',
        'create',
        '--amount',
        '0.1',
        '--expiry',
        '1778500000',
      ], { home });

      expect(missingRoot.code).toBe(1);
      expect(missingRoot.stdout).toBe('');
      expect(missingRoot.stderr).toContain('Pass --root or --input.');

      const proof = join(home, 'bad-batch-proof.json');
      await writeFile(proof, JSON.stringify({
        root: '0xc7f290f1b2d1f0644c2b52ff9de94e33f0d877c8708cc9e2abbcbfb6af169f4e',
        proof: ['0x1234'],
      }), 'utf8');

      const badProof = await runCli([
        'batch',
        'offer',
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

  it('rejects malformed release allowlists before wallet setup', async () => {
    await withTempHome(async (home) => {
      const input = join(home, 'bad-allowlist.csv');
      await writeFile(input, 'address\nnot-an-address\n', 'utf8');

      const result = await runCli([
        'release',
        'allowlist',
        'build',
        '--input',
        input,
      ], { home });

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('allowlist address at index 0 must be a valid 0x address.');
    });
  });

  it('rejects malformed release mint options before wallet setup', async () => {
    await withTempHome(async (home) => {
      const proof = join(home, 'bad-proof.json');
      await writeFile(proof, JSON.stringify({ proof: ['0x1234'] }), 'utf8');

      const result = await runCli([
        'release',
        'mint',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--proof',
        proof,
        '--chain',
        'sepolia',
      ], { home });

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('proof[0] must be a bytes32 hex string.');
    });
  });

  it('rejects generated mint metadata options before wallet setup', async () => {
    await withTempHome(async (home) => {
      const result = await runCli([
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

  it('rejects RareSpace collection creation on chains without a configured factory before wallet setup', async () => {
    await withTempHome(async (home) => {
      const result = await runCli([
        'collection',
        'create',
        'space',
        'Test Space',
        'TSP',
        '--chain',
        'sepolia',
      ], { home });

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('RARE Protocol spaceFactory contract is not configured on "sepolia".');
    });
  });

  it('rejects RareMinter release reads on chains without a configured minter before wallet setup', async () => {
    await withTempHome(async (home) => {
      const result = await runCli([
        'release',
        'status',
        '--contract',
        '0x1111111111111111111111111111111111111111',
        '--chain',
        'base',
      ], { home });

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('RARE Protocol rareMinter contract is not configured on "base".');
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
