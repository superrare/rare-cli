# RARE Protocol CLI

Command-line tool for the [RARE Protocol](https://superrare.com) on Ethereum. Deploy NFT contracts, mint tokens, run auctions, create offers and listings, and search the network — all from your terminal.

## Install

```bash
npm install -g @rareprotocol/rare-cli
```

This makes the `rare` command available globally.

Verify installation:

```bash
rare --help
```

## Getting Started

All examples below assume you installed the CLI globally and are running `rare` directly.

### 1. Configure a wallet

Import an existing private key:

```bash
rare configure --chain sepolia --private-key 0xYourPrivateKeyHere
```

> **Security note:** Your private key is stored in plaintext at `~/.rare/config.json`. Keep this file secure and never commit it to version control.

Or generate a new wallet:

```bash
rare wallet generate --save
```

If you skip this step, the CLI auto-generates a wallet on first use.

Check your address anytime:

```bash
rare wallet address
```

### 2. Set an RPC endpoint (recommended)

Public RPC endpoints are rate-limited and unreliable. Use your own:

```bash
rare configure --chain sepolia --rpc-url https://your-rpc-endpoint.com
```

You can set both at once:

```bash
rare configure --chain sepolia --private-key 0x... --rpc-url https://your-rpc-endpoint.com
```

### 3. View your config

```bash
rare configure --show
```

Private keys are masked in the output.

## Usage

All commands accept `--chain` to select a network. Batch listing and lazy batch mint commands also accept `--chain-id`. Defaults to `sepolia`.

Supported chains: `mainnet`, `sepolia`, `base`, `base-sepolia`

Batch listing marketplace support is currently deployed on `mainnet` and `sepolia` only.

### Deploy an NFT Collection

```bash
rare deploy erc721 "My Collection" "MC"
rare deploy erc721 "My Collection" "MC" --max-tokens 1000
```

### Create a Lazy Batch Mint Collection

For lazy minting flows, use the lazy batch mint factory instead. Tokens in a lazy collection aren't pre-minted — they're prepared and claimed/redeemed by buyers later.

```bash
# Uncapped lazy collection (typical — leaves room for incremental lazy mints)
rare collection create lazy-batch-mint "My Lazy Collection" "MLC"

# Capped lazy collection (immutable supply ceiling)
rare collection create lazy-batch-mint "My Lazy Collection" "MLC" --max-tokens 100
```

**Lazy vs standard batch mint**:

- `rare deploy erc721` deploys a SovereignBatchMint contract — tokens are minted directly via `rare mint` in the same tx as their creation. Use this for traditional editions where the artist mints up front.
- `rare collection create lazy-batch-mint` deploys a LazySovereignBatchMint contract — designed to feed the lazy mint preparation/redemption pipeline. Use this when buyers (not the artist) trigger the on-chain mint at purchase time.

The lazy factory is currently deployed on **mainnet** and **sepolia** only.

### Create a Sovereign Collection

Use `collection create sovereign` for the newer Sovereign NFT factory flow. The default contract type is `standard`; use `royalty-guard` or `deadman-royalty-guard` when you need those factory variants.

```bash
rare collection create sovereign "My Collection" "MC" --max-tokens 1000
rare collection create sovereign "Guarded Collection" "GC" --max-tokens 1000 --contract-type royalty-guard
```

Use `collection create lazy-sovereign` when the collection will be configured as a release and minted through release sale settings after deployment.

```bash
rare collection create lazy-sovereign "My Release" "MR" --max-tokens 1000
rare collection create lazy-sovereign "Guarded Release" "GR" --max-tokens 1000 --contract-type lazy-royalty-guard
```

Use `collection create space` for RareSpace collections. RareSpace minting is permissioned by the collection's whitelist/allowance settings; the command surfaces contract reverts when the caller cannot mint.

```bash
rare collection create space "My Space" "SPACE" --chain mainnet
rare collection mint-space --contract 0x... --token-uri ipfs://.../metadata.json --to 0x... --royalty-receiver 0x...
```

Batch mint an owned Sovereign collection by passing the metadata base URI. Token metadata resolves as `baseUri/tokenId.json` on supported contracts.

```bash
rare collection mint-batch --contract 0x... --base-uri ipfs://... --token-count 100
```

Prepare a Lazy Sovereign collection for collector minting. Pass `--minter` when a separate release or minting contract should be approved to mint from the prepared batch.

```bash
rare collection prepare-lazy-mint --contract 0x... --base-uri ipfs://... --token-count 100
rare collection prepare-lazy-mint --contract 0x... --base-uri ipfs://... --token-count 100 --minter 0x...
```

Build batch marketplace token-list Merkle artifacts for later batch offer, batch listing, and batch auction flows. CSV files should include contract and token ID columns such as `contract_address,token_id`; JSON files can be an array of `{ "contractAddress": "0x...", "tokenId": "1" }` objects or a generated artifact. Pass `--chain-id` or include a `chain_id` column when the artifact should carry chain context.

```bash
rare batch tree build --input batch-tokens.csv --chain-id 11155111 --output batch-token-artifact.json
rare batch tree proof --input batch-token-artifact.json --contract 0x... --token-id 1 --output proof.json
rare batch tree verify --input batch-token-artifact.json --contract 0x... --token-id 1 --proof proof.json
```

Batch token artifacts use `type: "rare-batch-token-list"` and include `root`, `count`, optional `chainId`, canonical sorted `tokens`, and per-token `entries` with leaves and proofs. Proof artifacts use `type: "rare-batch-token-proof"` and include `root`, `contractAddress`, `tokenId`, optional `chainId`, `leaf`, `proof`, and `valid`.

Inspect creator and royalty data on Sovereign-style collections:

```bash
rare collection creator --contract 0x... --token-id 1
rare collection royalty status --contract 0x... --token-id 1
```

Owner wallets can update royalty receivers on Sovereign and Lazy Sovereign collections:

```bash
rare collection royalty set-default-receiver --contract 0x... --receiver 0x...
rare collection royalty set-token-receiver --contract 0x... --token-id 1 --receiver 0x...
```

Lazy Sovereign collections support mutable prepared metadata until the owner locks it:

```bash
rare collection metadata status --contract 0x...
rare collection metadata update-base-uri --contract 0x... --base-uri ipfs://...
rare collection metadata update-token-uri --contract 0x... --token-id 1 --token-uri ipfs://.../1.json
rare collection metadata lock-base-uri --contract 0x...
```

### Import an Existing Collection

Import an existing ERC-721 contract into the RARE Protocol registry:

```bash
rare import erc721 --contract 0x...
```

You can also specify a chain explicitly:

```bash
rare import erc721 --contract 0x... --chain sepolia
```

### Mint an NFT

Upload local media to IPFS and mint in one step:

```bash
rare mint \
  --contract 0x... \
  --name "My NFT" \
  --description "A description" \
  --image ./art.png
```

Or mint with a pre-built metadata URI:

```bash
rare mint --contract 0x... --token-uri ipfs://Qm...
```

Additional options:

```bash
rare mint \
  --contract 0x... \
  --name "My NFT" \
  --description "A cool piece" \
  --image ./art.png \
  --video ./animation.mp4 \
  --tag art --tag digital \
  --attribute "Base=Starfish" \
  --to 0x...recipient \
  --royalty-receiver 0x...
```

### Direct Sale Releases

After creating and preparing a lazy collection, configure its RareMinter direct sale:

```bash
rare listing release configure \
  --contract 0x... \
  --price 0.1 \
  --max-mints 5

# Optional payout splits. If omitted, 100% goes to the configured wallet.
rare listing release configure \
  --contract 0x... \
  --price 100 \
  --currency rare \
  --start 2026-06-01T16:00:00Z \
  --max-mints 5 \
  --split 0x...artist=80 \
  --split 0x...collaborator=20

# Check release status (read-only)
rare listing release status --contract 0x...

# Include account-specific mint and transaction usage
rare listing release status --contract 0x... --account 0x...

# Mint from the configured direct sale release
rare listing release mint \
  --contract 0x... \
  --quantity 1

# Mint during an active allowlist window with a proof file
rare listing release allowlist proof \
  --input ./allowlist-artifact.json \
  --account 0x... \
  --output ./proof.json

rare listing release mint \
  --contract 0x... \
  --quantity 2 \
  --proof ./proof.json
```

Release configuration uses `RareMinter.prepareMintDirectSale`. It does not mint or modify protocol-admin settings.
`--max-mints` must be between 1 and 100 because direct sale mint transactions cannot mint more than 100 tokens.
Release minting uses `RareMinter.mintDirectSale`; the contract mints to the connected wallet.

#### Release allowlists and limits

Allowlists are two-step. First, build a reusable proof artifact from creator-provided wallet input. CSV files can put wallet addresses in the first column or use an `address`/`wallet` header. JSON files can be an array of address strings, an array of objects with `address` or `wallet`, or an object with `wallets`/`addresses`.

```bash
rare listing release allowlist build \
  --input ./allowlist.csv \
  --output ./allowlist-artifact.json
```

The artifact contains the Merkle root plus one proof per wallet. Configure the release with that root and the allowlist end time:

```bash
rare listing release allowlist set \
  --contract 0x... \
  --input ./allowlist-artifact.json \
  --end-timestamp 2026-06-01T16:00:00Z

# Or set a known root directly
rare listing release allowlist set \
  --contract 0x... \
  --root 0x... \
  --end-timestamp 1767283200

# Read a reusable proof for an account
rare listing release allowlist proof \
  --input ./allowlist-artifact.json \
  --account 0x...
```

Rare listing release minting checks the configured on-chain root while the allowlist window is active. The proof artifact is the portable file that maps each wallet to the proof needed by a mint client or service. Keep the artifact alongside release operations; the chain stores only the root and end timestamp.

Creator-facing RareMinter limits are configured separately and verified after each write:

```bash
# Per-wallet token count across the release; 0 disables it.
rare listing release limits set-mint --contract 0x... --limit 2

# Per-wallet mint transaction count; 0 disables it.
rare listing release limits set-tx --contract 0x... --limit 1

# Minimum seller staking requirement in RARE; 0 disables it.
rare listing release staking set-minimum \
  --contract 0x... \
  --minimum 100 \
  --end-timestamp 2026-06-01T16:00:00Z
```

### Auctions

```bash
# Create an auction (auto-approves the NFT transfer)
rare auction create \
  --contract 0x... \
  --token-id 1 \
  --starting-price 0.1 \
  --duration 86400

# Create a scheduled auction with explicit seller splits
rare auction create \
  --contract 0x... \
  --token-id 1 \
  --type scheduled \
  --start-time 1778500000 \
  --starting-price 0.1 \
  --duration 86400 \
  --split 0x...artist=70 \
  --split 0x...collaborator=30

# Place a bid
rare auction bid --contract 0x... --token-id 1 --amount 0.5

# Settle after the auction ends
rare auction settle --contract 0x... --token-id 1

# Cancel (only if no bids placed)
rare auction cancel --contract 0x... --token-id 1

# Check auction status (read-only)
rare auction status --contract 0x... --token-id 1
```

Reserve auctions start when the first valid bid meets the reserve. Scheduled auctions escrow the token when configured and become bid-ready at `--start-time`; their starting price can be zero. `--split <ADDR=RATIO>` is repeatable for up to 5 recipients, and ratios must sum to exactly 100.

### Offers

```bash
# Create an offer on a token
rare offer create --contract 0x... --token-id 1 --amount 0.5

# Create an offer with ERC20 currency
rare offer create --contract 0x... --token-id 1 --amount 100 --currency usdc

# Accept an offer on a token you own
rare offer accept --contract 0x... --token-id 1 --amount 0.5

# Accept with payout splits (must sum to 100; caller is NOT auto-included)
rare offer accept --contract 0x... --token-id 1 --amount 0.5 \
  --split 0xCollab=30 --split 0xMyWallet=70

# Cancel your offer
rare offer cancel --contract 0x... --token-id 1

# Check offer status (read-only)
rare offer status --contract 0x... --token-id 1
```

`--amount` on `accept` is a slippage assertion: the on-chain offer must still match the value you pass, otherwise the tx reverts. Re-run `offer status` if you suspect drift.

`--split <ADDR=RATIO>` is repeatable for up to 5 recipients. Ratios must sum to exactly 100. If you omit `--split`, the SDK defaults to `[caller, 100]` (100% to your wallet). If you pass any `--split`, you must specify the complete list — the caller is **not** auto-appended.

NFT approval (`setApprovalForAll`) is auto-handled by `offer accept` when needed, just like `auction create` and `listing create`.

### Listings

```bash
# List a token for sale at a fixed price
rare listing create --contract 0x... --token-id 1 --price 1.0

# List with ERC20 currency or a targeted buyer
rare listing create --contract 0x... --token-id 1 --price 100 --currency rare --target 0x...buyer

# List with payout splits (must sum to 100; caller is NOT auto-included)
rare listing create --contract 0x... --token-id 1 --price 1.0 \
  --split 0xCollab=30 --split 0xMyWallet=70

# Buy a listed token
rare listing buy --contract 0x... --token-id 1 --amount 1.0

# Cancel a listing
rare listing cancel --contract 0x... --token-id 1

# Check listing status (read-only) — includes seller, amount, currency, target,
# split recipients, and whether the connected wallet can buy
rare listing status --contract 0x... --token-id 1
```

`--split <ADDR=RATIO>` is repeatable. Ratios must sum to exactly 100. If you omit `--split`, the SDK defaults to `[caller, 100]` (100% to your wallet). If you pass any `--split`, you must specify the complete list — the caller is **not** auto-appended.

### Batch Listings

Batch listings use Merkle artifacts: one root artifact describing the token set and listing config, and one proof artifact per token purchase.
Root artifacts are produced outside the CLI. Token sets and allowlists must each contain at least two entries because the batch listing contract rejects empty Merkle proofs. If no split is provided, registration defaults to 100% to the connected seller wallet.

```bash
# Build a proof artifact for one token in the root
rare listing batch merkle proof \
  --root ./root.json \
  --contract 0x... \
  --token-id 1 \
  --output ./proof.json

# If the root has an allowlist, include the buyer when generating the proof
rare listing batch merkle proof \
  --root ./root.json \
  --contract 0x... \
  --token-id 1 \
  --buyer 0x... \
  --output ./proof.json

# Register the batch listing from the root artifact
rare listing batch create --root ./root.json --yes

# Buy one token using a proof artifact
rare listing batch buy \
  --proof ./proof.json \
  --creator 0x...seller \
  --currency usdc \
  --amount 25

# Inspect the listing config
rare listing batch status --root ./root.json --creator 0x...seller

# Narrow status to a specific token with its proof
rare listing batch status \
  --root ./root.json \
  --creator 0x...seller \
  --contract 0x... \
  --token-id 1 \
  --proof ./proof.json

# Attach an allowlist config to an existing root
rare listing batch set-allowlist \
  --root ./root.json

# Or pass explicit values when using a hex root instead of an artifact path
rare listing batch set-allowlist \
  --root 0x... \
  --allowlist-root 0x... \
  --end-timestamp 1735689600

# Cancel the listing root
rare listing batch cancel --root ./root.json
```

Named currencies are parsed with chain-aware decimals. Arbitrary ERC20 addresses are supported and their `decimals()` values are resolved from chain RPC when sending buys.

### Currencies

All marketplace commands (`auction`, `offer`, `listing`) accept `--currency` to specify a payment token. Named currencies (`eth`, `usdc`, `rare`) are resolved per-chain automatically. You can also pass any ERC20 address directly.

ERC20 allowances are auto-approved when needed for bids, offers, listing purchases, and batch-listing purchases.

```bash
# List supported currencies and their addresses
rare currencies
rare currencies --chain mainnet
```

### Search

```bash
# Search all NFTs
rare search tokens --query "portrait"

# Search your own NFTs
rare search tokens --mine

# Search NFTs by owner
rare search tokens --owner 0x...

# Find active auctions (defaults to PENDING + RUNNING)
rare search auctions

# Filter by auction state
rare search auctions --state SETTLED

# Search your collections
rare search collections
```

All search commands support `--take <n>` and `--cursor <n>` for pagination.

### List All Collections

Fetches every collection you own (auto-paginates):

```bash
rare list-collections
```

### Query On-Chain Status

```bash
# Contract info
rare status --contract 0x...

# Include token details
rare status --contract 0x... --token-id 1
```

## SDK Client Usage

Use the client export when integrating RARE flows directly in your app code.

```bash
npm install @rareprotocol/rare-cli viem
```

### Create a client

```ts
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { createRareClient } from '@rareprotocol/rare-cli/client';

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.RPC_URL),
});

const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(process.env.RPC_URL),
});

const rare = createRareClient({ publicClient, walletClient });
```

### Search

`search.nfts` auto-applies the client chain unless you pass `chainIds`.

```ts
const nfts = await rare.search.nfts({ query: 'portrait', take: 10 });
const collections = await rare.search.collections({ ownerAddresses: [account.address] });
```

### Upload media and mint

`media.upload` accepts a `Uint8Array` (Node `Buffer` works directly).

```ts
import { readFile } from 'node:fs/promises';

const imageBytes = await readFile('./art.png');
const image = await rare.media.upload(imageBytes, 'art.png');

const tokenUri = await rare.media.pinMetadata({
  name: 'My NFT',
  description: 'Minted with the SDK client',
  image,
  tags: ['art'],
});

const minted = await rare.mint.mintTo({
  contract: '0xYourContractAddress',
  tokenUri,
  to: '0xRecipientAddress',
});

console.log(minted.tokenId);
```

### Create a Sovereign collection

```ts
const created = await rare.collection.createSovereign({
  name: 'My Collection',
  symbol: 'MC',
  maxTokens: 1000,
  contractType: 'standard',
});

console.log(created.contract);
```

### Create a Lazy Sovereign collection

```ts
const release = await rare.collection.createLazySovereign({
  name: 'My Release',
  symbol: 'MR',
  maxTokens: 1000,
  contractType: 'lazy',
});

console.log(release.contract);
console.log(release.nextStep);
```

### Create and mint RareSpace collections

```ts
const space = await rare.collection.createSpace({
  name: 'My Space',
  symbol: 'SPACE',
});

const mintedSpaceToken = await rare.collection.mintSpace({
  contract: space.contract,
  tokenUri: 'ipfs://metadata.json',
  to: '0xRecipientAddress',
  royaltyReceiver: '0xRoyaltyReceiverAddress',
});

console.log(mintedSpaceToken.tokenId);
```

### Batch mint a Sovereign collection

```ts
const batch = await rare.collection.mintBatch({
  contract: '0xYourContractAddress',
  baseUri: 'ipfs://your-metadata-directory',
  tokenCount: 100,
});

console.log(batch.fromTokenId, batch.toTokenId);
```

### Prepare a Lazy Sovereign mint

```ts
const prepared = await rare.collection.prepareLazyMint({
  contract: '0xYourContractAddress',
  baseUri: 'ipfs://your-metadata-directory',
  tokenCount: 100,
  minter: '0xOptionalMinterAddress',
});

console.log(prepared.tokenCount);
```

### Build batch marketplace token trees

```ts
const tree = rare.batch.buildTree({
  content: 'contract_address,token_id,chain_id\n0x1111111111111111111111111111111111111111,1,11155111\n',
  format: 'csv',
});

const tokenProof = rare.batch.getTreeProof({
  artifact: tree,
  contractAddress: '0x1111111111111111111111111111111111111111',
  tokenId: 1,
});

const proofValid = rare.batch.verifyTreeProof({
  root: tree.root,
  contractAddress: tokenProof.contractAddress,
  tokenId: tokenProof.tokenId,
  proof: tokenProof.proof,
});

console.log(tree.root, tokenProof.proof, proofValid);
```

### Inspect and maintain collection owner settings

```ts
const creator = await rare.collection.getTokenCreator({
  contract: '0xYourContractAddress',
  tokenId: 1,
});

const royalty = await rare.collection.getRoyaltyInfo({
  contract: '0xYourContractAddress',
  tokenId: 1,
});

await rare.collection.setDefaultRoyaltyReceiver({
  contract: '0xYourContractAddress',
  receiver: '0xNewRoyaltyReceiver',
});

await rare.collection.updateBaseUri({
  contract: '0xLazySovereignContractAddress',
  baseUri: 'ipfs://updated-metadata-directory',
});

console.log(creator.creator, royalty.receiver);
```

### Import an ERC-721 collection

`import.erc721` derives `chainId` from the client. If `owner` is omitted, it defaults to the configured account.

```ts
await rare.import.erc721({
  contract: '0xYourContractAddress',
});
```

## Configuration

Config is stored at `~/.rare/config.json`. Each chain has its own private key and RPC URL.

```bash
# Set private key and RPC for a chain
rare configure --chain sepolia --private-key 0x... --rpc-url https://...

# Configure multiple chains
rare configure --chain base --rpc-url https://your-base-rpc.com
rare configure --chain base-sepolia --private-key 0x... --rpc-url https://your-base-sepolia-rpc.com

# Change default network
rare configure --default-chain mainnet

# View current config
rare configure --show
```

## Best Practices

- **Use sepolia for testing.** Default to sepolia and only switch to mainnet when you're ready.
- **Set a reliable RPC endpoint.** Public endpoints throttle and drop requests. Services like Alchemy or Infura provide free tiers.
- **Don't share your private key.** Keep `~/.rare/config.json` secure and never commit it to version control.
- **Check status before transacting.** Use `rare status` and `rare auction status` to inspect on-chain state before sending transactions.
- **Back up your wallet.** If you lose your private key, you lose access to your assets. Store a copy somewhere safe.

## Contract Addresses

| Network | Factory | Sovereign Factory | Lazy Sovereign Factory | Space Factory | Auction | RareMinter | Batch Listing | BatchOfferCreator |
|---|---|---|---|---|---|---|---|---|
| Sepolia | `0x3c7526a0975156299ceef369b8ff3c01cc670523` | `0x46B2850ba7787734F648A6848b5eDE0815C1F8Bf` | `0xc5B8Ad9003673a23d005A6448C74d8955a1a38fA` | — | `0xC8Edc7049b233641ad3723D6C60019D1c8771612` | `0xd28Dc0B89104d7BBd902F338a0193fF063617ccE` | `0xF2bE72d4343beD375Cb6d0E799a3c003163860e0` | `0x371cca54ef859bb0c7b910581a528ee47773fd56` |
| Mainnet | `0xAe8E375a268Ed6442bEaC66C6254d6De5AeD4aB1` | `0xe980ec62378529d95ba446433f4deb6324129c59` | `0xba798BD606d86D207ca2751510173532899117a1` | `0x3b2d699110aa1788b2b1cae336e0ba8ff942a390` | `0x6D7c44773C52D396F43c2D511B81aa168E9a7a42` | `0x5fa112EFeD8297bec0010b312208d223E0cE891E` | `0x6a190885A806D39A0A8C348bfA1ac762D72E608d` | `0xe15cf80b25272ade261532efdb7912f9104851d4` |
| Base Sepolia | `0x2b181ae0f1aea6fed75591b04991b1a3f9868d51` | — | — | — | `0x1f0c946f0ee87acb268d50ede6c9b4d010af65d2` | — | — | — |
| Base | `0xf776204233bfb52ba0ddff24810cbdbf3dbf94dd` | — | — | — | `0x51c36ffb05e17ed80ee5c02fa83d7677c5613de2` | — | — | — |

## Underlying Solidity Contracts

If you want to inspect the on-chain contracts used by this CLI:

- Token contract used when minting NFTs: [`SovereignBatchMint.sol`](https://github.com/superrare/core/blob/main/src/v2/token/ERC721/sovereign/SovereignBatchMint.sol)
- Factory used for collection deployments: [`SovereignBatchMintFactory.sol`](https://github.com/superrare/core/blob/main/src/v2/token/ERC721/sovereign/SovereignBatchMintFactory.sol)
- Token contract used for newer Sovereign batch minting: [`SovereignNFT.sol`](https://github.com/rareprotocol/core/blob/main/src/token/ERC721/sovereign/SovereignNFT.sol)
- Factory used for Sovereign collection creation: [`SovereignNFTContractFactory.sol`](https://github.com/rareprotocol/core/blob/main/src/token/ERC721/sovereign/SovereignNFTContractFactory.sol)
- Token contract used for Lazy Sovereign mint preparation: [`LazySovereignNFT.sol`](https://github.com/rareprotocol/core/blob/main/src/token/ERC721/sovereign/lazy/LazySovereignNFT.sol)
- Factory used for Lazy Sovereign release collection creation: [`LazySovereignNFTFactory.sol`](https://github.com/rareprotocol/core/blob/main/src/token/ERC721/sovereign/lazy/LazySovereignNFTFactory.sol)
- RareSpace collection contract: [`RareSpaceNFT.sol`](https://github.com/rareprotocol/core/blob/main/src/token/ERC721/spaces/RareSpaceNFT.sol)
- Factory used for RareSpace collection creation: [`RareSpaceNFTContractFactory.sol`](https://github.com/rareprotocol/core/blob/main/src/token/ERC721/spaces/RareSpaceNFTContractFactory.sol)
- Auction/market contract used for auction operations: [`SuperRareBazaar.sol`](https://github.com/superrare/core/blob/main/src/bazaar/SuperRareBazaar.sol)

## Development (Optional)

Most users should use the globally installed package and run `rare ...` commands directly.
The steps below are only for contributors working on this repository.

```bash
git clone https://github.com/superrare/rare-cli.git
cd rare-cli
npm install
npm run build
```

For development with auto-rebuild:

```bash
npm run dev
```

To test local source changes without publishing a package:

```bash
node dist/index.js --help
# or
npm link
rare --help
```

Requires Node.js 22+. Built with [Commander](https://github.com/tj/commander.js) and [Viem](https://viem.sh).

## License

[MIT](LICENSE)
