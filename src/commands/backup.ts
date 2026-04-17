import { Command } from 'commander';
import { formatEther } from 'viem';
import { getWalletClientStrict, getPublicClient } from '../client.js';
import { getActiveChain, getPreservationConfig } from '../config.js';
import { supportedChainFromChainId, type SupportedChain } from '../contracts/addresses.js';
import type { PreservationQuote, PreservationReceipt } from '../sdk/backup-service.js';
import {
  DEFAULT_PRESERVATION_GATEWAY_URL,
  DEFAULT_PRESERVATION_MAX_BYTES,
  DEFAULT_PRESERVATION_SERVICE_URL,
} from '../sdk/backup-service.js';
import { parseUniversalTokenId } from '../sdk/backup-resolver.js';
import { createRareClient } from '../sdk/client.js';
import { output, log } from '../output.js';

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
    .option('--service-url <url>', 'override the preservation service URL (default: http://localhost:6969)')
    .option('--gateway <url>', 'override the IPFS gateway used for asset fetches')
    .option('--max-bytes <bytes>', 'maximum bytes to preserve before aborting')
    .action(async (opts) => {
      validateTargetOptions(opts);

      const preservationConfig = getPreservationConfig();
      const sourceChain = resolveSourceChain(opts);
      const paymentChain = resolvePaymentChain(opts, preservationConfig.defaultPaymentChain, sourceChain);
      const gatewayUrl = opts.gateway ?? preservationConfig.gatewayUrl ?? DEFAULT_PRESERVATION_GATEWAY_URL;
      const maxBytes = parseMaxBytes(opts.maxBytes, preservationConfig.maxBytes);
      const serviceUrl = opts.serviceUrl ?? preservationConfig.serviceUrl ?? DEFAULT_PRESERVATION_SERVICE_URL;

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

      const rare = createRareClient({
        publicClient: publicClientResolver(sourceChain),
      });

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
        log(`Resolving NFT and requesting a preservation quote on ${sourceChain}...`);
        const quote = await rare.backup.quoteTokenPreservation(backupParams);
        output(quote, () => {
          printQuote(quote, paymentChain);
        });
        return;
      }

      const paymentWallet = getWalletClientStrict(paymentChain);
      log(`Resolving NFT on ${sourceChain} and preparing preservation payment on ${paymentChain}...`);
      const result = await rare.backup.preserveToken({
        ...backupParams,
        paymentWalletClient: paymentWallet.client,
        paymentRpcUrl: paymentWallet.rpcUrl,
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
  configuredPaymentChain: SupportedChain | undefined,
  sourceChain: SupportedChain,
): SupportedChain {
  if (opts.paymentChain) {
    return getActiveChain(opts.paymentChain);
  }

  return configuredPaymentChain ?? sourceChain;
}

function parseMaxBytes(rawValue: string | undefined, configuredValue: number | undefined): number {
  if (rawValue === undefined) {
    return configuredValue ?? DEFAULT_PRESERVATION_MAX_BYTES;
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('--max-bytes must be a positive integer.');
  }

  return value;
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
  console.log(`  Record CID:     ${receipt.manifestCid}`);
  console.log(`  Record URI:     ${receipt.manifestIpfsUrl}`);
  const manifestGatewayUrl = resolveManifestGatewayUrl(receipt, opts.gatewayUrl);
  if (manifestGatewayUrl) {
    console.log(`  Record link:    ${manifestGatewayUrl}`);
  }
  console.log(`  Assets pinned:  ${receipt.assets.length}`);
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
