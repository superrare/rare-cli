import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { z } from "zod";
import { isAddress, type Address } from "viem";
import {
  createRareClient,
  type CartFee,
  type CartFeeCreateParams,
  type RareClient,
} from "@rareprotocol/rare-sdk";
import {
  accountCommand,
  storageOptions,
  type AccountCommandOptions,
} from "../auth-cli.js";
import { createAuthStore } from "../auth-storage.js";
import { getPublicClient } from "../client.js";
import { getActiveChain } from "../config.js";
import { output } from "../output.js";
import { addChainOptions, type ChainOptions } from "./options.js";
type Options = AccountCommandOptions & ChainOptions;
const address = z.custom<Address>(
  (input) => typeof input === "string" && isAddress(input),
);
const decimal = z.string().regex(/^(0|[1-9][0-9]*)$/);
const configuration = z
  .object({
    phase: z.enum(["LISTING_CONFIGURATION", "CHECKOUT"]),
    code: z.string(),
    priority: z.number(),
    calculation: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("PERCENTAGE"),
        basisPoints: z.number(),
        currencyMode: z.literal("COMPONENT_CURRENCY"),
      }),
      z.object({
        type: z.enum(["FIXED", "PER_UNIT"]),
        amount: decimal.transform(BigInt),
        currencyMode: z.literal("COMPONENT_CURRENCY"),
      }),
    ]),
    recipient: z.discriminatedUnion("type", [
      z.object({ type: z.literal("FIXED"), address }),
      z.object({ type: z.literal("TOKEN_CREATOR") }),
    ]),
    scope: z
      .object({
        chainIds: z.array(z.number()).optional(),
        sellerAddresses: z.array(address).optional(),
        skus: z.array(z.string()).optional(),
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
      .optional(),
    validFrom: z.string().nullable().optional(),
    validUntil: z.string().nullable().optional(),
  })
  .strict();
const client = (options: Options): RareClient =>
  createRareClient({
    publicClient: getPublicClient(
      getActiveChain(options.chain, options.chainId),
    ),
    apiBaseUrl: options.apiUrl,
    sessionStore: createAuthStore(storageOptions(options)),
  });
const show = (fee: CartFee): void => {
  console.log(
    `${fee.id}: ${fee.code} (${fee.phase}), priority ${fee.priority}`,
  );
};
export function cartFeesCommand(): Command {
  const fees = new Command("fees").description(
    "Manage platform fees. Requires an authorized account user ID.",
  );
  fees.addCommand(
    addChainOptions(accountCommand("create"))
      .description(
        "Create a fee rule and scoped assignment; higher priority overrides the same code",
      )
      .requiredOption(
        "--input <path>",
        "JSON fee configuration; fixed amounts and NFT token IDs use decimal strings",
      )
      .option("--yes", "confirm the fee configuration change")
      .action(async (options: Options & { input: string; yes?: boolean }) => {
        if (options.yes !== true)
          throw new Error(
            "cart fees create requires --yes to confirm the platform fee change.",
          );
        const raw: unknown = JSON.parse(await readFile(options.input, "utf8"));
        const input: CartFeeCreateParams = configuration.parse(raw);
        const fee = await client(options).cart.fees.create(input);
        output(fee, () => {
          show(fee);
        });
      }),
  );
  fees.addCommand(
    addChainOptions(accountCommand("list"))
      .option("--phase <phase>", "LISTING_CONFIGURATION or CHECKOUT")
      .option("--page <number>", "page starting at 1", Number)
      .option("--per-page <number>", "results per page", Number)
      .action(
        async (
          options: Options & {
            phase?: string;
            page?: number;
            perPage?: number;
          },
        ) => {
          const phase = options.phase;
          if (
            phase !== undefined &&
            phase !== "LISTING_CONFIGURATION" &&
            phase !== "CHECKOUT"
          )
            throw new Error("Invalid fee phase.");
          const page = await client(options).cart.fees.list({
            phase,
            page: options.page,
            perPage: options.perPage,
          });
          output(page, () => {
            for (const fee of page.data) show(fee);
          });
        },
      ),
  );
  fees.addCommand(
    addChainOptions(accountCommand("disable"))
      .requiredOption("--id <id>", "fee assignment ID")
      .option("--yes", "confirm disabling this fee assignment")
      .action(async (options: Options & { id: string; yes?: boolean }) => {
        if (options.yes !== true)
          throw new Error(
            "cart fees disable requires --yes to confirm the platform fee change.",
          );
        const result = await client(options).cart.fees.disable(options.id);
        output(result, () => {
          console.log(`Disabled fee assignment ${result.id}`);
        });
      }),
  );
  return fees;
}
