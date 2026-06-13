/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/promise-function-async, local/only-parse-unknown, no-restricted-syntax */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { isAddress, isHex, type Address } from 'viem';
import { z } from 'zod';
import pkg from '../../package.json' with { type: 'json' };
import { getConfiguredAccountAddress, getConfiguredUniswapApiKey, getPublicClient, tryGetWalletClient } from '../client.js';
import { getChainConfig, readConfig } from '../config.js';
import { supportedChains, type SupportedChain } from '../contracts/addresses.js';
import { createRareClient } from '../sdk/client.js';
import {
  mcpToolSpecs,
  selectMcpToolNames,
  serializeForMcp,
  shapeMcpConfigSummary,
  shapeMcpToolAnnotations,
  shapeMcpTransactionResult,
  type McpToolSpec,
} from './core.js';

type McpServeOptions = {
  allowWrites?: boolean;
};

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

type ToolHandler = {
  inputSchema: z.ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<ToolResult> | ToolResult;
};

const chainSchema = z.enum(supportedChains);
const optionalChain = { chain: chainSchema.optional() };
const addressSchema = z.string().refine(isAddress, 'must be a valid 0x address');
const hexSchema = z.string().refine(isHex, 'must be a hex string');
const integerSchema = z.union([z.string(), z.number()]);
const amountSchema = z.union([z.string(), z.number()]);
const timestampSchema = z.union([z.string(), z.number()]);
const currencySchema = z.union([z.string(), addressSchema]).optional();
const artifactSchema = z.record(z.string(), z.unknown());
const proofSchema = z.array(hexSchema);
const splitSchema = {
  splitAddresses: z.array(addressSchema).optional(),
  splitRatios: z.array(z.number()).optional(),
};
const autoApproveSchema = { autoApprove: z.boolean().optional() };
const contractTokenSchema = {
  contract: addressSchema,
  tokenId: integerSchema,
};
const erc1155MintItemSchema = z.object({
  tokenId: integerSchema,
  quantity: integerSchema,
});
const erc1155ListingCreateBatchItemSchema = z.object({
  tokenId: integerSchema,
  quantity: integerSchema,
  price: amountSchema,
  expirationTime: timestampSchema.optional(),
});
const erc1155ReleaseConfigureBatchItemSchema = z.object({
  tokenId: integerSchema,
  price: amountSchema,
  startTime: timestampSchema.optional(),
  maxMints: integerSchema,
});
const erc1155ReleaseAllowlistConfigBatchItemSchema = z.object({
  tokenId: integerSchema,
  root: hexSchema.optional(),
  artifact: artifactSchema.optional(),
  endTime: timestampSchema,
});
const erc1155ReleaseLimitBatchItemSchema = z.object({
  tokenId: integerSchema,
  limit: integerSchema,
});
const checkoutProofSchema = z.union([proofSchema, z.object({ proof: proofSchema }).passthrough()]);
const erc1155CheckoutReleaseItemSchema = z.object({
  kind: z.literal('release'),
  contract: addressSchema,
  tokenId: integerSchema,
  quantity: integerSchema,
  price: amountSchema.optional(),
  currency: currencySchema,
  proof: checkoutProofSchema.optional(),
});
const erc1155CheckoutListingItemSchema = z.object({
  kind: z.literal('listing'),
  contract: addressSchema,
  seller: addressSchema,
  tokenId: integerSchema,
  quantity: integerSchema,
  price: amountSchema,
  currency: currencySchema,
});
const erc1155CheckoutItemSchema = z.discriminatedUnion('kind', [
  erc1155CheckoutReleaseItemSchema,
  erc1155CheckoutListingItemSchema,
]);
const mediaEntrySchema = z.object({
  url: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  dimensions: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).optional(),
});
const attributesSchema = z.array(z.object({
  trait_type: z.string().optional(),
  value: z.union([z.string(), z.number()]),
  display_type: z.enum(['number', 'boost_number', 'boost_percentage', 'date']).optional(),
  max_value: z.number().optional(),
})).optional();
const pinMetadataSchema = {
  name: z.string(),
  description: z.string(),
  image: mediaEntrySchema,
  video: mediaEntrySchema.optional(),
  tags: z.array(z.string()).optional(),
  attributes: attributesSchema,
};
const rawRouteSchema = {
  minAmountOut: amountSchema,
  commands: hexSchema,
  inputs: z.array(hexSchema),
};

export const rareMcpServerMetadata = {
  name: pkg.name,
  version: pkg.version,
} as const;

export async function serveMcp(opts: McpServeOptions = {}): Promise<void> {
  const server = createRareMcpServer(opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function createRareMcpServer(opts: McpServeOptions = {}): McpServer {
  const server = new McpServer(rareMcpServerMetadata);
  const enabledNames = new Set(selectMcpToolNames({ allowWrites: opts.allowWrites ?? false }));

  for (const spec of mcpToolSpecs) {
    if (!enabledNames.has(spec.name)) continue;
    registerTool(server, spec);
  }

  return server;
}

function registerTool(server: McpServer, spec: McpToolSpec): void {
  const tool = toolHandlers[spec.name];
  if (!tool) {
    throw new Error(`unreachable: missing MCP handler for ${spec.name}`);
  }

  server.registerTool(spec.name, {
    description: spec.description,
    inputSchema: tool.inputSchema,
    annotations: shapeMcpToolAnnotations(spec.access),
  }, async (args) => withToolErrors(async () => tool.handler(args)));
}

const toolHandlers: Record<string, ToolHandler> = {
  config_summary: {
    inputSchema: {},
    handler: () => toolResult(shapeMcpConfigSummary(readConfig())),
  },
  wallet_address: {
    inputSchema: optionalChain,
    handler: ({ chain }) => {
      const selected = resolveChain(chain);
      return toolResult({
        chain: selected,
        configured: getConfiguredAccountAddress(selected) !== undefined,
        address: getConfiguredAccountAddress(selected) ?? null,
      });
    },
  },
  client_metadata: {
    inputSchema: optionalChain,
    handler: ({ chain }) => {
      const rare = readRare(chain);
      return toolResult({ chain: rare.chain, chainId: rare.chainId });
    },
  },
  contracts_summary: {
    inputSchema: optionalChain,
    handler: ({ chain }) => toolResult(readRare(chain).contracts),
  },
  liquid_edition_get_factory_config: {
    inputSchema: optionalChain,
    handler: ({ chain }) => callRead(chain, (rare) => rare.liquidEdition.getFactoryConfig()),
  },
  liquid_edition_generate_preset_curves: {
    inputSchema: { ...optionalChain, preset: z.string(), totalSupply: amountSchema.optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.liquidEdition.generatePresetCurves(args as never)),
  },
  liquid_edition_validate_curves: {
    inputSchema: { ...optionalChain, curves: z.array(artifactSchema), totalSupply: amountSchema.optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.liquidEdition.validateCurves(args as never)),
  },
  liquid_edition_deploy_multi_curve: {
    inputSchema: {
      ...optionalChain,
      name: z.string(),
      symbol: z.string(),
      tokenUri: z.string(),
      initialRareLiquidity: amountSchema.optional(),
      totalSupply: amountSchema.optional(),
      curves: z.array(artifactSchema),
    },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) =>
      txResult(await rare.liquidEdition.deploy.multiCurve(args as never))),
  },
  liquid_edition_get_token_uri: {
    inputSchema: { ...optionalChain, contract: addressSchema },
    handler: ({ chain, contract }) => callRead(chain, (rare) => rare.liquidEdition.getTokenUri({ contract: contract as Address })),
  },
  liquid_edition_get_render_contract: {
    inputSchema: { ...optionalChain, contract: addressSchema },
    handler: ({ chain, contract }) => callRead(chain, (rare) => rare.liquidEdition.getRenderContract({ contract: contract as Address })),
  },
  liquid_edition_set_render_contract: {
    inputSchema: { ...optionalChain, contract: addressSchema, renderContract: addressSchema },
    handler: ({ chain, contract, renderContract }) => callWrite(chain, async (rare) =>
      txResult(await rare.liquidEdition.setRenderContract({
        contract: contract as Address,
        renderContract: renderContract as Address,
      }))),
  },
  liquid_edition_get_pool_info: {
    inputSchema: { ...optionalChain, contract: addressSchema },
    handler: ({ chain, contract }) => callRead(chain, (rare) => rare.liquidEdition.getPoolInfo({ contract: contract as Address })),
  },
  liquid_edition_get_market_state: {
    inputSchema: { ...optionalChain, contract: addressSchema },
    handler: ({ chain, contract }) => callRead(chain, (rare) => rare.liquidEdition.getMarketState({ contract: contract as Address })),
  },
  liquid_edition_get_current_price: {
    inputSchema: { ...optionalChain, contract: addressSchema },
    handler: ({ chain, contract }) => callRead(chain, (rare) => rare.liquidEdition.getCurrentPrice({ contract: contract as Address })),
  },
  liquid_edition_status: {
    inputSchema: { ...optionalChain, contract: addressSchema },
    handler: ({ chain, contract }) => callRead(chain, (rare) => rare.liquidEdition.status({ contract: contract as Address })),
  },
  swap_buy: {
    inputSchema: { ...optionalChain, token: addressSchema, amountIn: amountSchema, ...rawRouteSchema, recipient: addressSchema.optional(), deadline: integerSchema.optional() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.swap.buy(args as never))),
  },
  swap_sell: {
    inputSchema: { ...optionalChain, token: addressSchema, amountIn: amountSchema, ...rawRouteSchema, recipient: addressSchema.optional(), deadline: integerSchema.optional() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.swap.sell(args as never))),
  },
  swap_swap_tokens: {
    inputSchema: { ...optionalChain, tokenIn: addressSchema, tokenOut: addressSchema, amountIn: amountSchema, ...rawRouteSchema, recipient: addressSchema.optional(), deadline: integerSchema.optional() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.swap.swapTokens(args as never))),
  },
  bridge_quote: {
    inputSchema: { ...optionalChain, amount: amountSchema, destinationChain: chainSchema, recipient: addressSchema.optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.bridge.quote(args as never)),
  },
  bridge_send: {
    inputSchema: { ...optionalChain, amount: amountSchema, destinationChain: chainSchema, recipient: addressSchema.optional(), ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.bridge.send(args as never))),
  },
  swap_quote_buy_token: {
    inputSchema: { ...optionalChain, token: addressSchema, amountIn: amountSchema, minAmountOut: amountSchema.optional(), slippageBps: integerSchema.optional(), recipient: addressSchema.optional(), deadline: integerSchema.optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.swap.quoteBuyToken(args as never)),
  },
  swap_buy_token: {
    inputSchema: { ...optionalChain, token: addressSchema, amountIn: amountSchema, minAmountOut: amountSchema.optional(), slippageBps: integerSchema.optional(), recipient: addressSchema.optional(), deadline: integerSchema.optional(), route: z.enum(['auto', 'local', 'uniswap', 'raw']).optional(), commands: hexSchema.optional(), inputs: z.array(hexSchema).optional() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.swap.buyToken(args as never))),
  },
  swap_quote_sell_token: {
    inputSchema: { ...optionalChain, token: addressSchema, amountIn: amountSchema, minAmountOut: amountSchema.optional(), slippageBps: integerSchema.optional(), recipient: addressSchema.optional(), deadline: integerSchema.optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.swap.quoteSellToken(args as never)),
  },
  swap_sell_token: {
    inputSchema: { ...optionalChain, token: addressSchema, amountIn: amountSchema, minAmountOut: amountSchema.optional(), slippageBps: integerSchema.optional(), recipient: addressSchema.optional(), deadline: integerSchema.optional(), route: z.enum(['auto', 'local', 'uniswap', 'raw']).optional(), commands: hexSchema.optional(), inputs: z.array(hexSchema).optional() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.swap.sellToken(args as never))),
  },
  swap_quote_buy_rare: {
    inputSchema: { ...optionalChain, amountIn: amountSchema, minAmountOut: amountSchema.optional(), slippageBps: integerSchema.optional(), recipient: addressSchema.optional(), deadline: integerSchema.optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.swap.quoteBuyRare(args as never)),
  },
  swap_buy_rare: {
    inputSchema: { ...optionalChain, amountIn: amountSchema, minAmountOut: amountSchema.optional(), slippageBps: integerSchema.optional(), recipient: addressSchema.optional(), deadline: integerSchema.optional() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.swap.buyRare(args as never))),
  },
  auction_create: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, price: amountSchema, endTime: timestampSchema, currency: currencySchema, auctionType: z.enum(['reserve', 'scheduled']).optional(), startTime: timestampSchema.optional(), ...splitSchema, ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.auction.create(args as never))),
  },
  auction_bid: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, price: amountSchema, currency: currencySchema, ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.auction.bid(args as never))),
  },
  auction_settle: {
    inputSchema: { ...optionalChain, ...contractTokenSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.auction.settle(args as never))),
  },
  auction_cancel: {
    inputSchema: { ...optionalChain, ...contractTokenSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.auction.cancel(args as never))),
  },
  auction_status: {
    inputSchema: { ...optionalChain, ...contractTokenSchema },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.auction.status(args as never)),
  },
  auction_batch_create: {
    inputSchema: { ...optionalChain, root: hexSchema.optional(), artifact: artifactSchema.optional(), price: amountSchema, currency: currencySchema, endTime: timestampSchema, ...splitSchema, ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.auction.batch.create(args as never))),
  },
  auction_batch_cancel: {
    inputSchema: { ...optionalChain, root: hexSchema.optional(), artifact: artifactSchema.optional() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.auction.batch.cancel(args as never))),
  },
  auction_batch_roots: {
    inputSchema: { ...optionalChain, creator: addressSchema.optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.auction.batch.roots(args)),
  },
  auction_batch_bid: {
    inputSchema: { ...optionalChain, creator: addressSchema, root: hexSchema.optional(), proof: proofSchema.optional(), proofArtifact: artifactSchema.optional(), ...contractTokenSchema, currency: currencySchema, price: amountSchema, ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.auction.batch.bid(args as never))),
  },
  auction_batch_settle: {
    inputSchema: { ...optionalChain, ...contractTokenSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.auction.batch.settle(args as never))),
  },
  auction_batch_status: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, creator: addressSchema.optional(), root: hexSchema.optional(), artifact: artifactSchema.optional(), proof: proofSchema.optional(), proofArtifact: artifactSchema.optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.auction.batch.status(args as never)),
  },
  offer_create: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, price: amountSchema, currency: currencySchema, ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.offer.create(args as never))),
  },
  offer_cancel: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, currency: currencySchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.offer.cancel(args as never))),
  },
  offer_accept: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, price: amountSchema, currency: currencySchema, ...splitSchema, ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.offer.accept(args as never))),
  },
  offer_status: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, currency: currencySchema },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.offer.status(args as never)),
  },
  offer_erc1155_create: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, quantity: integerSchema, price: amountSchema, currency: currencySchema, expirationTime: timestampSchema.optional(), ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.offer.erc1155.create(args as never))),
  },
  offer_erc1155_cancel: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, currency: currencySchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.offer.erc1155.cancel(args as never))),
  },
  offer_erc1155_accept: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, buyer: addressSchema, quantity: integerSchema, price: amountSchema, currency: currencySchema, ...splitSchema, ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.offer.erc1155.accept(args as never))),
  },
  offer_erc1155_status: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, buyer: addressSchema.optional(), currency: currencySchema },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.offer.erc1155.status(args as never)),
  },
  offer_batch_create: {
    inputSchema: { ...optionalChain, root: hexSchema.optional(), artifact: artifactSchema.optional(), price: amountSchema, currency: currencySchema, endTime: timestampSchema, ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.offer.batch.create(args as never))),
  },
  offer_batch_revoke: {
    inputSchema: { ...optionalChain, root: hexSchema.optional(), artifact: artifactSchema.optional(), contract: addressSchema.optional(), tokenId: integerSchema.optional() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.offer.batch.revoke(args as never))),
  },
  offer_batch_accept: {
    inputSchema: { ...optionalChain, creator: addressSchema, root: hexSchema.optional(), proof: proofSchema.optional(), proofArtifact: artifactSchema.optional(), ...contractTokenSchema, ...splitSchema, ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.offer.batch.accept(args as never))),
  },
  offer_batch_status: {
    inputSchema: { ...optionalChain, creator: addressSchema, root: hexSchema.optional(), artifact: artifactSchema.optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.offer.batch.status(args as never)),
  },
  listing_create: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, price: amountSchema, currency: currencySchema, target: addressSchema.optional(), ...splitSchema, ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.create(args as never))),
  },
  listing_cancel: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, target: addressSchema.optional() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.cancel(args as never))),
  },
  listing_buy: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, price: amountSchema, currency: currencySchema, ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.buy(args as never))),
  },
  listing_status: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, target: addressSchema.optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.listing.status(args as never)),
  },
  listing_erc1155_create: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, quantity: integerSchema, price: amountSchema, currency: currencySchema, expirationTime: timestampSchema.optional(), ...splitSchema, ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.erc1155.create(args as never))),
  },
  listing_erc1155_create_batch: {
    inputSchema: { ...optionalChain, contract: addressSchema, currency: currencySchema, items: z.array(erc1155ListingCreateBatchItemSchema), ...splitSchema, ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.erc1155.createBatch(args as never))),
  },
  listing_erc1155_cancel: {
    inputSchema: { ...optionalChain, contract: addressSchema, tokenIds: z.array(integerSchema) },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.erc1155.cancel(args as never))),
  },
  listing_erc1155_buy: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, seller: addressSchema, quantity: integerSchema, price: amountSchema, currency: currencySchema, ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.erc1155.buy(args as never))),
  },
  listing_erc1155_checkout: {
    inputSchema: { ...optionalChain, items: z.array(erc1155CheckoutItemSchema), ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.erc1155.checkout(normalizeMcpCheckoutArgs(args) as never))),
  },
  listing_erc1155_status: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, seller: addressSchema },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.listing.erc1155.status(args as never)),
  },
  listing_erc1155_release_allowlist_build: {
    inputSchema: { ...optionalChain, input: z.string(), format: z.enum(['csv', 'json']) },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.listing.erc1155.release.allowlist.build(args as never)),
  },
  listing_erc1155_release_allowlist_parse: {
    inputSchema: { ...optionalChain, input: z.string() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.listing.erc1155.release.allowlist.parse(args as never)),
  },
  listing_erc1155_release_allowlist_proof: {
    inputSchema: { ...optionalChain, artifact: artifactSchema, address: addressSchema },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.listing.erc1155.release.allowlist.proof(args as never)),
  },
  listing_erc1155_release_allowlist_get_config: {
    inputSchema: { ...optionalChain, ...contractTokenSchema },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.listing.erc1155.release.allowlist.getConfig(args as never)),
  },
  listing_erc1155_release_allowlist_set_config: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, root: hexSchema.optional(), artifact: artifactSchema.optional(), endTime: timestampSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.erc1155.release.allowlist.setConfig(args as never))),
  },
  listing_erc1155_release_allowlist_set_config_batch: {
    inputSchema: { ...optionalChain, contract: addressSchema, items: z.array(erc1155ReleaseAllowlistConfigBatchItemSchema) },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.erc1155.release.allowlist.setConfigBatch(args as never))),
  },
  listing_erc1155_release_allowlist_clear: {
    inputSchema: { ...optionalChain, ...contractTokenSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.erc1155.release.allowlist.clear(args as never))),
  },
  listing_erc1155_release_limits_get_mint: {
    inputSchema: { ...optionalChain, ...contractTokenSchema },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.listing.erc1155.release.limits.getMint(args as never)),
  },
  listing_erc1155_release_limits_set_mint: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, limit: integerSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.erc1155.release.limits.setMint(args as never))),
  },
  listing_erc1155_release_limits_set_mint_batch: {
    inputSchema: { ...optionalChain, contract: addressSchema, items: z.array(erc1155ReleaseLimitBatchItemSchema) },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.erc1155.release.limits.setMintBatch(args as never))),
  },
  listing_erc1155_release_limits_get_tx: {
    inputSchema: { ...optionalChain, ...contractTokenSchema },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.listing.erc1155.release.limits.getTx(args as never)),
  },
  listing_erc1155_release_limits_set_tx: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, limit: integerSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.erc1155.release.limits.setTx(args as never))),
  },
  listing_erc1155_release_limits_set_tx_batch: {
    inputSchema: { ...optionalChain, contract: addressSchema, items: z.array(erc1155ReleaseLimitBatchItemSchema) },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.erc1155.release.limits.setTxBatch(args as never))),
  },
  listing_erc1155_release_configure: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, currency: currencySchema, price: amountSchema, startTime: timestampSchema.optional(), maxMints: integerSchema, ...splitSchema, ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.erc1155.release.configure(args as never))),
  },
  listing_erc1155_release_configure_batch: {
    inputSchema: { ...optionalChain, contract: addressSchema, currency: currencySchema, items: z.array(erc1155ReleaseConfigureBatchItemSchema), ...splitSchema, ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.erc1155.release.configureBatch(args as never))),
  },
  listing_erc1155_release_cancel: {
    inputSchema: { ...optionalChain, contract: addressSchema, tokenIds: z.array(integerSchema) },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.erc1155.release.cancel(args as never))),
  },
  listing_erc1155_release_mint: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, quantity: integerSchema, currency: currencySchema, price: amountSchema.optional(), proof: proofSchema.optional(), ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.erc1155.release.mint(args as never))),
  },
  listing_erc1155_release_status: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, account: addressSchema.optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.listing.erc1155.release.status(args as never)),
  },
  listing_release_allowlist_build: {
    inputSchema: { ...optionalChain, input: z.string(), format: z.enum(['csv', 'json']) },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.listing.release.allowlist.build(args as never)),
  },
  listing_release_allowlist_parse: {
    inputSchema: { ...optionalChain, input: z.string() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.listing.release.allowlist.parse(args as never)),
  },
  listing_release_allowlist_proof: {
    inputSchema: { ...optionalChain, artifact: artifactSchema, address: addressSchema },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.listing.release.allowlist.proof(args as never)),
  },
  listing_release_allowlist_get_config: {
    inputSchema: { ...optionalChain, contract: addressSchema },
    handler: ({ chain, contract }) => callRead(chain, (rare) => rare.listing.release.allowlist.getConfig({ contract: contract as Address })),
  },
  listing_release_allowlist_set_config: {
    inputSchema: { ...optionalChain, contract: addressSchema, root: hexSchema.optional(), artifact: artifactSchema.optional(), endTime: timestampSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.release.allowlist.setConfig(args as never))),
  },
  listing_release_allowlist_clear: {
    inputSchema: { ...optionalChain, contract: addressSchema },
    handler: ({ chain, contract }) => callWrite(chain, async (rare) => txResult(await rare.listing.release.allowlist.clear({ contract: contract as Address }))),
  },
  listing_release_limits_get_mint: {
    inputSchema: { ...optionalChain, contract: addressSchema },
    handler: ({ chain, contract }) => callRead(chain, (rare) => rare.listing.release.limits.getMint({ contract: contract as Address })),
  },
  listing_release_limits_set_mint: {
    inputSchema: { ...optionalChain, contract: addressSchema, limit: integerSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.release.limits.setMint(args as never))),
  },
  listing_release_limits_get_tx: {
    inputSchema: { ...optionalChain, contract: addressSchema },
    handler: ({ chain, contract }) => callRead(chain, (rare) => rare.listing.release.limits.getTx({ contract: contract as Address })),
  },
  listing_release_limits_set_tx: {
    inputSchema: { ...optionalChain, contract: addressSchema, limit: integerSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.release.limits.setTx(args as never))),
  },
  listing_release_configure: {
    inputSchema: { ...optionalChain, contract: addressSchema, currency: currencySchema, price: amountSchema, startTime: timestampSchema.optional(), maxMints: integerSchema, ...splitSchema, ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.release.configure(args as never))),
  },
  listing_release_mint: {
    inputSchema: { ...optionalChain, contract: addressSchema, quantity: integerSchema.optional(), currency: currencySchema, price: amountSchema.optional(), proof: proofSchema.optional(), recipient: addressSchema.optional(), ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.release.mint(args as never))),
  },
  listing_release_status: {
    inputSchema: { ...optionalChain, contract: addressSchema, account: addressSchema.optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.listing.release.status(args as never)),
  },
  listing_batch_create: {
    inputSchema: { ...optionalChain, artifact: artifactSchema, ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.batch.create(args as never))),
  },
  listing_batch_cancel: {
    inputSchema: { ...optionalChain, root: hexSchema.optional(), artifact: artifactSchema.optional(), contract: addressSchema.optional(), tokenId: integerSchema.optional() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.batch.cancel(args as never))),
  },
  listing_batch_buy: {
    inputSchema: { ...optionalChain, proofArtifact: artifactSchema.optional(), root: hexSchema.optional(), contract: addressSchema.optional(), tokenId: integerSchema.optional(), creator: addressSchema, currency: z.string(), price: amountSchema, ...autoApproveSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.batch.buy(args as never))),
  },
  listing_batch_set_allowlist: {
    inputSchema: { ...optionalChain, root: hexSchema.optional(), artifact: artifactSchema.optional(), contract: addressSchema.optional(), tokenId: integerSchema.optional(), allowListRoot: hexSchema.optional(), endTime: timestampSchema.optional() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.listing.batch.setAllowlist(args as never))),
  },
  listing_batch_status: {
    inputSchema: { ...optionalChain, root: hexSchema.optional(), creator: addressSchema, contract: addressSchema.optional(), tokenId: integerSchema.optional(), proof: proofSchema.optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.listing.batch.status(args as never)),
  },
  utils_tree_build: {
    inputSchema: { ...optionalChain, content: z.string(), format: z.enum(['csv', 'json']).optional(), sourceName: z.string().optional(), chainId: integerSchema.optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.utils.tree.build(args as never)),
  },
  utils_tree_proof: {
    inputSchema: { ...optionalChain, artifact: artifactSchema, contractAddress: addressSchema, tokenId: integerSchema, chainId: integerSchema.optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.utils.tree.proof(args as never)),
  },
  utils_tree_verify: {
    inputSchema: { ...optionalChain, root: hexSchema, contractAddress: addressSchema, tokenId: integerSchema, proof: proofSchema },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.utils.tree.verify(args as never)),
  },
  utils_merkle_proof: {
    inputSchema: { ...optionalChain, artifact: artifactSchema, contract: addressSchema, tokenId: integerSchema, buyer: addressSchema.optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.utils.merkle.proof(args as never)),
  },
  search_nfts: {
    inputSchema: {
      ...optionalChain,
      query: z.string().optional(),
      page: z.number().int().positive().optional(),
      perPage: z.number().int().positive().optional(),
      sortBy: z.string().optional(),
      ownerAddress: z.string().optional(),
      creatorAddress: z.string().optional(),
      contractAddress: z.string().optional(),
      collectionId: z.string().optional(),
      hasAuction: z.boolean().optional(),
      auctionState: z.string().optional(),
      hasListing: z.boolean().optional(),
      hasOffer: z.boolean().optional(),
      tags: z.array(z.string()).optional(),
      mediaType: z.string().optional(),
    },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.search.nfts(args)),
  },
  search_collections: {
    inputSchema: { ...optionalChain, query: z.string().optional(), page: z.number().int().positive().optional(), perPage: z.number().int().positive().optional(), sortBy: z.string().optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.search.collections(args)),
  },
  search_events: {
    inputSchema: { ...optionalChain, contract: addressSchema.optional(), tokenId: integerSchema.optional(), collectionId: z.string().optional(), eventType: z.union([z.string(), z.array(z.string())]).optional(), sortBy: z.enum(['newest', 'oldest']).optional(), page: z.number().int().positive().optional(), perPage: z.number().int().positive().optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.search.events(args as never)),
  },
  nft_get: {
    inputSchema: { ...optionalChain, ...contractTokenSchema },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.nft.get(args as never)),
  },
  collection_get: {
    inputSchema: { ...optionalChain, id: z.string() },
    handler: ({ chain, id }) => callRead(chain, (rare) => rare.collection.get(id as string)),
  },
  collection_status: {
    inputSchema: { ...optionalChain, contract: addressSchema, tokenId: integerSchema.optional(), price: integerSchema.optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.collection.status(args as never)),
  },
  collection_deploy_erc721: {
    inputSchema: { ...optionalChain, name: z.string(), symbol: z.string(), maxTokens: integerSchema.optional() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.collection.deploy.erc721(args as never))),
  },
  collection_deploy_erc1155: {
    inputSchema: { ...optionalChain, name: z.string(), symbol: z.string(), baseUri: z.string() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.collection.deploy.erc1155(args as never))),
  },
  collection_deploy_lazy_erc721: {
    inputSchema: { ...optionalChain, name: z.string(), symbol: z.string(), maxTokens: integerSchema, contractType: z.string().optional() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.collection.deploy.lazyErc721(args as never))),
  },
  collection_deploy_lazy_batch_mint: {
    inputSchema: { ...optionalChain, name: z.string(), symbol: z.string(), maxTokens: integerSchema.optional() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.collection.deploy.lazyBatchMint(args as never))),
  },
  collection_mint: {
    inputSchema: { ...optionalChain, contract: addressSchema, tokenUri: z.string(), to: addressSchema.optional(), royaltyReceiver: addressSchema.optional() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) =>
      txResult(await rare.collection.mint(args as never), { contract: args.contract, tokenUri: args.tokenUri })),
  },
  collection_erc1155_create_token: {
    inputSchema: { ...optionalChain, contract: addressSchema, maxSupply: integerSchema, tokenUri: z.string().optional(), royaltyReceiver: addressSchema.optional() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.collection.erc1155.createToken(args as never))),
  },
  collection_erc1155_mint: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, quantity: integerSchema, to: addressSchema.optional() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.collection.erc1155.mint(args as never))),
  },
  collection_erc1155_mint_batch: {
    inputSchema: { ...optionalChain, contract: addressSchema, to: addressSchema.optional(), items: z.array(erc1155MintItemSchema) },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.collection.erc1155.mintBatch(args as never))),
  },
  collection_erc1155_set_minter_approval: {
    inputSchema: { ...optionalChain, contract: addressSchema, minter: addressSchema, approved: z.boolean() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.collection.erc1155.setMinterApproval(args as never))),
  },
  collection_erc1155_update_token_uri: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, tokenUri: z.string() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.collection.erc1155.updateTokenUri(args as never))),
  },
  collection_erc1155_disable: {
    inputSchema: { ...optionalChain, contract: addressSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.collection.erc1155.disable(args as never))),
  },
  collection_erc1155_status: {
    inputSchema: { ...optionalChain, contract: addressSchema, tokenId: integerSchema.optional(), account: addressSchema.optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.collection.erc1155.status(args as never)),
  },
  collection_mint_batch: {
    inputSchema: { ...optionalChain, contract: addressSchema, baseUri: z.string(), amount: integerSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.collection.mintBatch(args as never))),
  },
  collection_prepare_lazy_mint: {
    inputSchema: { ...optionalChain, contract: addressSchema, baseUri: z.string(), amount: integerSchema, minter: addressSchema.optional() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.collection.prepareLazyMint(args as never))),
  },
  collection_get_token_creator: {
    inputSchema: { ...optionalChain, ...contractTokenSchema },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.collection.getTokenCreator(args as never)),
  },
  collection_royalty_status: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, price: integerSchema.optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.collection.royalty.status(args as never)),
  },
  collection_metadata_status: {
    inputSchema: { ...optionalChain, contract: addressSchema },
    handler: ({ chain, contract }) => callRead(chain, (rare) => rare.collection.metadata.status({ contract: contract as Address })),
  },
  collection_set_default_royalty_receiver: {
    inputSchema: { ...optionalChain, contract: addressSchema, receiver: addressSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.collection.setDefaultRoyaltyReceiver(args as never))),
  },
  collection_set_default_royalty_percentage: {
    inputSchema: { ...optionalChain, contract: addressSchema, percentage: integerSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.collection.setDefaultRoyaltyPercentage(args as never))),
  },
  collection_set_token_royalty_receiver: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, receiver: addressSchema },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.collection.setTokenRoyaltyReceiver(args as never))),
  },
  collection_update_base_uri: {
    inputSchema: { ...optionalChain, contract: addressSchema, baseUri: z.string() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.collection.updateBaseUri(args as never))),
  },
  collection_update_token_uri: {
    inputSchema: { ...optionalChain, ...contractTokenSchema, tokenUri: z.string() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => txResult(await rare.collection.updateTokenUri(args as never))),
  },
  collection_lock_base_uri: {
    inputSchema: { ...optionalChain, contract: addressSchema },
    handler: ({ chain, contract }) => callWrite(chain, async (rare) => txResult(await rare.collection.lockBaseUri({ contract: contract as Address }))),
  },
  ipfs_pin_file: {
    inputSchema: { path: z.string(), filename: z.string().optional() },
    handler: ({ path, filename }) => callRead(undefined, async (rare) => {
      const buffer = await readFile(path as string);
      return rare.ipfs.pinFile(new Uint8Array(buffer), (filename as string | undefined) ?? basename(path as string));
    }),
  },
  ipfs_pin_json: {
    inputSchema: { value: z.unknown(), filename: z.string().optional() },
    handler: ({ value, filename }) => callRead(undefined, (rare) => rare.ipfs.pinJson(value, filename as string | undefined)),
  },
  user_get: {
    inputSchema: { address: z.string() },
    handler: ({ address }) => callRead(undefined, (rare) => rare.user.get(address as string)),
  },
  media_upload: {
    inputSchema: { path: z.string(), filename: z.string().optional() },
    handler: ({ path, filename }) => callWrite(undefined, async (rare) => {
      const buffer = await readFile(path as string);
      return toolResult(await rare.media.upload(new Uint8Array(buffer), (filename as string | undefined) ?? basename(path as string)));
    }),
  },
  media_pin_metadata: {
    inputSchema: pinMetadataSchema,
    handler: (args) => callWrite(undefined, (rare) => rare.media.pinMetadata(args as never).then((tokenUri) => toolResult({ tokenUri }))),
  },
  import_erc721: {
    inputSchema: { ...optionalChain, contract: addressSchema, owner: addressSchema.optional() },
    handler: ({ chain, ...args }) => callWrite(chain, async (rare) => {
      await rare.import.erc721(args as never);
      return toolResult({ imported: true, contract: args.contract, owner: args.owner ?? null });
    }),
  },
  token_status: {
    inputSchema: { ...optionalChain, contract: addressSchema, tokenId: integerSchema.optional() },
    handler: ({ chain, ...args }) => callRead(chain, (rare) => rare.token.status(args as never)),
  },
  token_get_price: {
    inputSchema: { ...optionalChain, symbol: z.string() },
    handler: ({ chain, symbol }) => callRead(chain, (rare) => rare.token.getPrice(symbol as string)),
  },
  currency_list: {
    inputSchema: optionalChain,
    handler: ({ chain }) => callRead(chain, (rare) => rare.currency.list()),
  },
  currency_resolve: {
    inputSchema: { ...optionalChain, input: z.string() },
    handler: ({ chain, input }) => callRead(chain, (rare) => rare.currency.resolve(input as Address)),
  },
  currency_resolve_decimals: {
    inputSchema: { ...optionalChain, input: z.string() },
    handler: ({ chain, input }) => callRead(chain, (rare) => rare.currency.resolveDecimals(input as Address)),
  },
};

async function callRead(
  chain: unknown,
  call: (rare: ReturnType<typeof createRareClient>) => unknown,
): Promise<ToolResult> {
  return toolResult(await call(readRare(chain)));
}

async function callWrite(
  chain: unknown,
  call: (rare: ReturnType<typeof createRareClient>) => Promise<ToolResult> | ToolResult,
): Promise<ToolResult> {
  return call(writeRare(chain));
}

function readRare(chain: unknown): ReturnType<typeof createRareClient> {
  const selected = resolveChain(chain);
  return createRareClient({
    publicClient: getPublicClient(selected),
    account: getConfiguredAccountAddress(selected),
    resolveUniswapApiKey: () => getConfiguredUniswapApiKey(selected),
  });
}

function writeRare(chain: unknown): ReturnType<typeof createRareClient> {
  const selected = resolveChain(chain);
  const wallet = tryGetWalletClient(selected);
  if (wallet === null) {
    const chainConfig = getChainConfig(selected);
    if (!chainConfig.privateKey && !(chainConfig.privateKeyRef && chainConfig.accountAddress)) {
      throw new McpToolError(
        'missing_wallet',
        `No private key configured for chain "${selected}". Run rare configure or use the CLI wallet setup outside MCP.`,
      );
    }
    throw new McpToolError(
      'missing_rpc_url',
      `No RPC URL configured for chain "${selected}" and no public default is available.`,
    );
  }

  return createRareClient({
    publicClient: getPublicClient(selected),
    walletClient: wallet.client,
    account: wallet.account.address,
    resolveUniswapApiKey: () => getConfiguredUniswapApiKey(selected),
  });
}

function resolveChain(chain: unknown): SupportedChain {
  return typeof chain === 'string'
    ? resolveMcpChainSafe(chain)
    : resolveMcpChainSafe(undefined);
}

function resolveMcpChainSafe(chain: string | undefined): SupportedChain {
  const config = readConfig();
  const candidate = chain ?? config.defaultChain ?? 'sepolia';
  if ((supportedChains as readonly string[]).includes(candidate)) {
    return candidate as SupportedChain;
  }
  throw new McpToolError('unsupported_chain', `Unsupported chain "${candidate}". Supported chains: ${supportedChains.join(', ')}`);
}

async function withToolErrors(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (error) {
    return toolError(error);
  }
}

function txResult(value: unknown, extra: Record<string, unknown> = {}): ToolResult {
  return toolResult(shapeMcpTransactionResult(value, extra));
}

function normalizeMcpCheckoutArgs(args: Record<string, unknown>): Record<string, unknown> {
  const rawItems: unknown[] | undefined = Array.isArray(args.items) ? args.items : undefined;
  const items = rawItems === undefined
    ? args.items
    : rawItems.map((item): unknown => {
      if (!isPlainRecord(item) || !isPlainRecord(item.proof)) {
        return item;
      }
      return { ...item, proof: item.proof.proof };
    });
  return { ...args, items };
}

function toolResult(value: unknown): ToolResult {
  const structured = toStructuredRecord(serializeForMcp(value));
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

function toStructuredRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

class McpToolError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'McpToolError';
  }
}
