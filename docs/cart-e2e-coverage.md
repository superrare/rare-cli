# Cart and print CLI live coverage

These suites invoke the built CLI against a deployed Rare API and Sepolia. They create their own inventory. Physical fulfillment requires Rare API and Pipelines configured for the same Prodigi sandbox and `PRODIGI_SANDBOX_API_KEY` for independent order verification.

| Happy path | Live suite |
| --- | --- |
| Free ERC-721 transfer plus mint, purchase notifications, private order history | `cart-free.test.ts` |
| Product/variant discovery, pagination, draft visibility and archive removal | `cart-catalog.test.ts` |
| Multiple saved addresses, default switching, updates, deletion and account isolation | `shipping-addresses.test.ts` |
| ERC-721 transfer, multi-item checkout, seller cancellation | `cart.test.ts` |
| Multiple sellers and settlement currencies; royalties | `cart.test.ts` |
| ERC-1155 transfer and mint; ERC-721 mint | `cart-fulfillment-kinds.test.ts` |
| Fee consolidation and 64-item admission | `cart-fulfillment-kinds.test.ts` |
| Seller-signed splits in ETH and RARE, buyer pays USDC | `cart-splits.test.ts` |
| Exact-input/output swaps and NFT plus swap | `cart-swaps.test.ts` |
| Holder, primary-sale and every-sale claims for both NFT standards | `eligibility-standards.test.ts` |
| Claim issuance, reservation, consumption and removing a listing gate | `eligibility.test.ts` |
| Public product catalog and file guidance | `print-products.test.ts` |
| Private/public uploads, authoring, quantities, saved shipping, hosted card session, replacement master snapshots | `prints.test.ts` |
| Print-only, NFT plus print Product, and post-purchase claimed print; buyer-selected formats, private order history and app notifications | `print-fulfillment.test.ts` |
| Two-copy print purchase within the creator limit | `print-quantity.test.ts` |
| Planned artwork Products, blind NFT-only mint, then blind mint plus correct print | `blind-print-products.test.ts` |

Routine print journeys purchase one copy with a 25 USDC spending ceiling each. The separate `test:print-quantity:e2e` command purchases two copies with a 50 USDC ceiling. These ceilings stop unexpectedly expensive quotes before payment; they are not expected purchase prices. The last two fulfillment suites verify seller-signed print splits through actual collaborator balance changes, Cart split events and indexed allocations. The blind suite applies splits to both NFT and print Listings. It confirms that minting without a print advances the sequence, then independently checks that Prodigi receives the second artwork's private production asset. Production and shipping remain separate buyer-funded charges.

Run the entire commerce coverage serially:

```sh
npm run test:commerce:e2e
```

Run the print journeys only:

```sh
npm run test:prints:e2e
```

These commands build and typecheck the CLI first. Selected live suites require working credentials and services; missing prerequisites are failures, not evidence of a passing deployment. Test-wallet spending checks run before payment. Run suites serially to avoid funded-wallet nonce contention.

## Recovery scope

CLI coverage already includes exhausted claims, invalid authorization, insufficient funds and capacity rejection. SDK contract tests exercise retained signatures, failed persistence and lost HTTP responses deterministically. The frontend release journal separately covers interruption between NFT and print publication and wallet changes. The CLI does not currently expose that browser journal or a retained-signature resume command, so those tests must not be described as CLI recovery coverage.

The hosted card-session test verifies sandbox session creation and a pending private order, without submitting a card payment. Purchase-notification assertions check the buyer and seller app inboxes, not email delivery. Interactive card payment requires browser/provider QA; this CLI suite does not claim card payment coverage. Carrier-confirmed delivery is outside these suites; Prodigi acceptance and available tracking are verified. Linked-wallet scenarios require an explicitly linked test-account fixture. These are coverage boundaries, not inferred success.
