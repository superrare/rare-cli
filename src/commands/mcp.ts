import { Command } from 'commander';
import { serveMcp } from '../mcp/server.js';

export function mcpCommand(): Command {
  const cmd = new Command('mcp');
  cmd.description('Run MCP server integrations');

  cmd
    .command('serve')
    .description('Start a stdio MCP server for agent-friendly RARE SDK access')
    .option('--allow-writes', 'register write-capable tools')
    .action(async (opts: { allowWrites?: boolean }): Promise<void> => {
      await serveMcp({ allowWrites: Boolean(opts.allowWrites) });
    });

  return cmd;
}
