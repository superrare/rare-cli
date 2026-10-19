import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import { createRareClient } from '@rareprotocol/rare-sdk/client';
import type { RareClient } from '@rareprotocol/rare-sdk';
import { accountClient, accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { getPublicClient } from '../client.js';
import { getActiveChain } from '../config.js';
import { output } from '../output.js';
import { addChainOptions, type ChainOptions } from './options.js';
import { parseCartBytes32, unwrapCartCliResult } from './cart-core.js';
import { parseEligibilityRuleInput } from './eligibility-core.js';
import { z } from 'zod';

type EligibilityOptions = AccountCommandOptions & ChainOptions;
type ListingOptions = EligibilityOptions & { listingDigest: string; ruleId?: string };
type ListOptions = EligibilityOptions & { take?: number; skip?: number; sku?: string; ruleId?: string };

function listCommand(name: string): Command {
  return addChainOptions(accountCommand(name))
    .option('--take <number>', 'maximum records to return, up to 100', (value: unknown) => z.coerce.number().int().min(1).max(100).parse(value))
    .option('--skip <number>', 'number of records to skip, up to 100000', (value: unknown) => z.coerce.number().int().min(0).max(100000).parse(value));
}

export function eligibilityCommand(): Command {
  const command = new Command('eligibility').description('Manage SKU purchase eligibility rules and inspect your claims');
  const rules = new Command('rules').description('Manage rules issued by your authenticated account');
  rules.addCommand(addChainOptions(accountCommand('create'))
    .description('Create a rule from a JSON definition')
    .requiredOption('--input <path>', 'JSON rule definition file')
    .action(async (options: EligibilityOptions & { input: string }) => {
      const value: unknown = JSON.parse(await readFile(options.input, 'utf8'));
      const input = parseEligibilityRuleInput(value);
      const result = await rareClient(options).eligibility.createRule(input);
      print(result);
    }));
  rules.addCommand(listCommand('list')
    .description('List rules issued by your authenticated account')
    .action(async (options: ListOptions) => {
      print(await rareClient(options).eligibility.listRules({ take: options.take, skip: options.skip }));
    }));
  rules.addCommand(addChainOptions(accountCommand('disable'))
    .description('Disable an owned rule for new grants and checkout authorizations')
    .requiredOption('--rule-id <id>', 'eligibility rule ID')
    .action(async (options: EligibilityOptions & { ruleId: string }) => {
      await rareClient(options).eligibility.disableRule(options.ruleId);
      print({ ruleId: options.ruleId, disabled: true });
    }));
  command.addCommand(rules);

  const claims = new Command('claims').description('Inspect claims belonging to your authenticated account');
  claims.addCommand(listCommand('list')
    .description('List your SKU purchase claims')
    .option('--sku <bytes32>', 'filter claims by an allowed SKU')
    .option('--rule-id <id>', 'filter claims by issuing rule')
    .action(async (options: ListOptions) => {
      const sku = options.sku === undefined ? undefined : unwrapCartCliResult(parseCartBytes32(options.sku, '--sku'));
      print(await rareClient(options).eligibility.listClaims({ take: options.take, skip: options.skip, sku, ruleId: options.ruleId }));
    }));
  command.addCommand(claims);

  const listings = new Command('listings').description('Opt owned Listings into or out of an eligibility rule');
  listings.addCommand(addChainOptions(accountCommand('require'))
    .description('Require a claim issued by a rule to purchase a Listing')
    .requiredOption('--listing-digest <bytes32>', 'Cart Listing digest')
    .requiredOption('--rule-id <id>', 'owned eligibility rule ID')
    .action(async (options: ListingOptions & { ruleId: string }) => {
      const listingDigest = unwrapCartCliResult(parseCartBytes32(options.listingDigest, '--listing-digest'));
      const rare = rareClient(options);
      if (rare.contracts.cart === undefined) throw new Error('Cart is not deployed on this chain.');
      await rare.eligibility.setListingRequirement({ listingDigest, chainId: String(rare.chainId),
        cartAddress: rare.contracts.cart, ruleId: options.ruleId });
      print({ listingDigest, ruleId: options.ruleId });
    }));
  listings.addCommand(addChainOptions(accountCommand('clear'))
    .description('Remove a Listing eligibility requirement')
    .requiredOption('--listing-digest <bytes32>', 'Cart Listing digest')
    .action(async (options: ListingOptions) => {
      const listingDigest = unwrapCartCliResult(parseCartBytes32(options.listingDigest, '--listing-digest'));
      const rare = rareClient(options);
      if (rare.contracts.cart === undefined) throw new Error('Cart is not deployed on this chain.');
      await rare.eligibility.clearListingRequirement({ listingDigest, chainId: String(rare.chainId),
        cartAddress: rare.contracts.cart });
      print({ listingDigest, removed: true });
    }));
  command.addCommand(listings);
  return command;
}

function rareClient(options: EligibilityOptions): RareClient {
  const chain = getActiveChain(options.chain, options.chainId);
  return createRareClient({ publicClient: getPublicClient(chain), apiBaseUrl: options.apiUrl,
    accountClient: accountClient(storageOptions(options)) });
}

function print(value: unknown): void {
  output(value, () => { console.log(JSON.stringify(value, null, 2)); });
}
