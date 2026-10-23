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

All three kinds support ERC-721 and ERC-1155 sources. Each qualifying copy grants one right. Purchase rights remain with the buyer after a transfer. `CURRENT_HOLDER` transfers unused rights first and never recreates consumed rights.

Issuance supports at most 100 rights per source event. Initial holder snapshots also support at most 100 rights. Larger operations fail atomically instead of issuing partial rights. A wallet can receive rights from multiple events, so this is not a lifetime wallet limit.

```sh
rare eligibility rules create --input ./rule.json --chain sepolia --json
rare eligibility rules list --take 20 --skip 0 --json
rare cart listing create --input ./cart-listings.json --eligibility-rule-id <id> --chain sepolia --yes
rare eligibility listings require --listing-digest 0x... --rule-id <id> --chain sepolia
rare eligibility claims list --rule-id <id> --json
rare eligibility listings clear --listing-digest 0x... --chain sepolia
rare eligibility rules disable --rule-id <id>
```

Listing requirements affect new checkout authorizations. Disabling a rule does not cancel an already-signed Order. Reservation and consumption happen through the normal Cart checkout commands, not separate claim mutation commands.

Use `cart listing create --eligibility-rule-id` for a newly gated Listing. The API attaches its requirement atomically during publication. The separate `eligibility listings require` command changes an existing Listing and cannot cancel an Order already signed while it was open.

For existing holders, include `definition.source.tokenIds` with a `CURRENT_HOLDER` rule. The API initializes those holders at a confirmed block. Collection-wide rules without token IDs apply to future events. Historical purchase backfills are not included.

Run `npm run test:eligibility:e2e` after deploying the eligibility API. The suite uses the existing Cart test wallet pool with distinct registered creator and buyer accounts. Missing credentials or endpoints fail the selected suite.

The lifecycle case creates three NFTs and their creator-owned SKUs, publishes an open source Listing and two gated reward Listings, then buys the source through the built CLI. It polls the buyer's claims until one is `AVAILABLE`, redeems one reward, and waits for that same claim to become `CONSUMED`. The second reward stays in stock and must be rejected for insufficient claims. The rule only watches the source token, so redemption cannot generate a replacement claim.

The suite sends live Sepolia transactions with a quoted test budget of 0.001 ETH per purchase before network gas. Cleanup disables the rule, revokes sessions, releases wallet leases, and removes test-local files. Eligibility endpoints are checked before deploying assets.

The standards suite exercises all three rules for both standards. It buys five edition copies, consumes two rights through an on-chain reward Listing, and transfers unused rights between accounts. It also checks that a later sale grants new rights only for `EVERY_SALE`.
