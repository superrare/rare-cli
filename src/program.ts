import { createInterface } from 'node:readline/promises';
import { Command } from 'commander';
import { configureCommand } from './commands/configure.js';
import { auctionCommand } from './commands/auction.js';
import { statusCommand } from './commands/status.js';
import { walletCommand } from './commands/wallet.js';
import { searchCommand } from './commands/search.js';
import { importCommand } from './commands/import.js';
import { offerCommand } from './commands/offer.js';
import { listingCommand } from './commands/listing.js';
import { nftCommand } from './commands/nft.js';
import { collectionCommand } from './commands/collection.js';
import { currenciesCommand } from './commands/currencies.js';
import { liquidEditionCommand } from './commands/liquid-edition.js';
import { swapCommand } from './commands/swap.js';
import { userCommand } from './commands/user.js';
import { utilsCommand } from './commands/utils.js';
import { getConfirmationDecision, type ConfirmationOptions } from './confirmation.js';

export function createRareProgram(): Command {
  const program = new Command();

  program
    .name('rare')
    .description('CLI tool for interacting with the RARE protocol smart contracts')
    .version('1.0.0')
    .option('--json', 'output results as JSON');

  program.hook('preAction', async (_thisCommand, actionCommand) => {
    const decision = confirmationDecision(program, actionCommand);
    if (decision === 'reject-json') {
      throw new Error(`${commandPath(actionCommand).join(' ')} requires --yes when --json is enabled.`);
    }
    if (decision === 'reject-non-interactive') {
      throw new Error(`${commandPath(actionCommand).join(' ')} requires --yes in non-interactive mode.`);
    }
    if (decision === 'prompt') {
      if (await confirmProceed()) {
        return;
      }

      throw new Error('Aborted.');
    }
  });

  program.addCommand(configureCommand());
  program.addCommand(auctionCommand());
  program.addCommand(statusCommand());
  program.addCommand(walletCommand());
  program.addCommand(searchCommand());
  program.addCommand(importCommand());
  program.addCommand(offerCommand());
  program.addCommand(listingCommand());
  program.addCommand(nftCommand());
  program.addCommand(collectionCommand());
  program.addCommand(currenciesCommand());
  program.addCommand(liquidEditionCommand());
  program.addCommand(swapCommand());
  program.addCommand(userCommand());
  program.addCommand(utilsCommand());

  return program;
}

function confirmationDecision(program: Command, command: Command): ReturnType<typeof getConfirmationDecision> {
  return getConfirmationDecision({
    commandPath: commandPath(command),
    options: command.opts<ConfirmationOptions>(),
    stdinIsTty: process.stdin.isTTY,
    skipConfirmation: process.env.RARE_SKIP_CONFIRMATION === '1',
    jsonMode: program.opts<{ json?: boolean }>().json === true,
  });
}

export function commandPath(command: Command): string[] {
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
