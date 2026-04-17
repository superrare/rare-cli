import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRareClient } from '../dist/client.js';

test('quote and preserve an NFT through the hosted backup service contract', async () => {
  const uploaded = new Map();
  let baseUrl = '';
  const quoteExpiresAt = '2026-01-01T00:00:00.000Z';
  const uploadSessionExpiresAt = '2026-01-01T00:05:00.000Z';
  const receiptExpiresAt = '2026-01-01T00:10:00.000Z';
  const settledAt = '2026-01-01T00:06:00.000Z';
  const createdAt = '2026-01-01T00:07:00.000Z';

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (url.pathname === '/metadata.json') {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          image: `${baseUrl}/image.png`,
          properties: {
            files: [{ url: `${baseUrl}/alt.bin` }],
          },
        }),
      );
      return;
    }

    if (url.pathname === '/image.png') {
      res.setHeader('content-type', 'image/png');
      res.end(Buffer.from([0, 1, 2, 3]));
      return;
    }

    if (url.pathname === '/alt.bin') {
      res.setHeader('content-type', 'application/octet-stream');
      res.end(Buffer.from('alt'));
      return;
    }

    if (url.pathname === '/v1/preservations/quotes' && req.method === 'POST') {
      const body = await readJson(req);
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          quoteId: 'quote_test',
          expiresAt: quoteExpiresAt,
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
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          quoteId: 'quote_test',
          uploadToken: 'upload_token',
          expiresAt: uploadSessionExpiresAt,
          uploadTargets: [
            { assetId: 'asset_0000', uploadUrl: `${baseUrl}/upload/asset_0000` },
            { assetId: 'asset_0001', uploadUrl: `${baseUrl}/upload/asset_0001` },
            { assetId: 'asset_0002', uploadUrl: `${baseUrl}/upload/asset_0002` },
          ],
        }),
      );
      return;
    }

    if (url.pathname.startsWith('/upload/') && req.method === 'PUT') {
      uploaded.set(url.pathname.split('/').pop(), await readBuffer(req));
      res.statusCode = 204;
      res.end();
      return;
    }

    if (url.pathname === '/v1/preservations/quotes/quote_test/finalize' && req.method === 'POST') {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          receiptId: 'receipt_test',
          quoteId: 'quote_test',
          expiresAt: receiptExpiresAt,
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
            settledAt,
          },
          assets: [
            {
              assetId: 'asset_0000',
              role: 'metadata',
              originalUri: `${baseUrl}/metadata.json`,
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
              originalUri: `${baseUrl}/image.png`,
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
              role: 'properties.files',
              originalUri: `${baseUrl}/alt.bin`,
              filename: 'alt.bin',
              mimeType: 'application/octet-stream',
              size: uploaded.get('asset_0002')?.length ?? 0,
              sha256: 'c',
              cid: 'cid2',
              ipfsUrl: 'ipfs://cid2',
              gatewayUrl: `${baseUrl}/cid2`,
            },
          ],
          source: {
            chain: 'sepolia',
            chainId: 11155111,
            contractAddress: '0x3333333333333333333333333333333333333333',
            tokenId: '7',
            universalTokenId: '11155111-0x3333333333333333333333333333333333333333-7',
            tokenUri: `${baseUrl}/metadata.json`,
          },
          createdAt,
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

  try {
    const publicClient = {
      chain: { id: 11155111 },
      readContract: async ({ functionName }) => {
        if (functionName === 'tokenURI') {
          return `${baseUrl}/metadata.json`;
        }
        throw new Error(`unexpected contract read: ${functionName}`);
      },
    };

    const paymentWalletClient = {
      account: { address: '0x2222222222222222222222222222222222222222' },
      chain: { id: 11155111 },
      transport: { url: `${baseUrl}/rpc` },
    };

    const rare = createRareClient({ publicClient });

    const quote = await rare.backup.quoteTokenPreservation({
      serviceUrl: baseUrl,
      contract: '0x3333333333333333333333333333333333333333',
      tokenId: '7',
      sourceChain: 'sepolia',
    });

    assert.equal(quote.quoteId, 'quote_test');
    assert.equal(quote.assets.length, 3);
    assert.equal(quote.expiresAt, quoteExpiresAt);

    const result = await rare.backup.preserveToken({
      serviceUrl: baseUrl,
      contract: '0x3333333333333333333333333333333333333333',
      tokenId: '7',
      sourceChain: 'sepolia',
      paymentChain: 'sepolia',
      paymentWalletClient,
      paymentRpcUrl: `${baseUrl}/rpc`,
      paymentFetch: fetch,
    });

    assert.equal(result.receipt.receiptId, 'receipt_test');
    assert.equal(result.receipt.expiresAt, receiptExpiresAt);
    assert.equal(result.receipt.manifestGatewayUrl, `${baseUrl}/ipfs/bafytest`);
    assert.equal(result.receipt.assets.length, 3);
    assert.equal(result.receipt.payment.transaction, '0xabc123');
    assert.equal(uploaded.size, 3);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

function readBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  return JSON.parse((await readBuffer(req)).toString('utf8'));
}
