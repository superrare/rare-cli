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
  universalTokenId: z.string().optional(), chainId: z.literal('11155111').optional(),
  print: z.object({
    name: z.string(), description: z.string(), tags: z.array(z.string()),
    productionUploadKey: z.string().regex(/^[0-9a-f]{64}$/u), images: z.array(z.url()).min(1),
    specificationId: z.string(),
  }).strict().optional(),
}).strict();

export const printListingInput = z.object({
  optionId: uuid, seller: address, listingSalt: bytes32, deadline: uint, availableQuantity: uint,
  fulfillmentKind: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(5)]),
}).strict();
