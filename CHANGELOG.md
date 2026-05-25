# Changelog

## 1.1.0

### Fixes

- Cleaned up integration test dependencies by @KeeganEad in https://github.com/superrare/rare-cli/pull/76.
- Routed command errors through the top-level handler by @KeeganEad in https://github.com/superrare/rare-cli/pull/77.

### New features

- Added the sdk-parity MCP server by @KeeganEad in https://github.com/superrare/rare-cli/pull/79.

### Maintenance

- Moved the config filesystem test to integration by @KeeganEad in https://github.com/superrare/rare-cli/pull/78.

**Full changelog**: https://github.com/superrare/rare-cli/compare/v1.0.2...v1.1.0

## 1.0.2

### Fixes

- Read the CLI `--version` output from `package.json` instead of a hardcoded string.

**Full changelog**: https://github.com/superrare/rare-cli/compare/v1.0.1...v1.0.2

## 1.0.1

### Fixes

- Validated persisted private keys when reading wallet configuration.
- Stopped loading `.env` files from the current working directory when running the CLI.
- Honored the configured default chain when generating wallets.
- Failed closed when allowance reads error instead of continuing with unsafe approval assumptions.
- Failed approval consent prompts explicitly when consent cannot be confirmed.
- Validated release allowlists before upload.
- Removed stale Base batch auction house metadata.
- Fixed the lint entrypoint, swap receipt fixture, and live suite regressions.
- Fixed configuring Uniswap API keys.
- Fixed RareMinter approval handling in release configuration.
- Made collection status reads best effort for collection commands and SDK collection status flows.

### Maintenance

- Added TypeScript checking for tests.
- Added targeted SDK boundary coverage for package exports, client API shaping, liquid validation, and Uniswap API behavior.
- Removed the stale CLI overview document.

**Full changelog**: https://github.com/superrare/rare-cli/compare/v1.0.0...v1.0.1

## 1.0.0

### Breaking changes

- Removed the package root runtime export. Import SDK APIs from explicit subpaths instead.
- Moved contract metadata exports out of `@rareprotocol/rare-cli/client` and into `@rareprotocol/rare-cli/contracts`.
- Moved collection deployment and minting under `rare.collection`.
- Renamed marketplace status methods from `getStatus` to `status`.
- Renamed marketplace amount inputs to `price` for auctions, offers, and listing purchases.
- Replaced auction `duration` inputs with absolute `endTime` inputs.
- Replaced cursor-style search pagination with page-based API pagination.
- Removed the offer `convertible` input and status field.
- Replaced token read helpers with `rare.token.status`.
- Tightened `NftAttribute.trait_type` from optional to required.
- Changed `TokenContractInfo.totalSupply` from `bigint` to `bigint | null`.

### Migration guide

#### Imports

```ts
// Before
import {
  createRareClient,
  auctionAbi,
  chainIds,
  getContractAddresses,
  type SupportedChain,
} from '@rareprotocol/rare-cli/client';

// After
import { createRareClient } from '@rareprotocol/rare-cli/client';
import {
  auctionAbi,
  chainIds,
  getContractAddresses,
  type SupportedChain,
} from '@rareprotocol/rare-cli/contracts';
```

The following exports moved to `@rareprotocol/rare-cli/contracts`:

- `SupportedChain`
- `auctionAbi`
- `chainIds`
- `contractAddresses`
- `factoryAbi`
- `getContractAddresses`
- `isSupportedChain`
- `tokenAbi`
- `viemChains`

#### SDK methods

| Before | After |
| --- | --- |
| `rare.deploy.erc721(params)` | `rare.collection.deploy.erc721(params)` |
| `rare.mint.mintTo(params)` | `rare.collection.mint(params)` |
| `rare.auction.getStatus(params)` | `rare.auction.status(params)` |
| `rare.offer.getStatus(params)` | `rare.offer.status(params)` |
| `rare.listing.getStatus(params)` | `rare.listing.status(params)` |
| `rare.token.getContractInfo({ contract })` | `rare.token.status({ contract }).contract` |
| `rare.token.getTokenInfo({ contract, tokenId })` | `rare.token.status({ contract, tokenId }).token` |

#### Parameter updates

```ts
// Auction create
await rare.auction.create({
  contract,
  tokenId,
  price: startingPrice,
  endTime: Math.floor(Date.now() / 1000) + Number(duration),
});

// Auction bid, offer create, offer accept, and listing buy
await rare.auction.bid({ contract, tokenId, price });
await rare.offer.create({ contract, tokenId, price });
await rare.offer.accept({ contract, tokenId, price });
await rare.listing.buy({ contract, tokenId, price });
```

Search responses now use typed data and API pagination:

```ts
// Before
const result = await rare.search.nfts({ take: 24, cursor: 0 });
for (const item of result.items) {}

// After
const result = await rare.search.nfts({ perPage: 24, page: 1 });
for (const nft of result.data) {}
console.log(result.pagination.totalCount);
```

Common search parameter changes:

| Before | After |
| --- | --- |
| `take` | `perPage` |
| `cursor` | `page` |
| `ownerAddresses` | `ownerAddress` |
| `creatorAddresses` | `creatorAddress` |
| `contractAddresses` | `contractAddress` |
| `collectionIds` | `collectionId` |
| `chainIds` | `chainId` |
| `auctionStates` | `auctionState` |

#### CLI commands

| Before | After |
| --- | --- |
| `rare deploy erc721` | `rare collection deploy erc721` |
| `rare mint` | `rare collection mint` |
| `rare list-collections` | `rare collection list --account <address>` |
| `rare search tokens` | `rare search nfts` |
| `rare auction create --starting-price <amount> --duration <seconds>` | `rare auction create --price <amount> --end-time <time>` |
| `rare auction bid --amount <amount>` | `rare auction bid --price <amount>` |
| `rare offer create --amount <amount>` | `rare offer create --price <amount>` |
| `rare offer accept --amount <amount>` | `rare offer accept --price <amount>` |
| `rare listing buy --amount <amount>` | `rare listing buy --price <amount>` |
| `--take <n> --cursor <n>` | `--per-page <n> --page <n>` |

### New features

- Added explicit SDK subpaths: `client`, `contracts`, and `utils`.
- Expanded `rare.collection` with collection reads, lazy collection deployment, batch minting, lazy mint preparation, royalty helpers, and metadata helpers.
- Added batch marketplace flows for listings, offers, and auctions.
- Added RareMinter direct sale release configuration, minting, limits, and allowlist helpers under `rare.listing.release`.
- Added Liquid Edition deployment, status, curve validation, pricing, and render contract helpers.
- Added token swap quotes and execution helpers.
- Added offline Merkle tree and proof utilities through the CLI and SDK.
- Added richer API-backed search for NFTs, collections, events, users, and token prices.
- Added `--json`, `--chain-id`, transaction confirmation prompts, and `--yes` support for write flows.
- Added 1Password private key reference support for wallet configuration.

## 0.4.x

The 0.4 release line provided the initial public CLI and SDK surface.

### Included

- Global `rare` CLI binary.
- Wallet and RPC configuration for `mainnet`, `sepolia`, `base`, and `base-sepolia`.
- ERC-721 deployment through `rare deploy erc721`.
- NFT minting through `rare mint`.
- Auction create, bid, settle, cancel, and status commands.
- Offer create, cancel, accept, and status commands.
- Listing create, cancel, buy, and status commands.
- Token contract and token ID status reads.
- NFT and collection search commands.
- ERC-721 import command.
- Currency listing command.
- SDK client export at `@rareprotocol/rare-cli/client`.
- Contract metadata exports from the client barrel.
