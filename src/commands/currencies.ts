import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { resolveCurrency, currencyNames } from '../contracts/addresses.js';

export function currenciesCommand(): Command {
  const cmd = new Command('currencies');
  cmd
    .description('List supported currencies and their addresses')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action((opts) => {
      const chain = getActiveChain(opts.chain);

      console.log(`\nSupported currencies on ${chain}:\n`);
      for (const name of currencyNames) {
        const address = resolveCurrency(name, chain);
        console.log(`  ${name.toUpperCase().padEnd(6)} ${address}`);
      }
    });

  return cmd;
}
