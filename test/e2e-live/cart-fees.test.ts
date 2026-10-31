import { randomBytes } from "node:crypto";
import { writeFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAuthStore } from "../../src/auth-storage.js";
import { runCli, parseJsonStdout, withTempHome } from "../helpers/cli.js";
const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === "")
    throw new Error(`${name} is required for fee administration E2E.`);
  return value;
};
describe("built fee administration CLI against a real Rare API", () => {
  it("requires consent and a permitted user ID, creates an override, lists it and disables it", async () => {
    await withTempHome(async (temporary) => {
      const home = await realpath(temporary),
        baseUrl = required("RARE_API_BASE_URL"),
        directory = join(home, "auth");
      const scope = {
        apiBaseUrl: baseUrl,
        authBaseUrl: `${baseUrl}/auth/v2`,
        clientId: "rare-sdk",
      };
      const store = createAuthStore({ ...scope, backend: "file", directory });
      const authenticate = async (token: string): Promise<void> =>
        await store.withLock(
          async () =>
            await store.set({
              ...scope,
              revision: randomBytes(16).toString("hex"),
              accessToken: token,
              refreshToken: randomBytes(32).toString("hex"),
              expiresAt: Date.now() + 300000,
              scope: "rare:account offline_access",
            }),
        );
      await authenticate(required("RARE_API_AUTH_TOKEN"));
      const file = join(home, "fee.json");
      await writeFile(
        file,
        JSON.stringify({
          phase: "LISTING_CONFIGURATION",
          code: "GALLERY_COMMISSION",
          priority: 100,
          calculation: {
            type: "PERCENTAGE",
            basisPoints: 250,
            currencyMode: "COMPONENT_CURRENCY",
          },
          recipient: {
            type: "FIXED",
            address: "0x1111111111111111111111111111111111111111",
          },
          scope: {
            collections: [
              {
                chainId: 11155111,
                contract: `0x${randomBytes(20).toString("hex")}`,
              },
            ],
          },
        }),
      );
      const auth = [
        "--chain",
        "sepolia",
        "--api-url",
        baseUrl,
        "--storage",
        "file",
        "--auth-directory",
        directory,
      ];
      const withoutConsent = await runCli(
        ["--json", "cart", "fees", "create", "--input", file, ...auth],
        { home },
      );
      expect(withoutConsent.code).toBe(1);
      expect(withoutConsent.stderr).toContain("--yes");
      const created = z
        .object({ id: z.string(), chargeSku: z.string() })
        .parse(
          parseJsonStdout(
            await runCli(
              [
                "--json",
                "cart",
                "fees",
                "create",
                "--input",
                file,
                "--yes",
                ...auth,
              ],
              { home },
            ),
          ),
        );
      try {
        const page = z
          .object({ data: z.array(z.object({ id: z.string() })) })
          .parse(
            parseJsonStdout(
              await runCli(
                [
                  "--json",
                  "cart",
                  "fees",
                  "list",
                  "--per-page",
                  "100",
                  ...auth,
                ],
                { home },
              ),
            ),
          );
        expect(page.data.some((fee) => fee.id === created.id)).toBe(true);
        await authenticate(required("RARE_API_NON_ADMIN_AUTH_TOKEN"));
        const forbidden = await runCli(
          [
            "--json",
            "cart",
            "fees",
            "disable",
            "--id",
            created.id,
            "--yes",
            ...auth,
          ],
          { home },
        );
        expect(forbidden.code).toBe(1);
        expect(forbidden.stdout + forbidden.stderr).toMatch(
          /403|forbidden|administrator/i,
        );
      } finally {
        await authenticate(required("RARE_API_AUTH_TOKEN"));
        expect(
          parseJsonStdout(
            await runCli(
              [
                "--json",
                "cart",
                "fees",
                "disable",
                "--id",
                created.id,
                "--yes",
                ...auth,
              ],
              { home },
            ),
          ),
        ).toMatchObject({ id: created.id, disabled: true });
      }
    });
  }, 60000);
});
