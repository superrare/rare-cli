import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAddress, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
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
            keySource: 'plaintext',
            privateKey: '0xabc1...c123',
            rpcUrl: 'http://127.0.0.1:8545',
          },
        },
      });
    });
  });

  it('configures a 1Password private key reference without storing plaintext', async () => {
    await withTempHome(async (home) => {
      const privateKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const expectedAddress = privateKeyToAccount(privateKey).address;
      const fakeOp = await createFakeOp(home);
      const env = fakeOpEnv(fakeOp.binDir, privateKey);

      const configure = await runCli([
        'configure',
        '--chain',
        'sepolia',
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
            walletAddress: expectedAddress,
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
            walletAddress: expectedAddress,
            rpcUrl: 'http://127.0.0.1:8545',
          },
        },
      });
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
      expect(collection.stdout).toContain('mint');
      expect(collection.stderr).toBe('');

      const create = await runCli(['collection', 'create', '--help'], { home });
      const mint = await runCli(['collection', 'mint', '--help'], { home });
      expect(mint.code).toBe(0);
      expect(mint.stdout).toContain('Usage: rare collection mint [options]');
      expect(mint.stdout).toContain('--contract <address>');
      expect(mint.stdout).toContain('--token-uri <uri>');
      expect(mint.stdout).toContain('--royalty-receiver <address>');
      expect(mint.stderr).toBe('');

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

  it('covers read/API CLI command wiring and validation', async () => {
    await withTempHome(async (home) => {
      const tokenSearch = parseJsonStdout<{ pagination: { page: number; perPage: number }; data: unknown[] }>(
        await runCli(['--json', 'search', 'tokens', '--chain', 'mainnet', '--per-page', '1'], { home, timeoutMs: 30_000 }),
      );
      expect(tokenSearch.pagination).toMatchObject({ page: 1, perPage: 1 });
      expect(Array.isArray(tokenSearch.data)).toBe(true);

      const collectionSearch = parseJsonStdout<{ pagination: { page: number; perPage: number }; data: unknown[] }>(
        await runCli(['--json', 'search', 'collections', '--chain', 'mainnet', '--per-page', '1'], {
          home,
          timeoutMs: 30_000,
        }),
      );
      expect(collectionSearch.pagination).toMatchObject({ page: 1, perPage: 1 });
      expect(Array.isArray(collectionSearch.data)).toBe(true);

      const auctions = parseJsonStdout<{ pagination: { page: number; perPage: number }; data: unknown[] }>(
        await runCli([
          '--json',
          'search',
          'auctions',
          '--chain',
          'mainnet',
          '--state',
          'RUNNING',
          '--per-page',
          '1',
        ], { home, timeoutMs: 30_000 }),
      );
      expect(auctions.pagination).toMatchObject({ page: 1, perPage: 1 });
      expect(Array.isArray(auctions.data)).toBe(true);

      const collections = parseJsonStdout<unknown[]>(
        await runCli(['--json', 'list-collections', '--chain', 'mainnet', '--query', 'rare'], {
          home,
          timeoutMs: 30_000,
        }),
      );
      expect(Array.isArray(collections)).toBe(true);

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

      const registry = await runCli(['collection', 'royalty', 'registry', 'status', '--help'], { home });
      expect(registry.code).toBe(0);
      expect(registry.stdout).toContain('Usage: rare collection royalty registry status [options]');
      expect(registry.stdout).toContain('--registry <address>');
      expect(registry.stdout).toContain('--sale-price <raw>');
      expect(registry.stderr).toBe('');

      const registrySet = await runCli([
        'collection',
        'royalty',
        'registry',
        'set-contract-percentage',
        '--help',
      ], { home });
      expect(registrySet.code).toBe(0);
      expect(registrySet.stdout).toContain('Usage: rare collection royalty registry set-contract-percentage [options]');
      expect(registrySet.stdout).toContain('--percentage <number>');
      expect(registrySet.stderr).toBe('');

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

      const registryResult = await runCli([
        'collection',
        'royalty',
        'registry',
        'set-contract-receiver',
        '--contract',
        'not-an-address',
        '--receiver',
        '0x2222222222222222222222222222222222222222',
      ], { home });

      expect(registryResult.code).toBe(1);
      expect(registryResult.stdout).toBe('');
      expect(registryResult.stderr).toContain('Error: --contract must be a valid 0x address.');
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
