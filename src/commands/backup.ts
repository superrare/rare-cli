import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { Command } from 'commander';
import { formatEther } from 'viem';
import { getWalletClientStrict, getPublicClient } from '../client.js';
import { getActiveChain } from '../config.js';
import { supportedChainFromChainId, type SupportedChain } from '../contracts/addresses.js';
import { output, log, isJsonMode } from '../output.js';
import { parseUniversalTokenId, resolveTokenPreservation, type ResolvedTokenPreservation } from '../sdk/backup-resolver.js';
import {
  DEFAULT_PRESERVATION_GATEWAY_URL,
  DEFAULT_PRESERVATION_MAX_BYTES,
  DEFAULT_PRESERVATION_SERVICE_URL,
  createPreservationUploadSession,
  finalizeTokenPreservation,
  paymentNetworkForChain,
  quoteTokenPreservation as quoteTokenPreservationApi,
  uploadPreservationAssets,
  type PreservationAsset,
  type PreservationFinalizeJobStatus,
  type PreservationUploadProgress,
  type PreservationQuote,
  type PreservationReceipt,
} from '../sdk/backup-service.js';
import { createRareClient } from '../sdk/client.js';
import { createX402PaymentFetch } from '../sdk/x402-client.js';

export function backupCommand(): Command {
  const cmd = new Command('backup');
  cmd.description('Preserve existing NFTs through a hosted x402/IPFS backup service');

  cmd
    .command('token')
    .description('Back up an existing NFT metadata URI and its directly referenced media')
    .option('--contract <address>', 'token contract address')
    .option('--token-id <id>', 'token ID to preserve')
    .option('--universal-token-id <id>', 'canonical token identifier in chainId-contract-tokenId format')
    .option('--chain <chain>', 'chain to use for on-chain tokenURI resolution')
    .option('--payment-chain <chain>', 'chain to use for RARE/x402 payment')
    .option('--quote-only', 'resolve bytes and request a quote without paying')
    .option('-y, --yes', 'approve the quoted preservation cost without prompting')
    .option('--service-url <url>', `override the preservation service URL (default: ${DEFAULT_PRESERVATION_SERVICE_URL})`)
    .option('--gateway <url>', 'override the IPFS gateway used for asset fetches')
    .option('--max-bytes <bytes>', 'maximum bytes to preserve before aborting')
    .action(async (opts) => {
      validateTargetOptions(opts);

      const sourceChain = resolveSourceChain(opts);
      const paymentChain = resolvePaymentChain(opts, sourceChain);
      const gatewayUrl = opts.gateway ?? DEFAULT_PRESERVATION_GATEWAY_URL;
      const maxBytes = parseMaxBytes(opts.maxBytes);
      const serviceUrl = opts.serviceUrl ?? DEFAULT_PRESERVATION_SERVICE_URL;

      const sourceClients = new Map<SupportedChain, ReturnType<typeof getPublicClient>>([
        [sourceChain, getPublicClient(sourceChain)],
      ]);
      const publicClientResolver = (chain: SupportedChain) => {
        const existing = sourceClients.get(chain);
        if (existing) return existing;
        const created = getPublicClient(chain);
        sourceClients.set(chain, created);
        return created;
      };

      const backupParams = {
        serviceUrl,
        contract: opts.contract as `0x${string}` | undefined,
        tokenId: opts.tokenId,
        universalTokenId: opts.universalTokenId as string | undefined,
        sourceChain,
        paymentChain,
        gatewayUrl,
        maxBytes,
        publicClientResolver,
      };

      if (opts.quoteOnly) {
        const rare = createRareClient({
          publicClient: publicClientResolver(sourceChain),
        });
        log(`Resolving NFT and requesting a preservation quote on ${sourceChain}...`);
        const quote = await rare.backup.quoteTokenPreservation(backupParams);
        output(quote, () => {
          printQuote(quote, paymentChain);
        });
        return;
      }

      const paymentWallet = getWalletClientStrict(paymentChain);
      log(`Resolving NFT and requesting a preservation quote on ${sourceChain}...`);
      const resolved = await resolveTokenPreservation({
        publicClient: publicClientResolver(sourceChain),
        chain: sourceChain,
        contract: backupParams.contract,
        tokenId: backupParams.tokenId,
        universalTokenId: backupParams.universalTokenId,
        gatewayUrl: backupParams.gatewayUrl,
        maxBytes: backupParams.maxBytes,
      });
      const quote = await quoteTokenPreservationApi({
        serviceUrl,
        request: createQuoteRequest(resolved, paymentChain),
      });

      const confirmed = await confirmPreservationQuote({
        quote,
        paymentChain,
        assumeYes: Boolean(opts.yes),
      });
      if (!confirmed) {
        log('Preservation cancelled.');
        return;
      }

      log(`Preparing preservation payment on ${paymentChain}...`);
      const result = await preserveQuotedToken({
        serviceUrl,
        paymentChain,
        paymentWallet,
        quote,
        resolved,
      });

      output(result, () => {
        printReceipt(result.receipt, {
          quote: result.quote,
          gatewayUrl,
        });
      });
    });

  return cmd;
}

function validateTargetOptions(opts: {
  contract?: string;
  tokenId?: string;
  universalTokenId?: string;
}): void {
  const hasContractTarget = Boolean(opts.contract || opts.tokenId);
  const hasUniversalTarget = Boolean(opts.universalTokenId);

  if (hasUniversalTarget && hasContractTarget) {
    throw new Error('Use either --universal-token-id or --contract/--token-id, not both.');
  }

  if (!hasUniversalTarget && !hasContractTarget) {
    throw new Error('Pass either --universal-token-id or both --contract and --token-id.');
  }

  if (hasContractTarget && (!opts.contract || !opts.tokenId)) {
    throw new Error('--contract and --token-id must be provided together.');
  }
}

function resolveSourceChain(opts: { chain?: string; universalTokenId?: string }): SupportedChain {
  if (opts.universalTokenId) {
    return parseUniversalTokenId(opts.universalTokenId).chain;
  }

  return getActiveChain(opts.chain);
}

function resolvePaymentChain(
  opts: { paymentChain?: string },
  sourceChain: SupportedChain,
): SupportedChain {
  if (opts.paymentChain) {
    return getActiveChain(opts.paymentChain);
  }

  return sourceChain;
}

function parseMaxBytes(rawValue: string | undefined): number {
  if (rawValue === undefined) {
    return DEFAULT_PRESERVATION_MAX_BYTES;
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('--max-bytes must be a positive integer.');
  }

  return value;
}

function createQuoteRequest(
  resolved: ResolvedTokenPreservation,
  paymentChain: SupportedChain,
): {
  source: PreservationQuote['source'];
  assets: PreservationQuote['assets'];
  preferredPaymentChain: SupportedChain;
} {
  return {
    source: resolved.source,
    assets: resolved.assets.map(({ assetId, role, originalUri, filename, mimeType, size, sha256 }) => ({
      assetId,
      role,
      originalUri,
      filename,
      mimeType,
      size,
      sha256,
    })),
    preferredPaymentChain: paymentChain,
  };
}

async function confirmPreservationQuote(opts: {
  quote: PreservationQuote;
  paymentChain: SupportedChain;
  assumeYes: boolean;
}): Promise<boolean> {
  if (!isJsonMode()) {
    printQuote(opts.quote, opts.paymentChain);
  }

  if (opts.assumeYes) {
    return true;
  }

  if (isJsonMode()) {
    throw new Error(
      'Preservation payments now require confirmation. Re-run without --json to confirm interactively, or pass --yes to accept the quoted cost.'
    );
  }

  if (!hasInteractiveTerminal()) {
    throw new Error(
      'Preservation payment requires confirmation, but no interactive terminal is available. Re-run with --yes to accept the quoted cost, or use --quote-only.'
    );
  }

  const answer = await askQuestion(
    `\nProceed with preservation payment of ${formatRareAmount(opts.quote.tokenAmount)} on ${displayChainName(opts.paymentChain)}? [y/N] `
  );

  return isAffirmativeAnswer(answer);
}

function hasInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function askQuestion(question: string): Promise<string> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    return await readline.question(question);
  } finally {
    readline.close();
  }
}

function isAffirmativeAnswer(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes';
}

async function preserveQuotedToken(opts: {
  serviceUrl: string;
  paymentChain: SupportedChain;
  paymentWallet: ReturnType<typeof getWalletClientStrict>;
  quote: PreservationQuote;
  resolved: ResolvedTokenPreservation;
}): Promise<{
  quote: PreservationQuote;
  receipt: PreservationReceipt;
}> {
  const selectedNetwork = paymentNetworkForChain(opts.paymentChain);
  if (!opts.quote.acceptedPayments.some((option) => option.network === selectedNetwork)) {
    throw new Error(
      `Preservation service does not advertise a payment option for "${opts.paymentChain}" (${selectedNetwork}).`
    );
  }

  const paymentFetch = createX402PaymentFetch({
    paymentChain: opts.paymentChain,
    rpcUrl: opts.paymentWallet.rpcUrl,
    account: opts.paymentWallet.account,
  });

  const uploadSession = await createPreservationUploadSession({
    serviceUrl: opts.serviceUrl,
    quoteId: opts.quote.quoteId,
    fetchImpl: paymentFetch,
  });

  log('Uploading quoted assets directly to preservation storage...');
  await uploadPreservationAssets(
    opts.serviceUrl,
    uploadSession,
    opts.resolved.assets,
    fetch,
    createPreservationUploadLogger(),
  );

  log('Waiting for preservation finalization...');
  const receipt = await finalizeTokenPreservation({
    serviceUrl: opts.serviceUrl,
    quoteId: opts.quote.quoteId,
    uploadToken: uploadSession.uploadToken,
    onStatusUpdate: createFinalizeStatusLogger(),
  });

  return {
    quote: opts.quote,
    receipt,
  };
}

function printQuote(quote: PreservationQuote, paymentChain: SupportedChain): void {
  console.log('\nPreservation quote:');
  console.log(`  Quote ID:       ${quote.quoteId}`);
  console.log(`  Source:         ${quote.source.universalTokenId}`);
  console.log(`  Token URI:      ${quote.source.tokenUri}`);
  console.log(`  Payment chain:  ${paymentChain}`);
  console.log(`  Billable bytes: ${quote.billableBytes}`);
  console.log(`  Amount:         ${formatRareAmount(quote.tokenAmount)}`);
  console.log(`  Expires:        ${quote.expiresAt}`);
  console.log(`  Assets:         ${quote.assets.length}`);
}

function createPreservationUploadLogger(): (progress: PreservationUploadProgress) => void {
  return (progress) => {
    const assetLabel = `${progress.assetIndex + 1}/${progress.assetCount} (${progress.assetId})`;

    if (progress.phase === 'asset-started') {
      log(`Uploading preservation asset ${assetLabel} (${progress.totalBytes} bytes)...`);
      return;
    }

    if (progress.phase === 'part-completed') {
      if ((progress.partCount ?? 0) > 1 && progress.partNumber !== null) {
        log(
          `Uploaded preservation asset ${assetLabel} part ${progress.partNumber}/${progress.partCount} (${progress.uploadedBytes}/${progress.totalBytes} bytes).`,
        );
      }
      return;
    }

    log(`Verified preservation upload for asset ${assetLabel}.`);
  };
}

function createFinalizeStatusLogger(): (status: PreservationFinalizeJobStatus) => void {
  let previousStatus: PreservationFinalizeJobStatus['status'] | null = null;

  return (status) => {
    if (status.status === previousStatus) {
      return;
    }

    previousStatus = status.status;
    if (status.status === 'queued') {
      log(
        status.jobId
          ? `Preservation finalize job queued (${status.jobId}).`
          : 'Preservation finalize job queued.',
      );
      return;
    }

    if (status.status === 'processing') {
      log(
        status.jobId
          ? `Preservation finalize job processing (${status.jobId}).`
          : 'Preservation finalize job processing.',
      );
      return;
    }

    if (status.status === 'completed') {
      log(
        status.jobId
          ? `Preservation finalize job completed (${status.jobId}).`
          : 'Preservation finalize job completed.',
      );
      return;
    }

    log(
      status.jobId
        ? `Preservation finalize job failed (${status.jobId}).`
        : 'Preservation finalize job failed.',
    );
  };
}

function printReceipt(
  receipt: PreservationReceipt,
  opts: {
    quote?: PreservationQuote;
    gatewayUrl?: string;
  } = {},
): void {
  console.log('\nPreservation complete:');
  console.log(`  Receipt ID:     ${receipt.receiptId}`);
  console.log(`  Quote ID:       ${receipt.quoteId}`);
  const expiresAt = resolvePreservationExpiration(receipt, opts.quote);
  if (expiresAt) {
    console.log(`  Expires:        ${expiresAt}`);
  }
  console.log(`  Source:         ${receipt.source.universalTokenId}`);
  console.log(`  Billable bytes: ${receipt.billableBytes}`);
  console.log(`  Amount paid:    ${formatRareAmount(receipt.payment.tokenAmount)}`);
  console.log(`  Payment rail:   ${formatPaymentRail(receipt.payment.network)}`);
  if (receipt.payment.payerAddress) {
    console.log(`  Payer:          ${receipt.payment.payerAddress}`);
  }
  const settlementTx = resolveSettlementTransaction(receipt);
  if (settlementTx) {
    console.log(`  Settlement tx:  ${settlementTx}`);
  }
  const manifestGatewayUrl = resolveManifestGatewayUrl(receipt, opts.gatewayUrl);
  if (manifestGatewayUrl) {
    console.log(`  Your Receipt:   ${manifestGatewayUrl}`);
  }
  console.log(`  Assets pinned:  ${receipt.assets.length}`);
  const pinnedAssetLinks = receipt.assets
    .map((asset) => ({
      label: formatPinnedAssetLabel(asset),
      url: resolvePreservedAssetGatewayUrl(asset, opts.gatewayUrl),
    }))
    .filter((asset): asset is { label: string; url: string } => asset.url !== null);
  if (pinnedAssetLinks.length > 0) {
    console.log('  Asset links:');
    for (const asset of pinnedAssetLinks) {
      console.log(`    ${asset.label}: ${asset.url}`);
    }
  }
}

function formatRareAmount(tokenAmount: string): string {
  return `${formatEther(BigInt(tokenAmount))} RARE`;
}

function formatPaymentRail(network: string): string {
  const chainName = chainNameFromPaymentNetwork(network);
  return chainName ? `RARE on ${chainName}` : `RARE on ${network}`;
}

function chainNameFromPaymentNetwork(network: string): string | null {
  const match = /^eip155:(\d+)$/.exec(network);
  if (!match) return null;

  const chainId = Number.parseInt(match[1], 10);
  if (!Number.isSafeInteger(chainId)) return null;

  const chain = supportedChainFromChainId(chainId);
  return chain ? displayChainName(chain) : network;
}

function displayChainName(chain: SupportedChain): string {
  switch (chain) {
    case 'mainnet':
      return 'Ethereum Mainnet';
    case 'sepolia':
      return 'Ethereum Sepolia';
    case 'base':
      return 'Base';
    case 'base-sepolia':
      return 'Base Sepolia';
  }
}

function resolveSettlementTransaction(receipt: PreservationReceipt): string | null {
  if (receipt.payment.transaction) {
    return receipt.payment.transaction;
  }

  return extractTransactionFromResponse(receipt.payment.response);
}

function resolvePreservationExpiration(
  receipt: PreservationReceipt,
  quote?: PreservationQuote,
): string | null {
  if (receipt.expiresAt) {
    return receipt.expiresAt;
  }

  return quote?.expiresAt ?? null;
}

function resolveManifestGatewayUrl(
  receipt: PreservationReceipt,
  gatewayUrl?: string,
): string | null {
  if (receipt.manifestGatewayUrl) {
    return receipt.manifestGatewayUrl;
  }

  if (!gatewayUrl) {
    return null;
  }

  const normalizedGatewayUrl = gatewayUrl.replace(/\/+$/, '');
  return `${normalizedGatewayUrl}/ipfs/${receipt.manifestCid}`;
}

function resolvePreservedAssetGatewayUrl(
  asset: PreservationAsset,
  gatewayUrl?: string,
): string | null {
  if (asset.gatewayUrl) {
    return asset.gatewayUrl;
  }

  if (!gatewayUrl || !asset.cid) {
    return null;
  }

  const normalizedGatewayUrl = gatewayUrl.replace(/\/+$/, '');
  return `${normalizedGatewayUrl}/ipfs/${asset.cid}`;
}

function formatPinnedAssetLabel(asset: PreservationAsset): string {
  const label = asset.filename || asset.assetId;
  return asset.role ? `${asset.role} (${label})` : label;
}

function extractTransactionFromResponse(response: unknown): string | null {
  if (!response || typeof response !== 'object') {
    return null;
  }

  const candidates = [
    (response as Record<string, unknown>).transaction,
    (response as Record<string, unknown>).transactionHash,
    (response as Record<string, unknown>).txHash,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}
