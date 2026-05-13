import { Command } from 'commander';
import { configureCommand } from './commands/configure.js';
import { deployCommand } from './commands/deploy.js';
import { mintCommand } from './commands/mint.js';
import { auctionCommand } from './commands/auction.js';
import { statusCommand } from './commands/status.js';
import { walletCommand } from './commands/wallet.js';
import { searchCommand } from './commands/search.js';
import { listCollectionsCommand } from './commands/list-collections.js';
import { importCommand } from './commands/import.js';
import { offerCommand } from './commands/offer.js';
import { listingCommand } from './commands/listing.js';
import { collectionCommand } from './commands/collection.js';
import { currenciesCommand } from './commands/currencies.js';
import { swapCommand } from './commands/swap.js';
import { printError } from './errors.js';

const program = new Command();

program
  .name('rare')
  .description('CLI tool for interacting with the RARE protocol smart contracts')
  .version('1.0.0')
  .option('--json', 'output results as JSON');

program.addCommand(configureCommand());
program.addCommand(deployCommand());
program.addCommand(mintCommand());
program.addCommand(auctionCommand());
program.addCommand(statusCommand());
program.addCommand(walletCommand());
program.addCommand(searchCommand());
program.addCommand(listCollectionsCommand());
program.addCommand(importCommand());
program.addCommand(offerCommand());
program.addCommand(listingCommand());
program.addCommand(collectionCommand());
program.addCommand(currenciesCommand());
program.addCommand(swapCommand());

program.parseAsync(process.argv).catch((err: unknown) => {
  printError(err);
});
