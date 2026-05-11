import { Command } from 'commander';
import { printError } from '../errors.js';
import { serveMcp } from '../mcp/server.js';

export function mcpCommand(): Command {
  const cmd = new Command('mcp');
  cmd.description('Run MCP server integrations');

  cmd
    .command('serve')
    .description('Start a stdio MCP server for agent-friendly RARE CLI access')
    .option('--allow-writes', 'register write-capable tools')
    .action(async (opts) => {
      try {
        await serveMcp({ allowWrites: Boolean(opts.allowWrites) });
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}
