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
      });
    });
  });

  it('registers write tools only with --allow-writes and reports missing wallet as structured error', async () => {
    await withTempHome(async (home) => {
      await withMcpClient({ home, args: ['--allow-writes'] }, async (client) => {
        const tools = await client.listTools();
        const names = tools.tools.map((tool) => tool.name).sort();

        expect(names).toEqual([...mcpReadToolNames, ...mcpWriteToolNames].sort());

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
