import { privateKeyToAccount } from 'viem/accounts';
import type { Config } from '../config.js';
import { supportedChains, type SupportedChain } from '../contracts/addresses.js';

export type McpToolAccess = 'read' | 'write';

export type McpToolSpec = {
  name: string;
  access: McpToolAccess;
  sdkPath?: string;
  description: string;
}

export type McpToolAnnotations = {
  readOnlyHint: boolean;
  destructiveHint?: boolean;
  openWorldHint: true;
};

function sdkTool(access: McpToolAccess, sdkPath: string, description: string): McpToolSpec {
  return {
    name: sdkPathToMcpToolName(sdkPath),
    access,
    sdkPath,
    description,
  };
}

function mcpTool(access: McpToolAccess, name: string, description: string): McpToolSpec {
  return { name, access, description };
}

export const mcpToolSpecs = [
  mcpTool('read', 'config_summary', 'Return masked RARE CLI config without exposing private keys.'),
  mcpTool('read', 'wallet_address', 'Return the configured wallet address for a chain without creating a wallet.'),
  mcpTool('read', 'client_metadata', 'Return client chain metadata.'),
  mcpTool('read', 'contracts_summary', 'Return configured RARE contract addresses for a chain.'),
  sdkTool('read', 'rare.liquidEdition.getFactoryConfig', 'Read Liquid Edition factory configuration.'),
  sdkTool('read', 'rare.liquidEdition.generatePresetCurves', 'Generate Liquid Edition preset curves.'),
  sdkTool('read', 'rare.liquidEdition.validateCurves', 'Validate Liquid Edition curves and return a preview.'),
  sdkTool('write', 'rare.liquidEdition.deploy.multiCurve', 'Deploy a Liquid Edition multicurve token.'),
  sdkTool('read', 'rare.liquidEdition.getTokenUri', 'Read a Liquid Edition token URI.'),
  sdkTool('read', 'rare.liquidEdition.getRenderContract', 'Read a Liquid Edition render contract.'),
  sdkTool('write', 'rare.liquidEdition.setRenderContract', 'Set a Liquid Edition render contract.'),
  sdkTool('read', 'rare.liquidEdition.getPoolInfo', 'Read Liquid Edition pool information.'),
  sdkTool('read', 'rare.liquidEdition.getMarketState', 'Read Liquid Edition market state.'),
  sdkTool('read', 'rare.liquidEdition.getCurrentPrice', 'Read Liquid Edition current price.'),
  sdkTool('read', 'rare.liquidEdition.status', 'Read Liquid Edition telemetry.'),
  sdkTool('write', 'rare.swap.buy', 'Execute a raw liquid-router token buy.'),
  sdkTool('write', 'rare.swap.sell', 'Execute a raw liquid-router token sell.'),
  sdkTool('write', 'rare.swap.swapTokens', 'Execute a raw liquid-router token swap.'),
  sdkTool('read', 'rare.bridge.quote', 'Quote the native fee for bridging RARE.'),
  sdkTool('write', 'rare.bridge.send', 'Bridge RARE to another supported chain.'),
  sdkTool('read', 'rare.swap.quoteBuyToken', 'Quote buying a token with ETH.'),
  sdkTool('write', 'rare.swap.buyToken', 'Buy a token with ETH.'),
  sdkTool('read', 'rare.swap.quoteSellToken', 'Quote selling a token for ETH.'),
  sdkTool('write', 'rare.swap.sellToken', 'Sell a token for ETH.'),
  sdkTool('read', 'rare.swap.quoteBuyRare', 'Quote buying RARE with ETH.'),
  sdkTool('write', 'rare.swap.buyRare', 'Buy RARE with ETH.'),
  sdkTool('write', 'rare.auction.create', 'Create a Bazaar auction.'),
  sdkTool('write', 'rare.auction.bid', 'Bid on a Bazaar auction.'),
  sdkTool('write', 'rare.auction.settle', 'Settle a Bazaar auction.'),
  sdkTool('write', 'rare.auction.cancel', 'Cancel a Bazaar auction.'),
  sdkTool('read', 'rare.auction.status', 'Read Bazaar auction status.'),
  sdkTool('write', 'rare.auction.batch.create', 'Create a batch auction.'),
  sdkTool('write', 'rare.auction.batch.cancel', 'Cancel a batch auction.'),
  sdkTool('read', 'rare.auction.batch.roots', 'List configured batch auction roots.'),
  sdkTool('write', 'rare.auction.batch.bid', 'Bid on a batch auction.'),
  sdkTool('write', 'rare.auction.batch.settle', 'Settle a batch auction.'),
  sdkTool('read', 'rare.auction.batch.status', 'Read batch auction status.'),
  sdkTool('write', 'rare.offer.create', 'Create a Bazaar offer.'),
  sdkTool('write', 'rare.offer.cancel', 'Cancel a Bazaar offer.'),
  sdkTool('write', 'rare.offer.accept', 'Accept a Bazaar offer.'),
  sdkTool('read', 'rare.offer.status', 'Read Bazaar offer status.'),
  sdkTool('write', 'rare.offer.erc1155.create', 'Create an ERC1155 offer.'),
  sdkTool('write', 'rare.offer.erc1155.cancel', 'Cancel an ERC1155 offer.'),
  sdkTool('write', 'rare.offer.erc1155.accept', 'Accept an ERC1155 offer.'),
  sdkTool('read', 'rare.offer.erc1155.status', 'Read ERC1155 offer status.'),
  sdkTool('write', 'rare.offer.batch.create', 'Create a batch offer.'),
  sdkTool('write', 'rare.offer.batch.revoke', 'Revoke a batch offer.'),
  sdkTool('write', 'rare.offer.batch.accept', 'Accept a batch offer.'),
  sdkTool('read', 'rare.offer.batch.status', 'Read batch offer status.'),
  sdkTool('write', 'rare.listing.create', 'Create a Bazaar listing.'),
  sdkTool('write', 'rare.listing.cancel', 'Cancel a Bazaar listing.'),
  sdkTool('write', 'rare.listing.buy', 'Buy a Bazaar listing.'),
  sdkTool('read', 'rare.listing.status', 'Read Bazaar listing status.'),
  sdkTool('write', 'rare.listing.erc1155.create', 'Create an ERC1155 listing.'),
  sdkTool('write', 'rare.listing.erc1155.createBatch', 'Create ERC1155 listings.'),
  sdkTool('write', 'rare.listing.erc1155.cancel', 'Cancel ERC1155 listings.'),
  sdkTool('write', 'rare.listing.erc1155.buy', 'Buy an ERC1155 listing.'),
  sdkTool('write', 'rare.listing.erc1155.checkout', 'Checkout ERC1155 release and listing items.'),
  sdkTool('read', 'rare.listing.erc1155.status', 'Read ERC1155 listing status.'),
  sdkTool('read', 'rare.listing.erc1155.release.allowlist.build', 'Build an ERC1155 release allowlist artifact.'),
  sdkTool('read', 'rare.listing.erc1155.release.allowlist.parse', 'Parse an ERC1155 release allowlist artifact.'),
  sdkTool('read', 'rare.listing.erc1155.release.allowlist.proof', 'Get an ERC1155 release allowlist proof.'),
  sdkTool('read', 'rare.listing.erc1155.release.allowlist.getConfig', 'Read ERC1155 release allowlist configuration.'),
  sdkTool('write', 'rare.listing.erc1155.release.allowlist.setConfig', 'Set ERC1155 release allowlist configuration.'),
  sdkTool('write', 'rare.listing.erc1155.release.allowlist.setConfigBatch', 'Set ERC1155 release allowlist configurations.'),
  sdkTool('write', 'rare.listing.erc1155.release.allowlist.clear', 'Clear ERC1155 release allowlist configuration.'),
  sdkTool('read', 'rare.listing.erc1155.release.limits.getMint', 'Read ERC1155 release mint limit configuration.'),
  sdkTool('write', 'rare.listing.erc1155.release.limits.setMint', 'Set ERC1155 release mint limit configuration.'),
  sdkTool('write', 'rare.listing.erc1155.release.limits.setMintBatch', 'Set ERC1155 release mint limit configurations.'),
  sdkTool('read', 'rare.listing.erc1155.release.limits.getTx', 'Read ERC1155 release transaction limit configuration.'),
  sdkTool('write', 'rare.listing.erc1155.release.limits.setTx', 'Set ERC1155 release transaction limit configuration.'),
  sdkTool('write', 'rare.listing.erc1155.release.limits.setTxBatch', 'Set ERC1155 release transaction limit configurations.'),
  sdkTool('write', 'rare.listing.erc1155.release.configure', 'Configure an ERC1155 release direct sale.'),
  sdkTool('write', 'rare.listing.erc1155.release.configureBatch', 'Configure ERC1155 release direct sales.'),
  sdkTool('write', 'rare.listing.erc1155.release.cancel', 'Cancel ERC1155 release direct sales.'),
  sdkTool('write', 'rare.listing.erc1155.release.mint', 'Mint from an ERC1155 release direct sale.'),
  sdkTool('read', 'rare.listing.erc1155.release.status', 'Read ERC1155 release direct sale status.'),
  sdkTool('read', 'rare.listing.release.allowlist.build', 'Build a release allowlist artifact.'),
  sdkTool('read', 'rare.listing.release.allowlist.parse', 'Parse a release allowlist artifact.'),
  sdkTool('read', 'rare.listing.release.allowlist.proof', 'Get a release allowlist proof.'),
  sdkTool('read', 'rare.listing.release.allowlist.getConfig', 'Read release allowlist configuration.'),
  sdkTool('write', 'rare.listing.release.allowlist.setConfig', 'Set release allowlist configuration.'),
  sdkTool('write', 'rare.listing.release.allowlist.clear', 'Clear release allowlist configuration.'),
  sdkTool('read', 'rare.listing.release.limits.getMint', 'Read release mint limit configuration.'),
  sdkTool('write', 'rare.listing.release.limits.setMint', 'Set release mint limit configuration.'),
  sdkTool('read', 'rare.listing.release.limits.getTx', 'Read release transaction limit configuration.'),
  sdkTool('write', 'rare.listing.release.limits.setTx', 'Set release transaction limit configuration.'),
  sdkTool('write', 'rare.listing.release.configure', 'Configure a release direct sale.'),
  sdkTool('write', 'rare.listing.release.mint', 'Mint from a release direct sale.'),
  sdkTool('read', 'rare.listing.release.status', 'Read release direct sale status.'),
  sdkTool('write', 'rare.listing.batch.create', 'Create a batch listing.'),
  sdkTool('write', 'rare.listing.batch.cancel', 'Cancel a batch listing.'),
  sdkTool('write', 'rare.listing.batch.buy', 'Buy a batch listing.'),
  sdkTool('write', 'rare.listing.batch.setAllowlist', 'Set a batch listing allowlist.'),
  sdkTool('read', 'rare.listing.batch.status', 'Read batch listing status.'),
  sdkTool('read', 'rare.utils.tree.build', 'Build a batch token tree artifact.'),
  sdkTool('read', 'rare.utils.tree.proof', 'Build a batch token proof artifact.'),
  sdkTool('read', 'rare.utils.tree.verify', 'Verify a batch token proof artifact.'),
  sdkTool('read', 'rare.utils.merkle.proof', 'Build a batch listing Merkle proof artifact.'),
  sdkTool('read', 'rare.search.nfts', 'Search NFTs through the RARE API. Use only schema-listed filters. query is full-text search and can be a user/artist/collector display name, collection name, artwork title, tag, or general keyword. If a desired filter is not available, start with query plus page/perPage, then narrow with supported filters such as ownerAddress, creatorAddress, contractAddress, collectionId, listingType, auctionState, auctionCreatorAddress, auctionBidderAddress, offerBuyerAddress, mediaType, tags, and sortBy. Example: { "query": "portrait", "hasListing": true, "listingType": "SALE_PRICE", "sortBy": "recentActivity", "page": 1, "perPage": 5 }.'),
  sdkTool('read', 'rare.search.collections', 'Search collections through the RARE API. Use only query, ownerAddress, sortBy, page, and perPage. If a specific collection filter is not listed, use query first and inspect returned collection IDs. Example: { "query": "SuperRare", "sortBy": "newest", "page": 1, "perPage": 5 }.'),
  sdkTool('read', 'rare.search.events', 'Search NFT or collection events through the RARE API. Use contract plus tokenId for one NFT, or collectionId for collection-wide events. eventType values are case-sensitive; if unsure, omit eventType and sort/page through recent events. Example: { "contract": "0x...", "tokenId": "1", "eventType": ["MAKE_LISTING", "TAKE_LISTING"], "sortBy": "newest" }.'),
  sdkTool('read', 'rare.nft.get', 'Get an NFT by contract and token ID.'),
  sdkTool('read', 'rare.collection.get', 'Get a collection by ID.'),
  sdkTool('read', 'rare.collection.status', 'Read collection status.'),
  sdkTool('write', 'rare.collection.deploy.erc721', 'Deploy an ERC-721 collection.'),
  sdkTool('write', 'rare.collection.deploy.erc1155', 'Deploy an ERC-1155 collection.'),
  sdkTool('write', 'rare.collection.deploy.lazyErc721', 'Deploy a lazy ERC-721 collection.'),
  sdkTool('write', 'rare.collection.deploy.lazyBatchMint', 'Deploy a lazy batch mint collection.'),
  sdkTool('write', 'rare.collection.erc1155.createToken', 'Create an ERC1155 token type.'),
  sdkTool('write', 'rare.collection.erc1155.mint', 'Mint ERC1155 token quantity.'),
  sdkTool('write', 'rare.collection.erc1155.mintBatch', 'Mint ERC1155 token quantities.'),
  sdkTool('write', 'rare.collection.erc1155.setMinterApproval', 'Set ERC1155 minter approval.'),
  sdkTool('write', 'rare.collection.erc1155.updateTokenUri', 'Update ERC1155 token URI.'),
  sdkTool('write', 'rare.collection.erc1155.disable', 'Disable an ERC1155 collection.'),
  sdkTool('read', 'rare.collection.erc1155.status', 'Read ERC1155 collection status.'),
  sdkTool('write', 'rare.collection.mint', 'Mint a single collection token.'),
  sdkTool('write', 'rare.collection.mintBatch', 'Mint a batch of collection tokens.'),
  sdkTool('write', 'rare.collection.prepareLazyMint', 'Prepare lazy mint metadata.'),
  sdkTool('read', 'rare.collection.getTokenCreator', 'Read a collection token creator.'),
  sdkTool('read', 'rare.collection.royalty.status', 'Read collection royalty information.'),
  sdkTool('read', 'rare.collection.metadata.status', 'Read collection metadata configuration.'),
  sdkTool('write', 'rare.collection.setDefaultRoyaltyReceiver', 'Set collection default royalty receiver.'),
  sdkTool('write', 'rare.collection.setDefaultRoyaltyPercentage', 'Set collection default royalty percentage.'),
  sdkTool('write', 'rare.collection.setTokenRoyaltyReceiver', 'Set collection token royalty receiver.'),
  sdkTool('write', 'rare.collection.updateBaseUri', 'Update collection base URI.'),
  sdkTool('write', 'rare.collection.updateTokenUri', 'Update collection token URI.'),
  sdkTool('write', 'rare.collection.lockBaseUri', 'Lock collection base URI.'),
  sdkTool('write', 'rare.ipfs.pinFile', 'Upload and pin an arbitrary local file path to IPFS.'),
  sdkTool('write', 'rare.ipfs.pinJson', 'Upload and pin JSON data to IPFS.'),
  sdkTool('read', 'rare.user.get', 'Get a SuperRare user profile by wallet address. Use a valid EVM 0x address. If you only have an artist, collector, or display name, first call search_nfts with that name in query, inspect creator/owner addresses in structuredContent, then call user_get with the selected address.'),
  sdkTool('write', 'rare.media.upload', 'Upload media from an explicit local file path.'),
  sdkTool('write', 'rare.media.pinMetadata', 'Pin NFT metadata.'),
  sdkTool('write', 'rare.import.erc721', 'Import an existing ERC-721 collection.'),
  sdkTool('read', 'rare.token.status', 'Read token contract and optional token status.'),
  sdkTool('read', 'rare.token.getPrice', 'Get token price metadata by symbol.'),
  sdkTool('read', 'rare.currency.list', 'List supported currencies for a chain.'),
  sdkTool('read', 'rare.currency.resolve', 'Resolve a currency alias or address.'),
  sdkTool('read', 'rare.currency.resolveDecimals', 'Resolve a currency alias or address with decimals.'),
] as const satisfies readonly McpToolSpec[];

export const mcpReadToolNames = mcpToolSpecs
  .filter((tool) => tool.access === 'read')
  .map((tool) => tool.name);

export const mcpWriteToolNames = mcpToolSpecs
  .filter((tool) => tool.access === 'write')
  .map((tool) => tool.name);

export const mcpToolNames = mcpToolSpecs.map((tool) => tool.name);

export type McpConfigSummary = {
  defaultChain: SupportedChain;
  chains: Partial<Record<SupportedChain, {
    hasPrivateKey: boolean;
    privateKey?: string;
    privateKeyRef?: string;
    accountAddress?: string;
    walletAddress?: string;
    rpcUrl?: string;
    hasUniswapApiKey: boolean;
    uniswapApiKey?: string;
    uniswapApiKeyRef?: string;
  }>>;
};

export function selectMcpToolNames(opts: { allowWrites: boolean }): string[] {
  return opts.allowWrites
    ? [...mcpReadToolNames, ...mcpWriteToolNames]
    : [...mcpReadToolNames];
}

export function shapeMcpToolAnnotations(access: McpToolAccess): McpToolAnnotations {
  return {
    readOnlyHint: access === 'read',
    destructiveHint: access === 'write' ? true : undefined,
    openWorldHint: true,
  };
}

export function sdkPathToMcpToolName(sdkPath: string): string {
  const path = sdkPath.startsWith('rare.') ? sdkPath.slice('rare.'.length) : sdkPath;
  return path
    .split('.')
    .map(camelToSnake)
    .join('_');
}

export function resolveMcpChain(config: Config, chain?: string): SupportedChain {
  const candidate = chain ?? config.defaultChain ?? 'sepolia';
  if (!isSupportedChainName(candidate)) {
    throw new Error(`Unsupported chain "${candidate}". Supported chains: ${supportedChains.join(', ')}`);
  }
  return candidate;
}

export function shapeMcpConfigSummary(config: Config): McpConfigSummary {
  return {
    defaultChain: config.defaultChain ?? 'sepolia',
    chains: Object.fromEntries(
      supportedChains.flatMap((chain) => {
        const chainConfig = config.chains[chain];
        if (chainConfig === undefined) return [];
        const plaintextWalletAddress = chainConfig.privateKey === undefined
          ? undefined
          : privateKeyToAccount(chainConfig.privateKey).address;
        const walletAddress = plaintextWalletAddress ?? chainConfig.accountAddress;
        return [[chain, {
          hasPrivateKey: Boolean(chainConfig.privateKey ?? chainConfig.privateKeyRef),
          privateKey: chainConfig.privateKey === undefined ? undefined : maskSecret(chainConfig.privateKey),
          privateKeyRef: chainConfig.privateKeyRef,
          accountAddress: chainConfig.accountAddress,
          walletAddress,
          rpcUrl: chainConfig.rpcUrl,
          hasUniswapApiKey: Boolean(chainConfig.uniswapApiKey ?? chainConfig.uniswapApiKeyRef),
          uniswapApiKey: chainConfig.uniswapApiKey === undefined ? undefined : maskSecret(chainConfig.uniswapApiKey),
          uniswapApiKeyRef: chainConfig.uniswapApiKeyRef,
        }]];
      }),
    ),
  };
}

export function serializeForMcp(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeForMcp);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, nested]) => [key, serializeForMcp(nested)] as const)
        .filter(([, nested]) => nested !== undefined),
    );
  }
  return value;
}

export function shapeMcpTransactionResult(value: unknown, extra: Record<string, unknown> = {}): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const { receipt, ...shaped } = value;
  if (isRecord(receipt) && Object.prototype.hasOwnProperty.call(receipt, 'blockNumber')) {
    return { ...shaped, blockNumber: receipt.blockNumber, ...extra };
  }

  return { ...shaped, ...extra };
}

export function maskSecret(value: string): string {
  return value.length <= 10 ? '***' : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function camelToSnake(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function isSupportedChainName(value: string): value is SupportedChain {
  return supportedChains.some((chain) => chain === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
