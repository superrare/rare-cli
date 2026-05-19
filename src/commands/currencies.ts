import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { listCurrencies } from '../contracts/addresses.js';
import { output } from '../output.js';

type CurrenciesOptions = {
  chain?: string;
  chainId?: string;
};

export function currenciesCommand(): Command {
  const cmd = new Command('currencies');
  cmd
    .description('List supported currencies and their addresses')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action((opts: CurrenciesOptions): void => {
      const chain = getActiveChain(opts.chain, opts.chainId);

      const currencies = listCurrencies(chain).map((currency) => ({
        name: currency.symbol,
        address: currency.address,
      }));

      output(currencies, () => {
        console.log(`\nSupported currencies on ${chain}:\n`);
        for (const c of currencies) {
          console.log(`  ${c.name.padEnd(6)} ${c.address}`);
        }
      });
    });

  return cmd;
}
