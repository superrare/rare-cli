import { Command } from 'commander';
import { configureCommand } from './commands/configure.js';
import { deployCommand } from './commands/deploy.js';
import { mintCommand } from './commands/mint.js';
import { auctionCommand } from './commands/auction.js';
import { statusCommand } from './commands/status.js';

const program = new Command();

program
  .name('rare')
  .description('CLI tool for interacting with the RARE protocol smart contracts')
  .version('0.1.0');

program.addCommand(configureCommand());
program.addCommand(deployCommand());
program.addCommand(mintCommand());
program.addCommand(auctionCommand());
program.addCommand(statusCommand());

program.parseAsync(process.argv).catch((err) => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});
