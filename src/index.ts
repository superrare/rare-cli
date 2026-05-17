import { createInterface } from 'node:readline/promises';
import { Command } from 'commander';
import { configureCommand } from './commands/configure.js';
import { deployCommand } from './commands/deploy.js';
import { auctionCommand } from './commands/auction.js';
import { statusCommand } from './commands/status.js';
import { walletCommand } from './commands/wallet.js';
import { searchCommand } from './commands/search.js';
import { importCommand } from './commands/import.js';
import { offerCommand } from './commands/offer.js';
import { listingCommand } from './commands/listing.js';
import { collectionCommand } from './commands/collection.js';
import { currenciesCommand } from './commands/currencies.js';
import { liquidEditionCommand } from './commands/liquid-edition.js';
import { swapCommand } from './commands/swap.js';
import { batchCommand } from './commands/batch.js';
import { utilsCommand } from './commands/utils.js';
import { loadDotEnv } from './env.js';
import { printError } from './errors.js';

loadDotEnv();

const program = new Command();

program
  .name('rare')
  .description('CLI tool for interacting with the RARE protocol smart contracts')
  .version('1.0.0')
  .option('--json', 'output results as JSON');

program.hook('preAction', async (_thisCommand, actionCommand) => {
  if (!shouldConfirmAction(actionCommand)) {
    return;
  }
  if (await confirmProceed()) {
    return;
  }

  throw new Error('Aborted.');
});

program.addCommand(configureCommand());
program.addCommand(deployCommand());
program.addCommand(auctionCommand());
program.addCommand(statusCommand());
program.addCommand(walletCommand());
program.addCommand(searchCommand());
program.addCommand(importCommand());
program.addCommand(offerCommand());
program.addCommand(listingCommand());
program.addCommand(collectionCommand());
program.addCommand(currenciesCommand());
program.addCommand(liquidEditionCommand());
program.addCommand(swapCommand());
program.addCommand(batchCommand());
program.addCommand(utilsCommand());

program.parseAsync(process.argv).catch((err: unknown) => {
  printError(err);
});

function shouldConfirmAction(command: Command): boolean {
  const opts = command.opts<{ yes?: boolean; preview?: boolean; quoteOnly?: boolean }>();
  if (opts.yes === true || opts.preview === true || opts.quoteOnly === true) {
    return false;
  }
  if (!process.stdin.isTTY || process.env.RARE_SKIP_CONFIRMATION === '1') {
    return false;
  }
  if (program.opts<{ json?: boolean }>().json === true) {
    return false;
  }
  if (!command.options.some((option) => option.long === '--yes')) {
    return false;
  }

  return commandPath(command).join(' ') !== 'rare configure delete';
}

function commandPath(command: Command): string[] {
  return commandPathFrom(command).toReversed();
}

function commandPathFrom(command: Command | null): string[] {
  if (command === null) {
    return [];
  }

  const name = command.name();
  const current = name === '' ? [] : [name];
  return [...current, ...commandPathFrom(command.parent ?? null)];
}

async function confirmProceed(): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const normalized = (await rl.question('Proceed? [y/N] ')).trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  } finally {
    rl.close();
  }
}
