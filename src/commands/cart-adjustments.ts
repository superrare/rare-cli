import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import { z } from 'zod';
import { isAddress, type Address, type Hex } from 'viem';
import { createRareClient, type CartAdjustmentCreateParams, type CartAdjustmentAssignmentCreateParams, type CartAdjustmentRequestOptions, type RareClient } from '@rareprotocol/rare-sdk';
import { accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { createAuthStore } from '../auth-storage.js';
import { getPublicClient } from '../client.js';
import { getActiveChain } from '../config.js';
import { output } from '../output.js';
import { addChainOptions, type ChainOptions } from './options.js';
type Options = AccountCommandOptions & ChainOptions & { apiKeyEnv?: string };
const address = z.custom<Address>(
  (input) => typeof input === "string" && isAddress(input),
);
const decimal = z.string().regex(/^(0|[1-9][0-9]*)$/);
const definition = z.object({
 effect: z.literal('CHARGE'), phase: z.enum(['LISTING_CONFIGURATION', 'CHECKOUT']), code: z.string(),
 calculation: z.discriminatedUnion('type', [
  z.object({type: z.literal('PERCENTAGE'), basisPoints: z.number(), currencyMode: z.literal('COMPONENT_CURRENCY')}).strict(),
  z.object({type: z.enum(['FIXED', 'PER_UNIT']), amount: decimal.transform(BigInt), currencyMode: z.literal('COMPONENT_CURRENCY')}).strict(),
 ]),
 recipient: z.discriminatedUnion('type', [z.object({type: z.literal('FIXED'), address}).strict(), z.object({type: z.literal('TOKEN_CREATOR')}).strict()]),
}).strict();
const assignment = z.object({
 adjustmentId: z.string().regex(/^[1-9][0-9]*$/), priority: z.number(),
  scope: z
      .object({
        chainIds: z.array(z.number()).optional(),
        sellerAddresses: z.array(address).optional(),
        skus: z.array(z.custom<Hex>((value) => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value))).optional(),
        nfts: z
          .array(
            z.object({
              chainId: z.number(),
              contract: address,
              tokenId: decimal.transform(BigInt),
            }),
          )
          .optional(),
        collections: z
          .array(z.object({ chainId: z.number(), contract: address }))
          .optional(),
        productIds: z.array(z.string()).optional(),
        fulfillmentKinds: z.array(z.number()).optional(),
        saleTypes: z
          .array(z.enum(["PRIMARY_SALE", "SECONDARY_SALE"]))
          .optional(),
        settlementCurrencies: z.array(address).optional(),
        paymentCurrencies: z.array(address).optional(),
      })
      .strict()
      .default({}),
 validFrom: z.string().nullable().optional(), validUntil: z.string().nullable().optional(),
}).strict();
const client = (options: Options): RareClient => createRareClient({publicClient: getPublicClient(getActiveChain(options.chain, options.chainId)), apiBaseUrl: options.apiUrl, sessionStore: createAuthStore(storageOptions(options))});
const requestOptions = (options: Options): CartAdjustmentRequestOptions => {
 if (options.apiKeyEnv === undefined) return {};
 const key = process.env[options.apiKeyEnv];
 if (!key) throw new Error(`Environment variable ${options.apiKeyEnv} must contain the internal API key.`);
 return {internalApiKey: key};
};
const command = (name: string): Command => addChainOptions(accountCommand(name)).option('--api-key-env <name>', 'environment variable holding the internal API key instead of account authentication');
const phaseInput = (value?: string): 'LISTING_CONFIGURATION' | 'CHECKOUT' | undefined => {
 if (value !== undefined && value !== 'LISTING_CONFIGURATION' && value !== 'CHECKOUT') throw new Error('Invalid adjustment phase.'); return value;
};
const consent = (options: {yes?: boolean}): void => {if (options.yes !== true) throw new Error('Adjustment changes require --yes.');};
export function cartAdjustmentsCommand(): Command {
 const adjustments = new Command('adjustments').description('Manage reusable platform charges and scoped assignments. Requires administrator access.');
 adjustments.addCommand(command('create').description('Create a reusable charge definition without applying it').requiredOption('--input <path>', 'JSON definition; fixed amounts use decimal strings').option('--yes', 'confirm creating the definition').action(async (options: Options & {input: string; yes?: boolean}) => {
  consent(options); const raw: unknown = JSON.parse(await readFile(options.input, 'utf8')); const input: CartAdjustmentCreateParams = definition.parse(raw);
  const value = await client(options).cart.adjustments.create(input, requestOptions(options)); output(value, () => {console.log(`${value.id}: ${value.code} (${value.phase}, ${value.effect})`);});
 }));
 adjustments.addCommand(command('list').option('--phase <phase>', 'LISTING_CONFIGURATION or CHECKOUT').option('--page <number>', 'page starting at 1', Number).option('--per-page <number>', 'results per page', Number).action(async (options: Options & {phase?: string;page?: number;perPage?: number}) => {
  const page = await client(options).cart.adjustments.list({phase: phaseInput(options.phase), page: options.page, perPage: options.perPage}, requestOptions(options));
  output(page, () => {for (const value of page.data) console.log(`${value.id}: ${value.code} (${value.phase}, ${value.effect})`);});
 }));
 const assignments = new Command('assignments').description('Apply existing definitions to SKUs, collections or checkout scopes');
 assignments.addCommand(command('create').requiredOption('--input <path>', 'JSON assignment with adjustmentId, scope and priority').option('--yes', 'confirm applying the adjustment').action(async (options: Options & {input: string;yes?: boolean}) => {
  consent(options); const raw: unknown = JSON.parse(await readFile(options.input, 'utf8')); const input: CartAdjustmentAssignmentCreateParams = assignment.parse(raw);
  const value = await client(options).cart.adjustments.assignments.create(input, requestOptions(options)); output(value, () => {console.log(`${value.id}: adjustment ${value.adjustmentId}, priority ${value.priority}`);});
 }));
 assignments.addCommand(command('list').option('--adjustment-id <id>', 'filter by reusable definition ID').option('--phase <phase>', 'LISTING_CONFIGURATION or CHECKOUT').option('--page <number>', 'page starting at 1', Number).option('--per-page <number>', 'results per page', Number).action(async (options: Options & {adjustmentId?: string;phase?: string;page?: number;perPage?: number}) => {
  const page = await client(options).cart.adjustments.assignments.list({adjustmentId: options.adjustmentId, phase: phaseInput(options.phase), page: options.page, perPage: options.perPage}, requestOptions(options));
  output(page, () => {for (const value of page.data) console.log(`${value.id}: adjustment ${value.adjustmentId}, priority ${value.priority}`);});
 }));
 assignments.addCommand(command('disable').requiredOption('--id <id>', 'assignment ID').option('--yes', 'confirm disabling this assignment').action(async (options: Options & {id: string;yes?: boolean}) => {
  consent(options); const value = await client(options).cart.adjustments.assignments.disable(options.id, requestOptions(options)); output(value, () => {console.log(`Disabled adjustment assignment ${value.id}`);});
 }));
 adjustments.addCommand(assignments); return adjustments;
}
