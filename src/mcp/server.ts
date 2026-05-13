import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createPublicClient, createWalletClient, http, isAddress, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';
import { readConfig } from '../config.js';
import {
  chainIds,
  currencyNames,
  defaultRpcUrls,
  resolveCurrency,
  viemChains,
  type SupportedChain,
} from '../contracts/addresses.js';
import { createRareClient } from '../sdk/client.js';
import {
  resolveMcpChain,
  selectMcpToolNames,
  serializeForMcp,
  shapeMcpConfigSummary,
  type McpToolName,
  type McpWriteToolName,
} from '../sdk/mcp-core.js';

type McpServeOptions = {
  allowWrites?: boolean;
};

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

const chainSchema = z.enum(['mainnet', 'sepolia', 'base', 'base-sepolia']);
const optionalChain = { chain: chainSchema.optional() };
const addressSchema = z.string().refine(isAddress, 'must be a valid 0x address');
const currencySchema = z.string().optional();
const tokenIdSchema = z.union([z.string(), z.number()]);
const amountSchema = z.union([z.string(), z.number()]);
const tagsSchema = z.array(z.string()).optional();
const attributesSchema = z.array(z.object({
  trait_type: z.string().optional(),
  value: z.union([z.string(), z.number()]),
  display_type: z.enum(['number', 'boost_number', 'boost_percentage', 'date']).optional(),
  max_value: z.number().optional(),
})).optional();

export async function serveMcp(opts: McpServeOptions = {}): Promise<void> {
  const server = createRareMcpServer(opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function createRareMcpServer(opts: McpServeOptions = {}): McpServer {
  const allowWrites = opts.allowWrites ?? false;
  const server = new McpServer({
    name: '@rareprotocol/rare-cli',
    version: '1.0.0',
  });

  for (const toolName of selectMcpToolNames({ allowWrites })) {
    registerToolByName(server, toolName);
  }

  return server;
}

function registerToolByName(server: McpServer, name: McpToolName): void {
  switch (name) {
    case 'config_summary':
      server.registerTool(name, {
        description: 'Return masked RARE CLI config without exposing private keys.',
        inputSchema: {},
        annotations: { readOnlyHint: true },
      }, async () => toolResult(shapeMcpConfigSummary(readConfig())));
      return;
    case 'wallet_address':
      server.registerTool(name, {
        description: 'Return the configured wallet address for a chain without creating a wallet.',
        inputSchema: optionalChain,
        annotations: { readOnlyHint: true },
      }, async ({ chain }) => {
        const selected = resolveChain(chain);
        const privateKey = readConfig().chains[selected]?.privateKey;
        return toolResult({
          chain: selected,
          configured: Boolean(privateKey),
          address: privateKey ? privateKeyToAccount(privateKey as `0x${string}`).address : null,
        });
      });
      return;
    case 'currencies':
      server.registerTool(name, {
        description: 'List supported currency names and their resolved addresses for a chain.',
        inputSchema: optionalChain,
        annotations: { readOnlyHint: true },
      }, async ({ chain }) => {
        const selected = resolveChain(chain);
        return toolResult({
          chain: selected,
          currencies: Object.fromEntries(currencyNames.map((currency) => [
            currency,
            resolveCurrency(currency, selected),
          ])),
        });
      });
      return;
    case 'search_nfts':
      server.registerTool(name, {
        description: 'Search NFTs through the RARE API.',
        inputSchema: {
          query: z.string().optional(),
          page: z.number().int().positive().optional(),
          perPage: z.number().int().positive().optional(),
          sortBy: z.enum(['newest', 'oldest', 'priceAsc', 'priceDesc', 'recentlySold', 'auctionEndingSoon', 'recentActivity', 'bidAsc', 'bidDesc']).optional(),
          ownerAddress: z.string().optional(),
          creatorAddress: z.string().optional(),
          contractAddress: z.string().optional(),
          collectionId: z.string().optional(),
          chainId: z.number().int().positive().optional(),
          hasAuction: z.boolean().optional(),
          auctionState: z.enum(['PENDING', 'RUNNING', 'UNSETTLED']).optional(),
          hasListing: z.boolean().optional(),
          hasOffer: z.boolean().optional(),
          tags: z.array(z.string()).optional(),
          mediaType: z.enum(['IMAGE', 'VIDEO', 'GIF', '3D', 'HTML', 'AUDIO']).optional(),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      }, async (args) => toolResult(await readRare().search.nfts(args)));
      return;
    case 'search_collections':
    case 'list_collections':
      server.registerTool(name, {
        description: name === 'list_collections' ? 'List collections through the RARE API.' : 'Search collections through the RARE API.',
        inputSchema: {
          query: z.string().optional(),
          page: z.number().int().positive().optional(),
          perPage: z.number().int().positive().optional(),
          sortBy: z.enum(['newest', 'oldest']).optional(),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      }, async (args) => toolResult(await readRare().search.collections(args)));
      return;
    case 'get_nft':
      server.registerTool(name, {
        description: 'Get an NFT by universal token ID.',
        inputSchema: { universalTokenId: z.string() },
        annotations: { readOnlyHint: true, openWorldHint: true },
      }, async ({ universalTokenId }) => toolResult(await readRare().nft.get(universalTokenId)));
      return;
    case 'get_collection':
      server.registerTool(name, {
        description: 'Get a collection by ID.',
        inputSchema: { id: z.string() },
        annotations: { readOnlyHint: true, openWorldHint: true },
      }, async ({ id }) => toolResult(await readRare().collection.get(id)));
      return;
    case 'get_user':
      server.registerTool(name, {
        description: 'Get a SuperRare user profile by address.',
        inputSchema: { address: z.string() },
        annotations: { readOnlyHint: true, openWorldHint: true },
      }, async ({ address }) => toolResult(await readRare().user.get(address)));
      return;
    case 'get_nft_events':
      server.registerTool(name, {
        description: 'Get NFT events by universal token ID.',
        inputSchema: {
          universalTokenId: z.string(),
          page: z.number().int().positive().optional(),
          perPage: z.number().int().positive().optional(),
          eventType: z.union([z.string(), z.array(z.string())]).optional(),
          sortBy: z.enum(['newest', 'oldest']).optional(),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      }, async ({ universalTokenId, ...args }) => toolResult(await readRare().nft.events(universalTokenId, args)));
      return;
    case 'get_collection_events':
      server.registerTool(name, {
        description: 'Get collection events by collection ID.',
        inputSchema: {
          id: z.string(),
          page: z.number().int().positive().optional(),
          perPage: z.number().int().positive().optional(),
          eventType: z.union([z.string(), z.array(z.string())]).optional(),
          sortBy: z.enum(['newest', 'oldest']).optional(),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      }, async ({ id, ...args }) => toolResult(await readRare().collection.events(id, args)));
      return;
    case 'token_contract_status':
      server.registerTool(name, {
        description: 'Read ERC-721 contract name, symbol, and total supply.',
        inputSchema: { ...optionalChain, contract: addressSchema },
        annotations: { readOnlyHint: true, openWorldHint: true },
      }, async ({ chain, contract }) => toolResult(await rareForChain(chain).token.getContractInfo({ contract: contract as Address })));
      return;
    case 'token_status':
      server.registerTool(name, {
        description: 'Read ERC-721 token owner and token URI.',
        inputSchema: { ...optionalChain, contract: addressSchema, tokenId: tokenIdSchema },
        annotations: { readOnlyHint: true, openWorldHint: true },
      }, async ({ chain, contract, tokenId }) => toolResult(await rareForChain(chain).token.getTokenInfo({ contract: contract as Address, tokenId })));
      return;
    case 'token_price':
      server.registerTool(name, {
        description: 'Get token price metadata by symbol.',
        inputSchema: { symbol: z.string() },
        annotations: { readOnlyHint: true, openWorldHint: true },
      }, async ({ symbol }) => toolResult(await readRare().token.getPrice(symbol)));
      return;
    case 'auction_status':
      server.registerTool(name, {
        description: 'Read Bazaar auction status for a token.',
        inputSchema: { ...optionalChain, contract: addressSchema, tokenId: tokenIdSchema },
        annotations: { readOnlyHint: true, openWorldHint: true },
      }, async ({ chain, contract, tokenId }) => toolResult(await rareForChain(chain).auction.getStatus({ contract: contract as Address, tokenId })));
      return;
    case 'offer_status':
      server.registerTool(name, {
        description: 'Read Bazaar offer status for a token.',
        inputSchema: { ...optionalChain, contract: addressSchema, tokenId: tokenIdSchema, currency: currencySchema },
        annotations: { readOnlyHint: true, openWorldHint: true },
      }, async ({ chain, contract, tokenId, currency }) => {
        const selected = resolveChain(chain);
        return toolResult(await rareForChain(selected).offer.getStatus({
          contract: contract as Address,
          tokenId,
          currency: currency ? resolveCurrency(currency, selected) : undefined,
        }));
      });
      return;
    case 'listing_status':
      server.registerTool(name, {
        description: 'Read Bazaar listing status for a token.',
        inputSchema: { ...optionalChain, contract: addressSchema, tokenId: tokenIdSchema, target: addressSchema.optional() },
        annotations: { readOnlyHint: true, openWorldHint: true },
      }, async ({ chain, contract, tokenId, target }) => toolResult(await rareForChain(chain).listing.getStatus({
        contract: contract as Address,
        tokenId,
        target: target as Address | undefined,
      })));
      return;
    default:
      registerWriteTool(server, name);
  }
}

function registerWriteTool(server: McpServer, name: McpWriteToolName): void {
  const writeAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };
  switch (name) {
    case 'deploy_erc721':
      server.registerTool(name, {
        description: 'Deploy an ERC-721 contract through the configured RARE factory.',
        inputSchema: { ...optionalChain, name: z.string(), symbol: z.string(), maxTokens: tokenIdSchema.optional() },
        annotations: writeAnnotations,
      }, async (args) => withToolErrors(async () => toolResult(shapeTransactionResult(await writeRare(args.chain).deploy.erc721(args)))));
      return;
    case 'import_erc721':
      server.registerTool(name, {
        description: 'Import an existing ERC-721 collection through the RARE API.',
        inputSchema: { ...optionalChain, contract: addressSchema, owner: addressSchema.optional() },
        annotations: writeAnnotations,
      }, async ({ chain, contract, owner }) => withToolErrors(async () => {
        await writeRare(chain).import.erc721({ contract: contract as Address, owner: owner as Address | undefined });
        return toolResult({ imported: true, contract, owner: owner ?? null });
      }));
      return;
    case 'upload_media':
      server.registerTool(name, {
        description: 'Upload media from an explicit local file path.',
        inputSchema: { path: z.string(), filename: z.string().optional() },
        annotations: writeAnnotations,
      }, async ({ path, filename }) => withToolErrors(async () => {
        const buffer = await readFile(path);
        return toolResult(await readRare().media.upload(new Uint8Array(buffer), filename ?? basename(path)));
      }));
      return;
    case 'pin_metadata':
      server.registerTool(name, {
        description: 'Pin NFT metadata from already uploaded media entries.',
        inputSchema: {
          name: z.string(),
          description: z.string(),
          image: mediaEntrySchema(),
          video: mediaEntrySchema().optional(),
          tags: tagsSchema,
          attributes: attributesSchema,
        },
        annotations: writeAnnotations,
      }, async (args) => withToolErrors(async () => toolResult({ tokenUri: await readRare().media.pinMetadata(args) })));
      return;
    case 'mint':
      server.registerTool(name, {
        description: 'Mint an NFT to a deployed token contract using a token URI.',
        inputSchema: {
          ...optionalChain,
          contract: addressSchema,
          tokenUri: z.string(),
          to: addressSchema.optional(),
          royaltyReceiver: addressSchema.optional(),
        },
        annotations: writeAnnotations,
      }, async ({ chain, contract, tokenUri, to, royaltyReceiver }) => withToolErrors(async () => {
        const result = await writeRare(chain).mint.mintTo({
          contract: contract as Address,
          tokenUri,
          to: to as Address | undefined,
          royaltyReceiver: royaltyReceiver as Address | undefined,
        });
        return toolResult(shapeTransactionResult(result, { contract, tokenUri }));
      }));
      return;
    case 'auction_create':
      server.registerTool(name, {
        description: 'Create a Bazaar auction for a token.',
        inputSchema: {
          ...optionalChain,
          contract: addressSchema,
          tokenId: tokenIdSchema,
          startingPrice: amountSchema,
          duration: tokenIdSchema,
          currency: currencySchema,
          auctionType: z.enum(['reserve', 'scheduled']).optional(),
          startTime: tokenIdSchema.optional(),
        },
        annotations: writeAnnotations,
      }, async ({ chain, currency, contract, ...args }) => withToolErrors(async () => {
        const selected = resolveChain(chain);
        return toolResult(shapeTransactionResult(await writeRare(selected).auction.create({
          contract: contract as Address,
          ...args,
          currency: currency ? resolveCurrency(currency, selected) : undefined,
        })));
      }));
      return;
    case 'auction_bid':
      server.registerTool(name, {
        description: 'Bid on a Bazaar auction.',
        inputSchema: { ...optionalChain, contract: addressSchema, tokenId: tokenIdSchema, amount: amountSchema, currency: currencySchema },
        annotations: writeAnnotations,
      }, async ({ chain, contract, tokenId, amount, currency }) => withToolErrors(async () => {
        const selected = resolveChain(chain);
        return toolResult(shapeTransactionResult(await writeRare(selected).auction.bid({
          contract: contract as Address,
          tokenId,
          amount,
          currency: currency ? resolveCurrency(currency, selected) : undefined,
        })));
      }));
      return;
    case 'auction_settle':
    case 'auction_cancel':
      server.registerTool(name, {
        description: name === 'auction_settle' ? 'Settle a Bazaar auction.' : 'Cancel a Bazaar auction.',
        inputSchema: { ...optionalChain, contract: addressSchema, tokenId: tokenIdSchema },
        annotations: writeAnnotations,
      }, async ({ chain, contract, tokenId }) => withToolErrors(async () => {
        const rare = writeRare(chain);
        const params = { contract: contract as Address, tokenId };
        return toolResult(shapeTransactionResult(name === 'auction_settle'
          ? await rare.auction.settle(params)
          : await rare.auction.cancel(params)));
      }));
      return;
    case 'offer_create':
      server.registerTool(name, {
        description: 'Create a Bazaar offer for a token.',
        inputSchema: { ...optionalChain, contract: addressSchema, tokenId: tokenIdSchema, amount: amountSchema, currency: currencySchema, convertible: z.boolean().optional() },
        annotations: writeAnnotations,
      }, async ({ chain, contract, tokenId, amount, currency, convertible }) => withToolErrors(async () => {
        const selected = resolveChain(chain);
        return toolResult(shapeTransactionResult(await writeRare(selected).offer.create({
          contract: contract as Address,
          tokenId,
          amount,
          currency: currency ? resolveCurrency(currency, selected) : undefined,
          convertible,
        })));
      }));
      return;
    case 'offer_cancel':
      server.registerTool(name, {
        description: 'Cancel a Bazaar offer for a token.',
        inputSchema: { ...optionalChain, contract: addressSchema, tokenId: tokenIdSchema, currency: currencySchema },
        annotations: writeAnnotations,
      }, async ({ chain, contract, tokenId, currency }) => withToolErrors(async () => {
        const selected = resolveChain(chain);
        return toolResult(shapeTransactionResult(await writeRare(selected).offer.cancel({
          contract: contract as Address,
          tokenId,
          currency: currency ? resolveCurrency(currency, selected) : undefined,
        })));
      }));
      return;
    case 'offer_accept':
      server.registerTool(name, {
        description: 'Accept a Bazaar offer for a token.',
        inputSchema: { ...optionalChain, contract: addressSchema, tokenId: tokenIdSchema, amount: amountSchema, currency: currencySchema },
        annotations: writeAnnotations,
      }, async ({ chain, contract, tokenId, amount, currency }) => withToolErrors(async () => {
        const selected = resolveChain(chain);
        return toolResult(shapeTransactionResult(await writeRare(selected).offer.accept({
          contract: contract as Address,
          tokenId,
          amount,
          currency: currency ? resolveCurrency(currency, selected) : undefined,
        })));
      }));
      return;
    case 'listing_create':
      server.registerTool(name, {
        description: 'Create a Bazaar listing for a token.',
        inputSchema: { ...optionalChain, contract: addressSchema, tokenId: tokenIdSchema, price: amountSchema, currency: currencySchema, target: addressSchema.optional() },
        annotations: writeAnnotations,
      }, async ({ chain, contract, tokenId, price, currency, target }) => withToolErrors(async () => {
        const selected = resolveChain(chain);
        return toolResult(shapeTransactionResult(await writeRare(selected).listing.create({
          contract: contract as Address,
          tokenId,
          price,
          currency: currency ? resolveCurrency(currency, selected) : undefined,
          target: target as Address | undefined,
        })));
      }));
      return;
    case 'listing_cancel':
      server.registerTool(name, {
        description: 'Cancel a Bazaar listing for a token.',
        inputSchema: { ...optionalChain, contract: addressSchema, tokenId: tokenIdSchema, target: addressSchema.optional() },
        annotations: writeAnnotations,
      }, async ({ chain, contract, tokenId, target }) => withToolErrors(async () => toolResult(shapeTransactionResult(await writeRare(chain).listing.cancel({
        contract: contract as Address,
        tokenId,
        target: target as Address | undefined,
      })))));
      return;
    case 'listing_buy':
      server.registerTool(name, {
        description: 'Buy a Bazaar listing for a token.',
        inputSchema: { ...optionalChain, contract: addressSchema, tokenId: tokenIdSchema, amount: amountSchema, currency: currencySchema },
        annotations: writeAnnotations,
      }, async ({ chain, contract, tokenId, amount, currency }) => withToolErrors(async () => {
        const selected = resolveChain(chain);
        return toolResult(shapeTransactionResult(await writeRare(selected).listing.buy({
          contract: contract as Address,
          tokenId,
          amount,
          currency: currency ? resolveCurrency(currency, selected) : undefined,
        })));
      }));
      return;
  }
}

function mediaEntrySchema() {
  return z.object({
    url: z.string(),
    mimeType: z.string(),
    size: z.number().int().nonnegative(),
    dimensions: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }).optional(),
  });
}

function readRare() {
  return createRareClient({ publicClient: getPublicClient(resolveChain(undefined)) });
}

function rareForChain(chain?: string | SupportedChain) {
  return createRareClient({ publicClient: getPublicClient(resolveChain(chain)) });
}

function writeRare(chain?: string | SupportedChain) {
  const selected = resolveChain(chain);
  const config = readConfig();
  const privateKey = config.chains[selected]?.privateKey;
  if (!privateKey) {
    throw new McpToolError(
      'missing_wallet',
      `No private key configured for chain "${selected}". Run rare configure or use the CLI wallet setup outside MCP.`,
    );
  }

  const rpcUrl = config.chains[selected]?.rpcUrl ?? defaultRpcUrls[selected];
  if (!rpcUrl) {
    throw new McpToolError(
      'missing_rpc_url',
      `No RPC URL configured for chain "${selected}" and no public default is available.`,
    );
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const publicClient = getPublicClient(selected);
  const walletClient = createWalletClient({
    chain: viemChains[selected],
    transport: http(rpcUrl),
    account,
  });

  return createRareClient({ publicClient, walletClient });
}

function getPublicClient(chain: SupportedChain) {
  const config = readConfig();
  const rpcUrl = config.chains[chain]?.rpcUrl ?? defaultRpcUrls[chain];
  if (!rpcUrl) {
    throw new McpToolError(
      'missing_rpc_url',
      `No RPC URL configured for chain "${chain}" and no public default is available.`,
    );
  }

  return createPublicClient({
    chain: viemChains[chain],
    transport: http(rpcUrl),
  });
}

function resolveChain(chain: string | undefined): SupportedChain {
  return resolveMcpChain(readConfig(), chain);
}

async function withToolErrors(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (error) {
    return toolError(error);
  }
}

function toolResult(value: unknown): ToolResult {
  const structured = serializeForMcp(value) as Record<string, unknown>;
  return {
    content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}

function toolError(error: unknown): ToolResult {
  const code = error instanceof McpToolError ? error.code : 'tool_error';
  const message = error instanceof Error ? error.message : String(error);
  const structured = { error: { code, message } };
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}

function shapeTransactionResult(value: unknown, extra: Record<string, unknown> = {}): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  const shaped = { ...record };
  const receipt = shaped.receipt;
  delete shaped.receipt;
  if (receipt && typeof receipt === 'object' && 'blockNumber' in receipt) {
    shaped.blockNumber = (receipt as { blockNumber: unknown }).blockNumber;
  }

  return { ...shaped, ...extra };
}

class McpToolError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'McpToolError';
  }
}
