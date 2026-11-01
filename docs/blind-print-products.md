# Test a blind mint with an optional print

Run `npm run test:blind-prints:e2e` after deploying the matching Rare API and Pipelines stack. This is a live write test, not a simulation. It deploys a collection, uploads files, publishes listings, spends testnet USDC, and creates one Prodigi sandbox order.

Configure the existing live test wallet pool and RPC settings, `RARE_API_BASE_URL`, and `PRODIGI_SANDBOX_API_KEY`. The provider key must start with `test_`. Rare API and Pipelines must use the same sandbox configuration. The Cart and factory must be registered for indexing in that deployment, and Pipelines must have permission to sign private production-file download URLs. The creator and buyer must have accounts in that deployment. The buyer needs at least 60 test USDC, and both wallets need Sepolia ETH for gas. Missing prerequisites fail the selected test.

The test uses the real LazySovereign factory and the CLI's `collection prepare-lazy-mint` command. This is the release contract used by the website. It approves Cart as a minter; it does not replace the collection with test bytecode or require a separate NFT receipt contract.

The creator setup performs these operations through the CLI:

1. Deploy a two-token collection and prepare its ordered metadata batch.
2. Create one Product per future artwork and add an NFT variant with `plannedNft: {chainId, contract, tokenId}` before minting.
3. Upload a different private production file and public photo for each artwork. Create the print draft with that existing `productId`, configure its price, and publish the Product.
4. Publish the collection's ERC-721 mint Listing. This Listing represents minting the next token, not a promise to mint a specific token ID.
5. Publish a physical Listing with `mintSource: {chainId, contract, productIds}` identifying the prepared artwork Products. All candidates use the same print specification and sale price.
6. Attach the physical offer SKU to the mint-offering Product with public membership metadata `{printDropId}`. Buyers can discover both Listings through that Product; the physical Listing already supplies its preparation ID.

Product IDs are positive decimal strings, distinct from print draft and preparation UUIDs. Planned NFT memberships remain `isHidden: true` until the actual mint is indexed.

The buyer first purchases an NFT without a print, consuming token 1. The next checkout buys an NFT and optional print with this additional field in its `--input` JSON document:

```json
{
  "items": [
    { "kind": "listing", "listingDigest": "<NFT mint Listing digest>", "quantity": "1" },
    { "kind": "listing", "listingDigest": "<physical Listing digest>", "quantity": "1" }
  ],
  "mintSelections": [
    {
      "preparationId": "<physical Listing preparation ID>",
      "listingDigest": "<NFT mint Listing digest>",
      "unitIndexes": [0]
    }
  ]
}
```

Supply `--shipping-input` or `--saved-address-id` as for other physical checkout. The CLI passes `mintSelections` through the SDK's delivery input. It does not predict the next token ID or choose its print file.

The test checks the actual minted token and owner, reuse and visibility of the planned NFT variant, Cart fees and receipt, mixed-order history, and the independently fetched Prodigi sandbox order. It verifies that the provider received token 2's production file, not the first Product's file. Output includes public transaction and order identifiers only.

The checkout preview bounds the second purchase to 50 USDC before payment. Local CLI checks validate command parsing and transport, but do not prove the deployed mint-to-print fulfillment path. Report the live result separately after running against the rebuilt feature deployment.
