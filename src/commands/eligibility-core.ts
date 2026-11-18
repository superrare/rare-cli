import { isAddress, isHex } from 'viem';
import { z } from 'zod';

const addressSchema = z.string().refine(isAddress, 'Expected an Ethereum address');
const skuSchema = z.string().refine((value) => isHex(value) && value.length === 66, 'Expected a bytes32 SKU');
const tokenIdSchema = z.string().regex(/^\d+$/);

/** Validate creator input before opening credentials or sending API requests. */
const eligibilityRuleInputSchema = z.object({
  definition: z.object({
    kind: z.enum(['PRIMARY_SALE', 'EVERY_SALE', 'CURRENT_HOLDER']),
    source: z.object({
      chainId: tokenIdSchema,
      tokenContract: addressSchema,
      tokenIds: z.array(tokenIdSchema).max(1000).optional(),
    }),
    targets: z.array(z.object({ sku: skuSchema, tokenId: tokenIdSchema.optional() })).min(1).max(100),
    claimExpiresAt: z.iso.datetime().optional(),
  }),
  effectiveFrom: z.iso.datetime().optional(),
});

export function parseEligibilityRuleInput(value: unknown): z.infer<typeof eligibilityRuleInputSchema> {
  return eligibilityRuleInputSchema.parse(value);
}

export function parseEligibilityRuleId(value: unknown): string {
  return z.uuid().parse(value);
}
