import { z } from 'zod';
import { isAddress, isAddressEqual, zeroAddress } from 'viem';

const uuid = z.uuid();
const productId = z.string().regex(/^[1-9][0-9]*$/u);
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
  idempotencyKey: uuid.optional(), productId: productId.optional(), name: z.string(), description: z.string().optional(),
  chainId: z.literal('11155111'),
  print: z.object({
    name: z.string(), description: z.string(), tags: z.array(z.string()),
    productionUploadKey: z.string().regex(/^[0-9a-f]{64}$/u), images: z.array(z.url()).min(1).max(4),
    specificationId: z.string(), sourceUniversalTokenId: z.string().optional(),
  }).strict(),
}).strict();

const printListingSplit = z.object({
  recipient: address.refine(value => isAddress(value, { strict: false }) && !isAddressEqual(value, zeroAddress),
    'Split recipients must be valid nonzero addresses'),
  basisPoints: z.number().int().min(1).max(10000),
}).strict();
const printListingSplits = z.array(printListingSplit).max(16)
  .refine(splits => splits.length === 0 || splits.reduce((total, split) => total + split.basisPoints, 0) === 10000,
    'Split basis points must sum to 10000')
  .refine(splits => new Set(splits.map(split => split.recipient.toLowerCase())).size === splits.length,
    'Split recipients must be unique');

const printListingFields = z.object({
  optionId: uuid, seller: address, listingSalt: bytes32.optional(), deadline: uint, availableQuantity: uint,
  eligibilityRuleId: uuid.optional(),
  mintSource: z.object({ chainId: z.string().regex(/^[1-9][0-9]*$/u), contract: address,
    productIds: z.array(productId).min(1).max(1000),
  }).strict().optional(),
  splits: printListingSplits.optional(),
  maxQuantityPerCheckout: z.string().regex(/^[1-9][0-9]*$/u)
    .pipe(z.string().refine(value => BigInt(value) <= 1000n, 'Print checkouts support at most 1000 copies')).optional(),
}).strict();

export const conciergePrintListingInput = printListingFields.omit({
  seller: true,
  optionId: true,
  mintSource: true,
});

export const printListingInput = printListingFields.refine(value => value.splits?.[0] === undefined ||
  !isAddress(value.seller, { strict: false }) || !isAddress(value.splits[0].recipient, { strict: false }) ||
  isAddressEqual(value.splits[0].recipient, value.seller),
  { message: 'Print splits must start with the seller', path: ['splits'] });

export const printDraftPatch = z.object({
  name: z.string().optional(), description: z.string().optional(), tags: z.array(z.string()).optional(),
  images: z.array(z.url()).min(1).max(4).optional(), productionUploadKey: z.string().regex(/^[0-9a-f]{64}$/u).optional(),
  specificationId: z.string().optional(),
}).strict();

export const printQuoteInput = z.object({
  specificationId: z.string().min(1), copies: z.number().int().positive().optional(),
  destinationCountryCode: z.string().regex(/^[A-Z]{2}$/u), shippingMethod: z.literal('Standard').optional(),
}).strict();
