# Manage purchase eligibility

Sign in with `rare auth login` before using eligibility commands. The commands share the Cart account session and support `--api-url`, `--storage`, and `--auth-directory`.

Create a JSON rule file with your source collection and target SKU:

```json
{
	"definition": {
		"kind": "PRIMARY_SALE",
		"source": {
			"chainId": "11155111",
			"tokenContract": "0x1111111111111111111111111111111111111111"
		},
		"targets": [{ "sku": "0x2222222222222222222222222222222222222222222222222222222222222222" }]
	}
}
```

Replace the example contract and SKU with assets you control. Supported rule kinds are `PRIMARY_SALE`, `EVERY_SALE`, and `CURRENT_HOLDER`.

```sh
rare eligibility rules create --input ./rule.json --chain sepolia --json
rare eligibility rules list --take 20 --skip 0 --json
rare eligibility listings require --listing-digest 0x... --rule-id <id> --chain sepolia
rare eligibility claims list --rule-id <id> --json
rare eligibility listings clear --listing-digest 0x... --chain sepolia
rare eligibility rules disable --rule-id <id>
```

Listing requirements affect new checkout authorizations. Disabling a rule does not cancel an already-signed Order. Reservation and consumption happen through the normal Cart checkout commands, not separate claim mutation commands.

Run `npx vitest run test/e2e-live/eligibility.test.ts` after deploying the eligibility API. The suite uses the existing Cart test wallet configuration and creates its own collection and SKU. Missing credentials or endpoints fail the selected suite.
