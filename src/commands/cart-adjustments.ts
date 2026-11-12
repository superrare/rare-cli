import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import { z } from 'zod';
import { isAddress, type Address, type Hex } from 'viem';
import { RareApiError, RareAuthError } from '@rareprotocol/rare-sdk';
import { chainIds } from '@rareprotocol/rare-sdk/contracts';
import { accountClient, accountCommand, storageOptions, type AccountCommandOptions } from '../auth-cli.js';
import { getActiveChain } from '../config.js';
import { output } from '../output.js';
import { addChainOptions, type ChainOptions } from './options.js';
type Options = AccountCommandOptions & ChainOptions;
const address = z.custom<Address>(
  (input) => typeof input === "string" && isAddress(input),
);
const decimal = z.string().regex(/^(0|[1-9][0-9]*)$/);
const definition = z.object({
 effect: z.literal('CHARGE'), phase: z.enum(['LISTING_CONFIGURATION', 'CHECKOUT']), code: z.string(),
 calculation: z.discriminatedUnion('type', [
  z.object({type: z.literal('PERCENTAGE'), basisPoints: z.number(), currencyMode: z.literal('COMPONENT_CURRENCY')}).strict(),
  z.object({type: z.enum(['FIXED', 'PER_UNIT']), amount: decimal, currencyMode: z.literal('COMPONENT_CURRENCY')}).strict(),
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
              tokenId: decimal,
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
const adjustmentPath = '/v1/cart/adjustments';
const assignmentPath = `${adjustmentPath}/assignments`;
const definitionResult = z.object({id: z.string(), code: z.string(), phase: z.string(), effect: z.literal('CHARGE')}).passthrough();
const assignmentResult = z.object({id: z.string(), adjustmentId: z.string(), priority: z.number()}).passthrough();
const disabledResult = z.object({id: z.string(), disabled: z.literal(true)});
const apiError = z.object({error: z.object({message: z.string(), code: z.string().optional()})});
const parseAdjustmentId = (value: string): string => {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error('Invalid adjustment ID.');
  return value;
};

async function requestAdjustment(options: Options, path: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown): Promise<unknown> {
  const storage = storageOptions(options);
  const client = accountClient(storage);
  const stored = await client.auth.getSession();
  if (stored === null) throw new RareAuthError('authentication_required');
  const session = stored.expiresAt > Date.now() + 30_000 ? stored : await client.auth.refresh();
  const response = await fetch(new URL(path, storage.apiBaseUrl), {
    method, redirect: 'error', signal: AbortSignal.timeout(30_000),
    headers: {Accept: 'application/json', Authorization: `Bearer ${session.accessToken}`,
      ...(body === undefined ? {} : {'Content-Type': 'application/json'})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const parsed = apiError.safeParse(payload);
    throw new RareApiError(parsed.data?.error.message ?? response.statusText, response.status, path, parsed.data?.error.code);
  }
  return payload;
}

async function listAdjustments<Item>(options: Options & {phase?: string; page?: number; perPage?: number; adjustmentId?: string}, path: string, item: z.ZodType<Item>): Promise<{data: Item[]; pagination: {page: number; perPage: number; hasNextPage: boolean}}> {
  const {page = 1, perPage = 20} = options;
  const query = new URLSearchParams({page: String(page), perPage: String(perPage)});
  const phase = phaseInput(options.phase);
  if (phase !== undefined) query.set('phase', phase);
  if (options.adjustmentId !== undefined) query.set('adjustmentId', parseAdjustmentId(options.adjustmentId));
  const result = z.object({data: z.array(item), hasNextPage: z.boolean()}).parse(
    await requestAdjustment(options, `${path}?${query}`, 'GET'),
  );
  return {data: result.data, pagination: {page, perPage, hasNextPage: result.hasNextPage}};
}

const command = (name: string): Command => addChainOptions(accountCommand(name));
const phaseInput = (value?: string): 'LISTING_CONFIGURATION' | 'CHECKOUT' | undefined => {
 if (value !== undefined && value !== 'LISTING_CONFIGURATION' && value !== 'CHECKOUT') throw new Error('Invalid adjustment phase.'); return value;
};
const consent = (options: {yes?: boolean}): void => {if (options.yes !== true) throw new Error('Adjustment changes require --yes.');};
export function cartAdjustmentsCommand(): Command {
 const adjustments = new Command('adjustments').description('Manage reusable platform charges and scoped assignments. Requires administrator access.');
 adjustments.addCommand(command('create').description('Create a reusable charge definition without applying it').requiredOption('--input <path>', 'JSON definition; fixed amounts use decimal strings').option('--yes', 'confirm creating the definition').action(async (options: Options & {input: string; yes?: boolean}) => {
  consent(options); const raw: unknown = JSON.parse(await readFile(options.input, 'utf8')); const input = definition.parse(raw);
  const chainId = String(chainIds[getActiveChain(options.chain, options.chainId)]);
  const value = z.object({data: definitionResult}).parse(await requestAdjustment(options, adjustmentPath, 'POST', {...input, chainId})).data; output(value, () => {console.log(`${value.id}: ${value.code} (${value.phase}, ${value.effect})`);});
 }));
 adjustments.addCommand(command('list').option('--phase <phase>', 'LISTING_CONFIGURATION or CHECKOUT').option('--page <number>', 'page starting at 1', Number).option('--per-page <number>', 'results per page', Number).action(async (options: Options & {phase?: string;page?: number;perPage?: number}) => {
  const page = await listAdjustments(options, adjustmentPath, definitionResult);
  output(page, () => {for (const value of page.data) console.log(`${value.id}: ${value.code} (${value.phase}, ${value.effect})`);});
 }));
 const assignments = new Command('assignments').description('Apply existing definitions to SKUs, collections or checkout scopes');
 assignments.addCommand(command('create').requiredOption('--input <path>', 'JSON assignment with adjustmentId, scope and priority').option('--yes', 'confirm applying the adjustment').action(async (options: Options & {input: string;yes?: boolean}) => {
  consent(options); const raw: unknown = JSON.parse(await readFile(options.input, 'utf8')); const input = assignment.parse(raw);
  const scope = {
    ...input.scope,
    chainIds: input.scope.chainIds?.map(String),
    collections: input.scope.collections?.map(value => ({...value, chainId: String(value.chainId)})),
    nfts: input.scope.nfts?.map(value => ({...value, chainId: String(value.chainId)})),
  };
  const value = z.object({data: assignmentResult}).parse(await requestAdjustment(options, assignmentPath, 'POST', {...input, scope})).data; output(value, () => {console.log(`${value.id}: adjustment ${value.adjustmentId}, priority ${value.priority}`);});
 }));
 assignments.addCommand(command('list').option('--adjustment-id <id>', 'filter by reusable definition ID').option('--phase <phase>', 'LISTING_CONFIGURATION or CHECKOUT').option('--page <number>', 'page starting at 1', Number).option('--per-page <number>', 'results per page', Number).action(async (options: Options & {adjustmentId?: string;phase?: string;page?: number;perPage?: number}) => {
  const page = await listAdjustments(options, assignmentPath, assignmentResult);
  output(page, () => {for (const value of page.data) console.log(`${value.id}: adjustment ${value.adjustmentId}, priority ${value.priority}`);});
 }));
 assignments.addCommand(command('disable').requiredOption('--id <id>', 'assignment ID').option('--yes', 'confirm disabling this assignment').action(async (options: Options & {id: string;yes?: boolean}) => {
  consent(options); const value = z.object({data: disabledResult}).parse(await requestAdjustment(options, `${assignmentPath}/${parseAdjustmentId(options.id)}`, 'DELETE')).data; output(value, () => {console.log(`Disabled adjustment assignment ${value.id}`);});
 }));
 adjustments.addCommand(assignments); return adjustments;
}
