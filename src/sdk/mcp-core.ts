import { privateKeyToAccount } from 'viem/accounts';
import type { Config } from '../config.js';
import { supportedChains, type SupportedChain } from '../contracts/addresses.js';

export const mcpReadToolNames = [
  'config_summary',
  'wallet_address',
  'currencies',
  'search_nfts',
  'search_collections',
  'list_collections',
  'get_nft',
  'get_collection',
  'get_user',
  'get_nft_events',
  'get_collection_events',
  'token_contract_status',
  'token_status',
  'token_price',
  'auction_status',
  'offer_status',
  'listing_status',
] as const;

export const mcpWriteToolNames = [
  'deploy_erc721',
  'import_erc721',
  'upload_media',
  'pin_metadata',
  'mint',
  'auction_create',
  'auction_bid',
  'auction_settle',
  'auction_cancel',
  'offer_create',
  'offer_cancel',
  'offer_accept',
  'listing_create',
  'listing_cancel',
  'listing_buy',
] as const;

export type McpReadToolName = (typeof mcpReadToolNames)[number];
export type McpWriteToolName = (typeof mcpWriteToolNames)[number];
export type McpToolName = McpReadToolName | McpWriteToolName;

export type McpConfigSummary = {
  defaultChain: SupportedChain;
  chains: Partial<Record<SupportedChain, {
    hasPrivateKey: boolean;
    privateKey?: string;
    walletAddress?: string;
    rpcUrl?: string;
  }>>;
};

export function selectMcpToolNames(opts: { allowWrites: boolean }): McpToolName[] {
  return opts.allowWrites
    ? [...mcpReadToolNames, ...mcpWriteToolNames]
    : [...mcpReadToolNames];
}

export function resolveMcpChain(config: Config, chain?: string): SupportedChain {
  const candidate = chain ?? config.defaultChain ?? 'sepolia';
  if (!isSupportedChainName(candidate)) {
    throw new Error(`Unsupported chain "${candidate}". Supported chains: ${supportedChains.join(', ')}`);
  }
  return candidate;
}

export function shapeMcpConfigSummary(config: Config): McpConfigSummary {
  const chains: McpConfigSummary['chains'] = {};
  for (const chain of supportedChains) {
    const chainConfig = config.chains[chain];
    if (!chainConfig) continue;
    chains[chain] = {
      hasPrivateKey: Boolean(chainConfig.privateKey),
      privateKey: chainConfig.privateKey ? maskSecret(chainConfig.privateKey) : undefined,
      walletAddress: chainConfig.privateKey
        ? privateKeyToAccount(chainConfig.privateKey as `0x${string}`).address
        : undefined,
      rpcUrl: chainConfig.rpcUrl,
    };
  }

  return {
    defaultChain: config.defaultChain ?? 'sepolia',
    chains,
  };
}

export function serializeForMcp(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeForMcp);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, nested]) => [key, serializeForMcp(nested)] as const)
        .filter(([, nested]) => nested !== undefined),
    );
  }
  return value;
}

export function maskSecret(value: string): string {
  return value.length <= 10 ? '***' : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function isSupportedChainName(value: string): value is SupportedChain {
  return (supportedChains as readonly string[]).includes(value);
}
