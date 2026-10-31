import { z } from 'zod';

const uuid = z.uuid();
const uint = z.string().regex(/^(0|[1-9][0-9]*)$/u);
const address = z.templateLiteral(['0x', z.string()]).refine(value => /^0x[0-9a-fA-F]{40}$/u.test(value));
const bytes32 = z.templateLiteral(['0x', z.string()]).refine(value => /^0x[0-9a-fA-F]{64}$/u.test(value));

export function parseCommerceUuid(value: unknown): string {
  return uuid.parse(value);
}

export function parsePrintPrice(value: unknown): string {
  return uint.parse(value);
}

export const shippingDetailsInput = z.object({
  name: z.string(), email: z.email(), phoneNumber: z.string(), addressLine1: z.string(),
  addressLine2: z.string().default(''), townOrCity: z.string(), stateOrCounty: z.string().default(''),
  postalOrZipCode: z.string().default(''), countryCode: z.string().regex(/^[A-Z]{2}$/u),
}).strict();

export const savedShippingInput = z.object({
  id: uuid, label: z.string().optional(), details: shippingDetailsInput, makeDefault: z.boolean().optional(),
}).strict();

export const printDropInput = z.object({
  idempotencyKey: uuid, name: z.string(), description: z.string().optional(),
  chainId: z.literal('11155111'),
  print: z.object({
    name: z.string(), description: z.string(), tags: z.array(z.string()),
    productionUploadKey: z.string().regex(/^[0-9a-f]{64}$/u), images: z.array(z.url()).min(1).max(4),
    specificationId: z.string(), sourceUniversalTokenId: z.string().optional(),
  }).strict(),
}).strict();

export const printListingInput = z.object({
  optionId: uuid, seller: address, listingSalt: bytes32, deadline: uint, availableQuantity: uint,
  eligibilityRuleId: uuid.optional(),
  maxQuantityPerCheckout: z.string().regex(/^[1-9][0-9]*$/u)
    .pipe(z.string().refine(value => BigInt(value) <= 1000n, 'Print checkouts support at most 1000 copies')).optional(),
}).strict();

export const printDraftPatch = z.object({
  name: z.string().optional(), description: z.string().optional(), tags: z.array(z.string()).optional(),
  images: z.array(z.url()).min(1).max(4).optional(), productionUploadKey: z.string().regex(/^[0-9a-f]{64}$/u).optional(),
  specificationId: z.string().optional(),
}).strict();
