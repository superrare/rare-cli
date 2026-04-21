import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeAbiParameters } from 'viem';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const DIST_CLI = path.join(ROOT_DIR, 'dist', 'index.js');
const TEST_PRIVATE_KEY = `0x${'11'.repeat(32)}`;

test('backup token refuses to preserve without confirmation in non-interactive mode', async () => {
  const server = await startPreservationServer();
  const homeDir = createTempHome();

  try {
    writeRareConfig(homeDir, {
      defaultChain: 'sepolia',
      chains: {
        sepolia: {
          privateKey: TEST_PRIVATE_KEY,
          rpcUrl: `${server.baseUrl}/rpc`,
        },
      },
      preservation: {},
    });

    const result = await runCli(
      [
        'backup',
        'token',
        '--contract',
        '0x3333333333333333333333333333333333333333',
        '--token-id',
        '7',
        '--chain',
        'sepolia',
        '--service-url',
        server.baseUrl,
        '--gateway',
        server.baseUrl,
      ],
      { env: { HOME: homeDir } },
    );

    assert.equal(result.code, 1);
    assert.match(result.stdout, /Preservation quote:/);
    assert.match(result.stdout, /Assets:\s+4/);
    assert.match(result.stdout, /Amount:\s+0\.000000000000000123 RARE/);
    assert.match(
      result.stderr,
      /Preservation payment requires confirmation, but no interactive terminal is available/
    );
    assert.equal(server.counters.quoteRequests, 1);
    assert.equal(server.counters.uploadSessionRequests, 0);
    assert.equal(server.counters.finalizeRequests, 0);
  } finally {
    server.close();
    rmSync(homeDir, { recursive: true, force: true });
  }
});

test('backup token preserves successfully with --yes in non-interactive mode', async () => {
  const server = await startPreservationServer();
  const homeDir = createTempHome();

  try {
    writeRareConfig(homeDir, {
      defaultChain: 'sepolia',
      chains: {
        sepolia: {
          privateKey: TEST_PRIVATE_KEY,
          rpcUrl: `${server.baseUrl}/rpc`,
        },
      },
      preservation: {},
    });

    const result = await runCli(
      [
        'backup',
        'token',
        '--contract',
        '0x3333333333333333333333333333333333333333',
        '--token-id',
        '7',
        '--chain',
        'sepolia',
        '--service-url',
        server.baseUrl,
        '--gateway',
        server.baseUrl,
        '--yes',
      ],
      { env: { HOME: homeDir } },
    );

    assert.equal(result.code, 0);
    assert.match(result.stdout, /Preservation quote:/);
    assert.match(result.stdout, /Assets:\s+4/);
    assert.match(result.stdout, /Preservation complete:/);
    assert.doesNotMatch(result.stdout, /Record CID:/);
    assert.doesNotMatch(result.stdout, /Record URI:/);
    assert.doesNotMatch(result.stdout, /Record link:/);
    assert.match(result.stdout, new RegExp(`Your Receipt:\\s+${escapeRegex(`${server.baseUrl}/ipfs/bafytest`)}`));
    assert.match(result.stdout, /Assets pinned:\s+4/);
    assert.match(result.stdout, /Asset links:/);
    assert.match(result.stdout, new RegExp(`metadata \\(metadata\\.json\\): ${escapeRegex(`${server.baseUrl}/cid0`)}`));
    assert.match(result.stdout, new RegExp(`image \\(image\\.png\\): ${escapeRegex(`${server.baseUrl}/cid1`)}`));
    assert.match(result.stdout, new RegExp(`media\\.uri \\(animation\\.mp4\\): ${escapeRegex(`${server.baseUrl}/cid2`)}`));
    assert.match(result.stdout, new RegExp(`properties\\.files \\(alt\\.bin\\): ${escapeRegex(`${server.baseUrl}/cid3`)}`));
    assert.match(result.stdout, /Receipt ID:\s+receipt_test/);
    assert.equal(result.stderr, '');
    assert.equal(server.counters.quoteRequests, 1);
    assert.equal(server.counters.uploadSessionRequests, 1);
    assert.equal(server.counters.finalizeRequests, 1);
    assert.equal(server.counters.uploadRequests, 4);
  } finally {
    server.close();
    rmSync(homeDir, { recursive: true, force: true });
  }
});

function createTempHome() {
  return mkdtempSync(path.join(os.tmpdir(), 'rare-cli-home-'));
}

function writeRareConfig(homeDir, config) {
  const configDir = path.join(homeDir, '.rare');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(config, null, 2), 'utf8');
}

function runCli(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [DIST_CLI, ...args], {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        ...opts.env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code,
        stdout,
        stderr,
      });
    });

    child.stdin.end(opts.input ?? '');
  });
}

async function startPreservationServer() {
  let baseUrl = '';
  const uploaded = new Map();
  const counters = {
    quoteRequests: 0,
    uploadSessionRequests: 0,
    finalizeRequests: 0,
    uploadRequests: 0,
  };
  const metadataCid = 'bafytestmetadata';
  const imagePath = `${metadataCid}/image.png`;
  const mediaPath = `${metadataCid}/animation.mp4`;
  const altPath = `${metadataCid}/alt.bin`;
  const mediaBytes = Buffer.from('video-bytes');

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (url.pathname === '/rpc' && req.method === 'POST') {
      const body = await readJson(req);
      res.setHeader('content-type', 'application/json');

      if (body.method === 'eth_chainId') {
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: body.id ?? 1,
            result: '0xaa36a7',
          }),
        );
        return;
      }

      if (body.method === 'eth_call') {
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: body.id ?? 1,
            result: encodeAbiParameters(
              [{ type: 'string' }],
              [`ipfs://${metadataCid}/metadata.json`],
            ),
          }),
        );
        return;
      }

      res.statusCode = 400;
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: body.id ?? 1,
          error: {
            code: -32601,
            message: `Unsupported RPC method: ${body.method}`,
          },
        }),
      );
      return;
    }

    if (url.pathname === `/ipfs/${metadataCid}/metadata.json`) {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          image: 'image.png',
          media: {
            uri: 'animation.mp4',
            mimeType: 'video/mp4',
          },
          properties: {
            files: [{ url: 'alt.bin' }],
          },
        }),
      );
      return;
    }

    if (url.pathname === `/ipfs/${imagePath}`) {
      res.setHeader('content-type', 'image/png');
      res.end(Buffer.from([0, 1, 2, 3]));
      return;
    }

    if (url.pathname === `/ipfs/${mediaPath}`) {
      res.setHeader('content-type', 'video/mp4');
      res.end(mediaBytes);
      return;
    }

    if (url.pathname === `/ipfs/${altPath}`) {
      res.setHeader('content-type', 'application/octet-stream');
      res.end(Buffer.from('alt'));
      return;
    }

    if (url.pathname === '/v1/preservations/quotes' && req.method === 'POST') {
      counters.quoteRequests += 1;
      const body = await readJson(req);
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          quoteId: 'quote_test',
          expiresAt: '2026-01-01T00:00:00.000Z',
          billableBytes: body.assets.reduce((sum, asset) => sum + asset.size, 0),
          tokenAmount: '123',
          ratePerByteAtomic: '69690000000',
          source: body.source,
          assets: body.assets,
          acceptedPayments: [
            {
              scheme: 'exact',
              network: 'eip155:11155111',
              asset: '0x197FaeF3f59eC80113e773Bb6206a17d183F97CB',
              payTo: '0x1111111111111111111111111111111111111111',
              amount: '123',
              maxTimeoutSeconds: 60,
              extra: null,
            },
          ],
        }),
      );
      return;
    }

    if (url.pathname === '/v1/preservations/quotes/quote_test/upload-session' && req.method === 'POST') {
      counters.uploadSessionRequests += 1;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          quoteId: 'quote_test',
          uploadToken: 'upload_token',
          expiresAt: '2026-01-01T00:05:00.000Z',
          uploadTargets: [
            { assetId: 'asset_0000', uploadUrl: `${baseUrl}/upload/asset_0000` },
            { assetId: 'asset_0001', uploadUrl: `${baseUrl}/upload/asset_0001` },
            { assetId: 'asset_0002', uploadUrl: `${baseUrl}/upload/asset_0002` },
            { assetId: 'asset_0003', uploadUrl: `${baseUrl}/upload/asset_0003` },
          ],
        }),
      );
      return;
    }

    if (url.pathname.startsWith('/upload/') && req.method === 'PUT') {
      counters.uploadRequests += 1;
      uploaded.set(url.pathname.split('/').pop(), await readBuffer(req));
      res.statusCode = 204;
      res.end();
      return;
    }

    if (url.pathname === '/v1/preservations/quotes/quote_test/finalize' && req.method === 'POST') {
      counters.finalizeRequests += 1;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          quoteId: 'quote_test',
          jobId: null,
          status: 'completed',
          attempts: 1,
          submittedAt: '2026-01-01T00:07:00.000Z',
          startedAt: '2026-01-01T00:07:00.000Z',
          completedAt: '2026-01-01T00:07:00.000Z',
          errorMessage: null,
          receipt: {
            receiptId: 'receipt_test',
            quoteId: 'quote_test',
            expiresAt: '2026-01-01T00:10:00.000Z',
            manifestCid: 'bafytest',
            manifestIpfsUrl: 'ipfs://bafytest',
            manifestGatewayUrl: `${baseUrl}/ipfs/bafytest`,
            billableBytes: [...uploaded.values()].reduce((sum, buffer) => sum + buffer.length, 0),
            payment: {
              paymentIdentifier: 'pres_test',
              network: 'eip155:11155111',
              tokenAddress: '0x197FaeF3f59eC80113e773Bb6206a17d183F97CB',
              tokenAmount: '123',
              payerAddress: '0x2222222222222222222222222222222222222222',
              transaction: '0xabc123',
              settledAt: '2026-01-01T00:06:00.000Z',
            },
            assets: [
              {
                assetId: 'asset_0000',
                role: 'metadata',
                originalUri: `ipfs://${metadataCid}/metadata.json`,
                filename: 'metadata.json',
                mimeType: 'application/json',
                size: uploaded.get('asset_0000')?.length ?? 0,
                sha256: 'a',
                cid: 'cid0',
                ipfsUrl: 'ipfs://cid0',
                gatewayUrl: `${baseUrl}/cid0`,
              },
              {
                assetId: 'asset_0001',
                role: 'image',
                originalUri: `ipfs://${imagePath}`,
                filename: 'image.png',
                mimeType: 'image/png',
                size: uploaded.get('asset_0001')?.length ?? 0,
                sha256: 'b',
                cid: 'cid1',
                ipfsUrl: 'ipfs://cid1',
                gatewayUrl: `${baseUrl}/cid1`,
              },
              {
                assetId: 'asset_0002',
                role: 'media.uri',
                originalUri: `ipfs://${mediaPath}`,
                filename: 'animation.mp4',
                mimeType: 'video/mp4',
                size: uploaded.get('asset_0002')?.length ?? 0,
                sha256: 'c',
                cid: 'cid2',
                ipfsUrl: 'ipfs://cid2',
                gatewayUrl: `${baseUrl}/cid2`,
              },
              {
                assetId: 'asset_0003',
                role: 'properties.files',
                originalUri: `ipfs://${altPath}`,
                filename: 'alt.bin',
                mimeType: 'application/octet-stream',
                size: uploaded.get('asset_0003')?.length ?? 0,
                sha256: 'd',
                cid: 'cid3',
                ipfsUrl: 'ipfs://cid3',
                gatewayUrl: `${baseUrl}/cid3`,
              },
            ],
            source: {
              chain: 'sepolia',
              chainId: 11155111,
              contractAddress: '0x3333333333333333333333333333333333333333',
              tokenId: '7',
              universalTokenId: '11155111-0x3333333333333333333333333333333333333333-7',
              tokenUri: `ipfs://${metadataCid}/metadata.json`,
            },
            createdAt: '2026-01-01T00:07:00.000Z',
          },
        }),
      );
      return;
    }

    res.statusCode = 404;
    res.end('not found');
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    counters,
    close() {
      server.close();
    },
  };
}

function readBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readJson(req) {
  return JSON.parse((await readBuffer(req)).toString('utf8'));
}
