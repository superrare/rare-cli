import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { createRareClient } from '../dist/client.js';

const TEST_PRIVATE_KEY = `0x${'11'.repeat(32)}`;

test('quote and preserve an NFT through the hosted backup service contract', async () => {
  const uploaded = new Map();
  const pendingUploads = new Map();
  let quotedAssets = [];
  let baseUrl = '';
  const quoteExpiresAt = '2026-01-01T00:00:00.000Z';
  const uploadSessionExpiresAt = '2026-01-01T00:05:00.000Z';
  const receiptExpiresAt = '2026-01-01T00:10:00.000Z';
  const settledAt = '2026-01-01T00:06:00.000Z';
  const createdAt = '2026-01-01T00:07:00.000Z';
  const metadataCid = 'bafytestmetadata';
  const imagePath = `${metadataCid}/image.png`;
  const mediaPath = `${metadataCid}/animation.mp4`;
  const altPath = `${metadataCid}/alt.bin`;
  const archiveCid = 'bafybeieoqgt4xroadj5ukoeukr537ri7kbg3gelzddjdudle4ygujxnk3q';
  const archivePath = `${archiveCid}/archive.glb`;
  const mediaBytes = Buffer.from('video-bytes');
  const archiveBytes = Buffer.from('archive-bytes');

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (url.pathname === `/ipfs/${metadataCid}/metadata.json`) {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          image: 'image.png',
          media: {
            uri: 'animation.mp4',
            mimeType: 'video/mp4',
          },
          attachments: {
            archive: archivePath,
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

    if (url.pathname === `/ipfs/${archivePath}`) {
      res.setHeader('content-type', 'model/gltf-binary');
      res.end(archiveBytes);
      return;
    }

    if (url.pathname === '/v1/preservations/quotes' && req.method === 'POST') {
      const body = await readJson(req);
      quotedAssets = body.assets;
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
              extra: {
                assetTransferMethod: 'permit2',
                name: 'SuperRare',
                version: '1',
              },
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
          uploadTargets: quotedAssets.map((asset) =>
            buildMultipartUploadTarget(baseUrl, 'upload_token', asset)
          ),
        }),
      );
      return;
    }

    const uploadMatch = url.pathname.match(/^\/upload\/([^/]+)\/parts\/(\d+)$/);
    if (uploadMatch && req.method === 'PUT') {
      const [, assetId, rawPartNumber] = uploadMatch;
      storeMultipartUploadPart(
        pendingUploads,
        assetId,
        Number.parseInt(rawPartNumber, 10),
        await readBuffer(req),
      );
      res.statusCode = 204;
      res.end();
      return;
    }

    const completeMatch = url.pathname.match(
      /^\/v1\/preservations\/uploads\/upload_token\/([^/]+)\/complete$/,
    );
    if (completeMatch && req.method === 'POST') {
      const [, assetId] = completeMatch;
      const completed = completeMultipartUpload(pendingUploads, uploaded, assetId);
      if (!completed) {
        res.statusCode = 409;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'upload_incomplete' }));
        return;
      }

      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          assetId,
          quoteId: 'quote_test',
          size: uploaded.get(assetId)?.length ?? 0,
          sha256: 'verified',
          verifiedAt: createdAt,
        }),
      );
      return;
    }

    if (url.pathname === '/v1/preservations/quotes/quote_test/finalize' && req.method === 'POST') {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          quoteId: 'quote_test',
          jobId: null,
          status: 'completed',
          attempts: 1,
          submittedAt: createdAt,
          startedAt: createdAt,
          completedAt: createdAt,
          errorMessage: null,
          receipt: {
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
              {
                assetId: 'asset_0004',
                role: 'attachments.archive',
                originalUri: `ipfs://${archivePath}`,
                filename: 'archive.glb',
                mimeType: 'model/gltf-binary',
                size: uploaded.get('asset_0004')?.length ?? 0,
                sha256: 'e',
                cid: 'cid4',
                ipfsUrl: 'ipfs://cid4',
                gatewayUrl: `${baseUrl}/cid4`,
              },
            ],
            source: {
              chain: 'sepolia',
              chainId: 11155111,
              contractAddress: '0x3333333333333333333333333333333333333333',
              tokenId: '7',
              universalTokenId: '11155111-0x3333333333333333333333333333333333333333-7',
              tokenUri: `${baseUrl}/ipfs/${metadataCid}/metadata.json`,
            },
            createdAt,
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

  try {
    const publicClient = {
      chain: { id: 11155111 },
      readContract: async ({ functionName }) => {
        if (functionName === 'tokenURI') {
          return `${baseUrl}/ipfs/${metadataCid}/metadata.json`;
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
      gatewayUrl: baseUrl,
    });

    assert.equal(quote.quoteId, 'quote_test');
    assert.equal(quote.assets.length, 5);
    assert.equal(quote.expiresAt, quoteExpiresAt);
    assert.equal(quote.source.tokenUri, `${baseUrl}/ipfs/${metadataCid}/metadata.json`);
    assert.deepEqual(quote.assets.map((asset) => asset.role), [
      'metadata',
      'image',
      'media.uri',
      'properties.files',
      'attachments.archive',
    ]);
    assert.equal(quote.assets.find((asset) => asset.role === 'media.uri')?.size, mediaBytes.length);
    assert.equal(quote.assets.find((asset) => asset.role === 'attachments.archive')?.size, archiveBytes.length);
    assert.equal(
      quote.assets.find((asset) => asset.role === 'attachments.archive')?.originalUri,
      `ipfs://${archivePath}`
    );

    const result = await rare.backup.preserveToken({
      serviceUrl: baseUrl,
      contract: '0x3333333333333333333333333333333333333333',
      tokenId: '7',
      sourceChain: 'sepolia',
      paymentChain: 'sepolia',
      paymentWalletClient,
      paymentRpcUrl: `${baseUrl}/rpc`,
      paymentFetch: fetch,
      gatewayUrl: baseUrl,
    });

    assert.equal(result.receipt.receiptId, 'receipt_test');
    assert.equal(result.receipt.expiresAt, receiptExpiresAt);
    assert.equal(result.receipt.manifestGatewayUrl, `${baseUrl}/ipfs/bafytest`);
    assert.equal(result.receipt.assets.length, 5);
    assert.equal(result.receipt.payment.transaction, '0xabc123');
    assert.equal(uploaded.size, 5);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('rejects preservation for non-CID-backed token URIs', async () => {
  const publicClient = {
    chain: { id: 11155111 },
    readContract: async ({ functionName }) => {
      if (functionName === 'tokenURI') {
        return 'https://example.com/metadata.json';
      }
      throw new Error(`unexpected contract read: ${functionName}`);
    },
  };

  const rare = createRareClient({ publicClient });

  await assert.rejects(
    () =>
      rare.backup.quoteTokenPreservation({
        serviceUrl: 'http://127.0.0.1:1',
        contract: '0x3333333333333333333333333333333333333333',
        tokenId: '7',
        sourceChain: 'sepolia',
      }),
    /Preservation only supports CID-backed IPFS URIs/
  );
});

test('retries upload-session payment when the seller refreshes the x402 challenge before the paid retry', async () => {
  const uploaded = new Map();
  const pendingUploads = new Map();
  let quotedAssets = [];
  let baseUrl = '';
  let uploadSessionRequests = 0;
  let paidUploadSessionRequests = 0;
  let paymentStatusRequests = 0;
  let finalizeJobStatusRequests = 0;
  let paymentSettled = false;
  const paymentStatuses = [];
  const finalizeProgressPhases = [];
  const metadataCid = 'bafyx402metadata';
  const imagePath = `${metadataCid}/image.png`;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (url.pathname === `/ipfs/${metadataCid}/metadata.json`) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ image: 'image.png' }));
      return;
    }

    if (url.pathname === `/ipfs/${imagePath}`) {
      res.setHeader('content-type', 'image/png');
      res.end(Buffer.from([0, 1, 2, 3]));
      return;
    }

    if (url.pathname === '/v1/preservations/quotes' && req.method === 'POST') {
      const body = await readJson(req);
      quotedAssets = body.assets;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          quoteId: 'quote_retry',
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
              extra: {
                assetTransferMethod: 'permit2',
                name: 'SuperRare',
                version: '1',
              },
            },
          ],
        }),
      );
      return;
    }

    if (url.pathname === '/v1/preservations/quotes/quote_retry/upload-session' && req.method === 'POST') {
      uploadSessionRequests += 1;

      const paymentSignature = req.headers['payment-signature'];
      if (!paymentSignature || Array.isArray(paymentSignature)) {
        respondWithPaymentRequired(res, 60);
        return;
      }

      paidUploadSessionRequests += 1;
      const payment = decodeBase64Json(paymentSignature);
      const acceptedTimeout = payment?.accepted?.maxTimeoutSeconds;

      if (paidUploadSessionRequests === 1) {
        assert.equal(acceptedTimeout, 60);
        respondWithPaymentRequired(res, 59, false);
        return;
      }

      assert.equal(acceptedTimeout, 59);
      await delay(1_100);
      paymentSettled = true;
      await delay(1_100);
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          quoteId: 'quote_retry',
          uploadToken: 'upload_retry',
          expiresAt: '2026-01-01T00:05:00.000Z',
          uploadTargets: quotedAssets.map((asset) =>
            buildMultipartUploadTarget(baseUrl, 'upload_retry', asset)
          ),
        }),
      );
      return;
    }

    if (url.pathname === '/v1/preservations/quotes/quote_retry/payment-status' && req.method === 'GET') {
      paymentStatusRequests += 1;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          quoteId: 'quote_retry',
          quoteStatus: paymentSettled ? 'paid' : 'quoted',
          expiresAt: '2026-01-01T00:00:00.000Z',
          paymentStatus: paymentSettled ? 'settled' : 'pending',
          payment: paymentSettled
            ? {
              paymentIdentifier: 'pres_retry',
              network: 'eip155:11155111',
              tokenAddress: '0x197FaeF3f59eC80113e773Bb6206a17d183F97CB',
              tokenAmount: '123',
              payerAddress: '0x2222222222222222222222222222222222222222',
              transaction: '0xretry123',
              settledAt: '2026-01-01T00:06:00.000Z',
            }
            : null,
        }),
      );
      return;
    }

    const uploadMatch = url.pathname.match(/^\/upload\/([^/]+)\/parts\/(\d+)$/);
    if (uploadMatch && req.method === 'PUT') {
      const [, assetId, rawPartNumber] = uploadMatch;
      storeMultipartUploadPart(
        pendingUploads,
        assetId,
        Number.parseInt(rawPartNumber, 10),
        await readBuffer(req),
      );
      res.statusCode = 204;
      res.end();
      return;
    }

    const completeMatch = url.pathname.match(
      /^\/v1\/preservations\/uploads\/upload_retry\/([^/]+)\/complete$/,
    );
    if (completeMatch && req.method === 'POST') {
      const [, assetId] = completeMatch;
      const completed = completeMultipartUpload(pendingUploads, uploaded, assetId);
      if (!completed) {
        res.statusCode = 409;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'upload_incomplete' }));
        return;
      }

      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          assetId,
          quoteId: 'quote_retry',
          size: uploaded.get(assetId)?.length ?? 0,
          sha256: 'verified',
          verifiedAt: '2026-01-01T00:07:00.000Z',
        }),
      );
      return;
    }

    if (url.pathname === '/v1/preservations/quotes/quote_retry/finalize' && req.method === 'POST') {
      res.statusCode = 202;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          quoteId: 'quote_retry',
          jobId: 'job_retry',
          status: 'queued',
          progressPhase: 'queued',
          attempts: 0,
          submittedAt: '2026-01-01T00:07:00.000Z',
          startedAt: null,
          completedAt: null,
          errorMessage: null,
          receipt: null,
        }),
      );
      return;
    }

    if (url.pathname === '/v1/preservations/finalize-jobs/job_retry' && req.method === 'GET') {
      finalizeJobStatusRequests += 1;
      res.setHeader('content-type', 'application/json');
      const isCompleted = finalizeJobStatusRequests > 1;
      res.end(
        JSON.stringify({
          jobId: 'job_retry',
          quoteId: 'quote_retry',
          status: isCompleted ? 'completed' : 'processing',
          progressPhase: isCompleted ? 'completed' : 'pinning_manifest',
          attempts: 1,
          submittedAt: '2026-01-01T00:07:00.000Z',
          startedAt: '2026-01-01T00:07:01.000Z',
          completedAt: isCompleted ? '2026-01-01T00:07:02.000Z' : null,
          errorMessage: null,
          receipt: isCompleted ? {
            receiptId: 'receipt_retry',
            quoteId: 'quote_retry',
            expiresAt: '2026-01-01T00:10:00.000Z',
            manifestCid: 'bafyretry',
            manifestIpfsUrl: 'ipfs://bafyretry',
            manifestGatewayUrl: `${baseUrl}/ipfs/bafyretry`,
            billableBytes: [...uploaded.values()].reduce((sum, buffer) => sum + buffer.length, 0),
            payment: {
              paymentIdentifier: 'pres_retry',
              network: 'eip155:11155111',
              tokenAddress: '0x197FaeF3f59eC80113e773Bb6206a17d183F97CB',
              tokenAmount: '123',
              payerAddress: '0x2222222222222222222222222222222222222222',
              transaction: '0xretry123',
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
          } : null,
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
          return `ipfs://${metadataCid}/metadata.json`;
        }
        throw new Error(`unexpected contract read: ${functionName}`);
      },
    };

    const paymentWalletClient = {
      account: privateKeyToAccount(TEST_PRIVATE_KEY),
      chain: { id: 11155111 },
      transport: { url: `${baseUrl}/rpc` },
    };

    const rare = createRareClient({ publicClient });
    const result = await rare.backup.preserveToken({
      serviceUrl: baseUrl,
      contract: '0x3333333333333333333333333333333333333333',
      tokenId: '7',
      sourceChain: 'sepolia',
      paymentChain: 'sepolia',
      paymentWalletClient,
      paymentRpcUrl: `${baseUrl}/rpc`,
      gatewayUrl: baseUrl,
      onPaymentStatusUpdate: (status) => {
        paymentStatuses.push(status.paymentStatus);
      },
      onFinalizeStatusUpdate: (status) => {
        finalizeProgressPhases.push(status.progressPhase ?? status.status);
      },
    });

    assert.equal(result.receipt.receiptId, 'receipt_retry');
    assert.equal(uploadSessionRequests, 3);
    assert.equal(paidUploadSessionRequests, 2);
    assert.equal(paymentStatusRequests, 2);
    assert.deepEqual(paymentStatuses, ['pending', 'settled']);
    assert.equal(finalizeJobStatusRequests, 2);
    assert.deepEqual(finalizeProgressPhases, ['queued', 'pinning_manifest', 'completed']);
    assert.equal(uploaded.size, 2);
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

function respondWithPaymentRequired(res, maxTimeoutSeconds, includeJsonBody = true) {
  res.statusCode = 402;
  res.setHeader(
    'payment-required',
    encodeBase64Json({
      x402Version: 2,
      error: 'Payment required',
      resource: {
        url: 'http://127.0.0.1/upload-session',
        description: 'Upload session',
        mimeType: 'application/json',
      },
      accepts: [
        {
          scheme: 'exact',
          network: 'eip155:11155111',
          amount: '123',
          asset: '0x197FaeF3f59eC80113e773Bb6206a17d183F97CB',
          payTo: '0x1111111111111111111111111111111111111111',
          maxTimeoutSeconds,
          extra: {
            assetTransferMethod: 'permit2',
            name: 'SuperRare',
            version: '1',
          },
        },
      ],
      extensions: {
        'payment-identifier': {
          info: {
            required: true,
          },
        },
      },
    }),
  );

  if (includeJsonBody) {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'payment_required' }));
    return;
  }

  res.end();
}

function encodeBase64Json(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function decodeBase64Json(value) {
  return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function buildMultipartUploadTarget(baseUrl, uploadToken, asset, partSizeBytes = 4) {
  const partCount = Math.ceil(asset.size / partSizeBytes);
  return {
    assetId: asset.assetId,
    uploadTransport: 'google-cloud-storage-xml-multipart',
    partSizeBytes,
    uploadParts: Array.from({ length: partCount }, (_, index) => ({
      partNumber: index + 1,
      uploadUrl: `${baseUrl}/upload/${asset.assetId}/parts/${index + 1}`,
      method: 'PUT',
    })),
    completeUrl: `/v1/preservations/uploads/${uploadToken}/${asset.assetId}/complete`,
    completeMethod: 'POST',
  };
}

function storeMultipartUploadPart(pendingUploads, assetId, partNumber, buffer) {
  const existingParts = pendingUploads.get(assetId) ?? new Map();
  existingParts.set(partNumber, buffer);
  pendingUploads.set(assetId, existingParts);
}

function completeMultipartUpload(pendingUploads, uploaded, assetId) {
  const parts = pendingUploads.get(assetId);
  if (!parts) {
    return false;
  }

  const assembled = Buffer.concat(
    [...parts.entries()]
      .sort(([leftPartNumber], [rightPartNumber]) => leftPartNumber - rightPartNumber)
      .map(([, buffer]) => buffer),
  );

  uploaded.set(assetId, assembled);
  pendingUploads.delete(assetId);
  return true;
}
