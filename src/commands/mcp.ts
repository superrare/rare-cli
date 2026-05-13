import { Command } from 'commander';
import { printError } from '../errors.js';
import { serveMcp } from '../mcp/server.js';

type McpServeOptions = {
  allowWrites?: boolean;
};

export function mcpCommand(): Command {
  const cmd = new Command('mcp');
  cmd.description('Run MCP server integrations');

  cmd
    .command('serve')
    .description('Start a stdio MCP server for agent-friendly RARE CLI access')
    .option('--allow-writes', 'register write-capable tools')
    .action(async (opts: McpServeOptions): Promise<void> => {
      try {
        await serveMcp({ allowWrites: Boolean(opts.allowWrites) });
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}
