# Preservation Seller Service

This CLI now expects a separate hosted preservation service for paid IPFS backup flows. The service is not part of `rare-cli`; this document captures the buyer-facing contract and the intended x402 seller responsibilities.

## Responsibilities

- Accept unpaid preservation quote requests.
- Challenge paid upload-session requests with `402 Payment Required`.
- Verify `x402` payments in `RARE` on one of:
  - `mainnet`
  - `sepolia`
  - `base`
  - `base-sepolia`
- Return upload targets after payment succeeds.
- Verify uploaded byte counts and SHA-256 hashes against the quoted asset descriptors.
- Pin verified bytes to IPFS.
- Assemble and pin a preservation manifest.
- Return a private receipt to the payer.

## Expected Routes

- `POST /v1/preservations/quotes`
- `POST /v1/preservations/quotes/:quoteId/upload-session`
- `POST /v1/preservations/quotes/:quoteId/finalize`
- `GET /v1/preservations/receipts/:receiptId`

## Quote Request Shape

```json
{
  "source": {
    "chain": "sepolia",
    "chainId": 11155111,
    "contractAddress": "0x...",
    "tokenId": "1",
    "universalTokenId": "11155111-0x...-1",
    "tokenUri": "ipfs://..."
  },
  "assets": [
    {
      "assetId": "asset_0000",
      "role": "metadata",
      "originalUri": "ipfs://...",
      "filename": "metadata.json",
      "mimeType": "application/json",
      "size": 1234,
      "sha256": "..."
    }
  ],
  "preferredPaymentChain": "base"
}
```

## Quote Response Shape

```json
{
  "quoteId": "quote_123",
  "expiresAt": "2026-01-01T00:00:00.000Z",
  "billableBytes": 1234,
  "tokenAmount": "86000460000000",
  "ratePerByteAtomic": "69690000000",
  "source": {},
  "assets": [],
  "acceptedPayments": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "asset": "0x691077c8e8de54ea84efd454630439f99bd8c92f",
      "payTo": "0xReceivingWallet",
      "amount": "86000460000000",
      "maxTimeoutSeconds": 300,
      "extra": null
    }
  ]
}
```

## Finalize Response Shape

`POST /v1/preservations/quotes/:quoteId/finalize` should return a receipt payload. The CLI can derive fallback values for the manifest gateway link and quote expiration, but sellers should prefer returning them explicitly:

```json
{
  "receiptId": "receipt_123",
  "quoteId": "quote_123",
  "expiresAt": "2026-01-01T00:05:00.000Z",
  "manifestCid": "bafy...",
  "manifestIpfsUrl": "ipfs://bafy...",
  "manifestGatewayUrl": "https://your.gateway/ipfs/bafy...",
  "billableBytes": 1234,
  "payment": {},
  "assets": [],
  "source": {},
  "createdAt": "2026-01-01T00:01:00.000Z"
}
```

## Pricing

- Rate: `0.00006969 RARE / kb`
- `kb` is `1000` bytes
- Billing is exact-bytes, not rounded buckets
- Atomic rate: `69_690_000_000`
- Formula: `totalChargeAtomic = totalBillableBytes * 69_690_000_000`

## x402 Notes

- The CLI buyer uses the official `@x402/fetch` and `@x402/evm` packages.
- The hosted seller should use the official `x402` seller middleware/helpers.
- The service should advertise the `payment-identifier` extension so retries can be de-duplicated safely.
- The monetized boundary is the hosted service. The CLI is open source and can be forked; payment enforcement only applies to the hosted seller.
