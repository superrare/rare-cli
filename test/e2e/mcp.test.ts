import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';
import { mcpReadToolNames, mcpWriteToolNames } from '../../src/mcp/core.js';
import { runCli, withTempHome } from '../helpers/cli.js';

const cliPath = fileURLToPath(new URL('../../dist/index.js', import.meta.url));
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('MCP stdio server', () => {
  it('exposes MCP serve help', async () => {
    await withTempHome(async (home) => {
      const result = await runCli(['mcp', 'serve', '--help'], { home });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage: rare mcp serve [options]');
      expect(result.stdout).toContain('--allow-writes');
      expect(result.stderr).toBe('');
    });
  });

  it('serves read-only tools by default and returns structured content', async () => {
    await withTempHome(async (home) => {
      await withMcpClient({ home }, async (client) => {
        const tools = await client.listTools();
        const names = tools.tools.map((tool) => tool.name).sort();

        expect(names).toEqual([...mcpReadToolNames].sort());
        for (const writeToolName of mcpWriteToolNames) {
          expect(names).not.toContain(writeToolName);
        }

        const configSummary = tools.tools.find((tool) => tool.name === 'config_summary');
        expect(configSummary?.annotations).toEqual({
          readOnlyHint: true,
          openWorldHint: true,
        });

        const searchNfts = tools.tools.find((tool) => tool.name === 'search_nfts');
        const nftSearchSchema = getObjectInputSchema(searchNfts);
        expect(searchNfts?.description).toContain('listingType');
        expect(searchNfts?.description).toContain('If a desired filter is not available');
        expect(nftSearchSchema.additionalProperties).toBe(false);
        expect(nftSearchSchema.examples).toContainEqual({
          hasListing: true,
          listingType: 'SALE_PRICE',
          sortBy: 'recentActivity',
          page: 1,
          perPage: 5,
        });
        expect(nftSearchSchema.properties?.listingType?.enum).toEqual(['SALE_PRICE', 'BATCH_SALE_PRICE']);
        expect(nftSearchSchema.properties?.auctionState?.enum).toEqual(['PENDING', 'RUNNING', 'UNSETTLED']);
        expect(nftSearchSchema.properties?.mediaType?.enum).toEqual(['AUDIO', 'HTML', 'IMAGE', 'THREE_D', 'VIDEO']);
        expect(nftSearchSchema.properties?.auctionBidderAddress?.description).toContain('Implies hasAuction');
        expect(nftSearchSchema.properties?.offerBuyerAddress?.description).toContain('Implies hasOffer');

        const searchCollections = tools.tools.find((tool) => tool.name === 'search_collections');
        const collectionSearchSchema = getObjectInputSchema(searchCollections);
        expect(searchCollections?.description).toContain('Use only query, ownerAddress, sortBy, page, and perPage');
        expect(collectionSearchSchema.additionalProperties).toBe(false);
        expect(collectionSearchSchema.properties?.sortBy?.enum).toEqual(['newest', 'oldest']);
        expect(collectionSearchSchema.properties?.ownerAddress?.description).toContain('owned by this wallet');

        const searchEvents = tools.tools.find((tool) => tool.name === 'search_events');
        const eventSearchSchema = getObjectInputSchema(searchEvents);
        expect(searchEvents?.description).toContain('Use contract plus tokenId');
        expect(eventSearchSchema.additionalProperties).toBe(false);
        expect(eventSearchSchema.properties?.eventType?.description).toContain('Omit this when unsure');
        expect(JSON.stringify(eventSearchSchema.properties?.eventType)).toContain('MAKE_LISTING');
        expect(JSON.stringify(eventSearchSchema.properties?.eventType)).toContain('TRANSFER_NFT_SUPPLY');

        const config = await client.callTool({ name: 'config_summary', arguments: {} });
        expect(config.structuredContent).toEqual({
          defaultChain: 'sepolia',
          chains: {},
        });
        expect(JSON.parse(readTextContent(config))).toEqual(config.structuredContent);

        const metadata = await client.callTool({ name: 'client_metadata', arguments: {} });
        expect(metadata.structuredContent).toEqual({
          chain: 'sepolia',
          chainId: 11155111,
        });

        const currency = await client.callTool({
          name: 'currency_resolve',
          arguments: { input: 'eth' },
        });
        expect(currency.structuredContent).toMatchObject({
          name: 'eth',
          symbol: 'ETH',
          chain: 'sepolia',
          chainId: 11155111,
        });

        const tree = await client.callTool({
          name: 'utils_tree_build',
          arguments: {
            content: JSON.stringify([
              { contractAddress: '0x1111111111111111111111111111111111111111', tokenId: '1' },
            ]),
            format: 'json',
          },
        });
        expect(tree.structuredContent).toMatchObject({
          version: 1,
          type: 'rare-batch-token-list',
          count: 1,
        });

        expect(names).toContain('collection_erc1155_status');
        expect(names).toContain('listing_erc1155_release_status');
        expect(names).toContain('offer_erc1155_status');
        expect(names).not.toContain('collection_deploy_erc1155');
        expect(names).not.toContain('listing_erc1155_checkout');

        const allowlist = await client.callTool({
          name: 'listing_erc1155_release_allowlist_build',
          arguments: {
            input: JSON.stringify([
              { wallet: '0x0000000000000000000000000000000000000001' },
              { wallet: '0x0000000000000000000000000000000000000002' },
            ]),
            format: 'json',
          },
        });
        expect(allowlist.structuredContent).toMatchObject({
          kind: 'rare-release-allowlist-v1',
          version: 1,
          wallets: expect.any(Array),
        });

        const proof = await client.callTool({
          name: 'listing_erc1155_release_allowlist_proof',
          arguments: {
            artifact: allowlist.structuredContent,
            address: '0x0000000000000000000000000000000000000001',
          },
        });
        expect(proof.structuredContent).toMatchObject({
          address: '0x0000000000000000000000000000000000000001',
          proof: expect.any(Array),
        });
      });
    });
  });

  it('registers write tools only with --allow-writes and reports missing wallet as structured error', async () => {
    await withTempHome(async (home) => {
      await withMcpClient({ home, args: ['--allow-writes'] }, async (client) => {
        const tools = await client.listTools();
        const names = tools.tools.map((tool) => tool.name).sort();

        expect(names).toEqual([...mcpReadToolNames, ...mcpWriteToolNames].sort());

        const collectionMint = tools.tools.find((tool) => tool.name === 'collection_mint');
        expect(collectionMint?.annotations).toEqual({
          readOnlyHint: false,
          destructiveHint: true,
          openWorldHint: true,
        });
        expect(names).toContain('collection_deploy_erc1155');
        expect(names).toContain('collection_erc1155_mint');
        expect(names).toContain('collection_erc1155_update_token_uri');
        expect(names).toContain('collection_erc1155_disable');
        expect(names).toContain('listing_erc1155_create');
        expect(names).toContain('listing_erc1155_create_batch');
        expect(names).toContain('listing_erc1155_checkout');
        expect(names).toContain('listing_erc1155_release_configure_batch');
        expect(names).toContain('listing_erc1155_release_cancel');
        expect(names).toContain('listing_erc1155_release_allowlist_set_config_batch');
        expect(names).toContain('listing_erc1155_release_limits_set_mint_batch');
        expect(names).toContain('listing_erc1155_release_limits_set_tx_batch');
        expect(names).toContain('listing_erc1155_release_mint');
        expect(names).toContain('offer_erc1155_accept');

        const result = await client.callTool({
          name: 'collection_mint',
          arguments: {
            chain: 'sepolia',
            contract: '0x1111111111111111111111111111111111111111',
            tokenUri: 'ipfs://metadata',
          },
        });
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toEqual({
          error: {
            code: 'missing_wallet',
            message: 'No private key configured for chain "sepolia". Run rare configure or use the CLI wallet setup outside MCP.',
          },
        });

        const erc1155Result = await client.callTool({
          name: 'collection_erc1155_mint',
          arguments: {
            chain: 'sepolia',
            contract: '0x1111111111111111111111111111111111111111',
            tokenId: '1',
            quantity: '1',
          },
        });
        expect(erc1155Result.isError).toBe(true);
        expect(erc1155Result.structuredContent).toEqual({
          error: {
            code: 'missing_wallet',
            message: 'No private key configured for chain "sepolia". Run rare configure or use the CLI wallet setup outside MCP.',
          },
        });

        const checkoutResult = await client.callTool({
          name: 'listing_erc1155_checkout',
          arguments: {
            chain: 'sepolia',
            items: [{
              kind: 'release',
              contract: '0x1111111111111111111111111111111111111111',
              tokenId: '1',
              quantity: '1',
            }],
          },
        });
        expect(checkoutResult.isError).toBe(true);
        expect(checkoutResult.structuredContent).toEqual({
          error: {
            code: 'missing_wallet',
            message: 'No private key configured for chain "sepolia". Run rare configure or use the CLI wallet setup outside MCP.',
          },
        });
      });
    });
  });

  it('reports invalid tool inputs at the protocol boundary', async () => {
    await withTempHome(async (home) => {
      await withMcpClient({ home }, async (client) => {
        const result = await client.callTool({
          name: 'token_status',
          arguments: {
            contract: 'not-an-address',
            tokenId: '1',
          },
        });
        expect(result.isError).toBe(true);
        expect(readTextContent(result)).toContain('Input validation error');
        expect(readTextContent(result)).toContain('must be a valid 0x address');

        const erc1155Result = await client.callTool({
          name: 'collection_erc1155_status',
          arguments: {
            contract: 'not-an-address',
            tokenId: '1',
          },
        });
        expect(erc1155Result.isError).toBe(true);
        expect(readTextContent(erc1155Result)).toContain('Input validation error');
        expect(readTextContent(erc1155Result)).toContain('must be a valid 0x address');

        const unknownSearchFilter = await client.callTool({
          name: 'search_nfts',
          arguments: {
            artistAddress: '0x1111111111111111111111111111111111111111',
          },
        });
        expect(unknownSearchFilter.isError).toBe(true);
        expect(readTextContent(unknownSearchFilter)).toContain('Input validation error');
        expect(readTextContent(unknownSearchFilter)).toContain('Unrecognized key');

        const unsupportedSearchSort = await client.callTool({
          name: 'search_nfts',
          arguments: {
            sortBy: 'artistName',
          },
        });
        expect(unsupportedSearchSort.isError).toBe(true);
        expect(readTextContent(unsupportedSearchSort)).toContain('Input validation error');
        expect(readTextContent(unsupportedSearchSort)).toContain('Invalid option');
      });
    });
  });

  it('validates ERC1155 checkout tool inputs at the protocol boundary', async () => {
    await withTempHome(async (home) => {
      await withMcpClient({ home, args: ['--allow-writes'] }, async (client) => {
        const result = await client.callTool({
          name: 'listing_erc1155_checkout',
          arguments: {
            items: [{
              kind: 'listing',
              contract: 'not-an-address',
              seller: '0x2222222222222222222222222222222222222222',
              tokenId: '1',
              quantity: '1',
              price: '1',
            }],
          },
        });
        expect(result.isError).toBe(true);
        expect(readTextContent(result)).toContain('Input validation error');
        expect(readTextContent(result)).toContain('must be a valid 0x address');
      });
    });
  });
});

async function withMcpClient<T>(
  opts: { home: string; args?: string[] },
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, 'mcp', 'serve', ...(opts.args ?? [])],
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: opts.home,
      USERPROFILE: opts.home,
    },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'rare-cli-e2e', version: '1.0.0' });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

function readTextContent(result: Awaited<ReturnType<Client['callTool']>>): string {
  if (!Array.isArray(result.content)) {
    throw new Error('MCP tool result did not include content.');
  }
  const content = result.content[0];
  if (!isTextContent(content)) {
    throw new Error('MCP tool result did not include JSON text content.');
  }
  return content.text;
}

function isTextContent(value: unknown): value is { type: 'text'; text: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'text' &&
    'text' in value &&
    typeof value.text === 'string'
  );
}

type JsonSchemaProperty = {
  description?: string;
  enum?: unknown[];
};

type JsonObjectSchema = {
  additionalProperties?: unknown;
  examples?: unknown[];
  properties?: Record<string, JsonSchemaProperty>;
};

function getObjectInputSchema(tool: { inputSchema?: unknown } | undefined): JsonObjectSchema {
  const schema = tool?.inputSchema;
  if (!isJsonObjectSchema(schema)) {
    throw new Error('Expected MCP tool with object input schema.');
  }
  return schema;
}

function isJsonObjectSchema(value: unknown): value is JsonObjectSchema {
  return typeof value === 'object' && value !== null;
}
