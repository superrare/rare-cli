# RARE Protocol CLI

Command-line tool for the [RARE Protocol](https://superrare.com) on Ethereum. Deploy NFT contracts, mint tokens, run auctions, create offers and listings, and search the network — all from your terminal.

## Install

Requires Node.js 22+.

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

Or store the private key in 1Password and configure rare with a secret reference:

```bash
rare configure --chain sepolia --private-key-ref op://Private/rare-sepolia/private-key
```

The CLI runs `op read` once during configuration to derive and store the public wallet address. Later, it resolves the 1Password secret only when viem signs a message or transaction. The plaintext private key is never written to `~/.rare/config.json`.

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
# or, without storing the key in plaintext:
rare configure --chain sepolia --private-key-ref op://Private/rare-sepolia/private-key --rpc-url https://your-rpc-endpoint.com
```

### 3. View your config

```bash
rare configure --show
```

Private keys are masked in the output. Configured account addresses are shown.

## Usage

Most chain-aware commands accept `--chain` or `--chain-id` to select a network. Defaults to the configured default chain, or `sepolia` when no default is configured.

Supported chains: `mainnet`, `sepolia`, `base`, `base-sepolia`

Feature deployment varies by chain. Batch listing, batch offer, RareMinter release, Liquid Edition, and swap flows are currently available on `mainnet` and `sepolia`; batch auction addresses are also configured for `base` and `base-sepolia`.

### Deploy an NFT Collection

```bash
rare collection deploy erc721 "My Collection" "MC"
rare collection deploy erc721 "My Collection" "MC" --max-tokens 1000
```

### Deploy a Lazy ERC-721 Collection

For RareMinter release flows, deploy a Lazy ERC-721 collection. Buyers mint sequential token IDs through release sale settings.

```bash
rare collection deploy lazy-erc721 "My Release" "MR" --max-tokens 1000
rare collection deploy lazy-erc721 "Guarded Release" "GR" --max-tokens 1000 --contract-type lazy-royalty-guard
```

### Deploy a Lazy Batch Mint Collection

For lazy minting flows, use the lazy batch mint factory instead. Tokens in a lazy collection aren't pre-minted — they're prepared and claimed/redeemed by buyers later.

```bash
# Uncapped lazy collection (typical — leaves room for incremental lazy mints)
rare collection deploy lazy-batch-mint "My Lazy Collection" "MLC"

# Capped lazy collection (immutable supply ceiling)
rare collection deploy lazy-batch-mint "My Lazy Collection" "MLC" --max-tokens 100
```

**Lazy vs standard batch mint**:

- `rare collection deploy erc721` deploys a SovereignBatchMint contract — tokens are minted directly via `rare collection mint` in the same tx as their creation. Use this for traditional editions where the artist mints up front.
- `rare collection deploy lazy-erc721` deploys a LazySovereignNFT contract — designed for RareMinter direct sale releases where buyers mint sequential token IDs.
- `rare collection deploy lazy-batch-mint` deploys a LazySovereignBatchMint contract — designed to feed the lazy mint preparation/redemption pipeline. Use this when buyers (not the artist) trigger the on-chain mint at purchase time.

The Lazy Sovereign and Lazy Batch Mint factories are currently deployed on **mainnet** and **sepolia** only.

Batch mint an owned Sovereign collection by passing the metadata base URI. Token metadata resolves as `baseUri/tokenId.json` on supported contracts.

```bash
rare collection mint-batch --contract 0x... --base-uri ipfs://... --amount 100
```

Prepare a Lazy Sovereign collection for collector minting. Pass `--minter` when a separate release or minting contract should be approved to mint from the prepared batch.

```bash
rare collection prepare-lazy-mint --contract 0x... --base-uri ipfs://... --amount 100
rare collection prepare-lazy-mint --contract 0x... --base-uri ipfs://... --amount 100 --minter 0x...
```

Build token-list Merkle artifacts for offline proof checks and for batch offer and batch auction root inputs. CSV files should include contract and token ID columns such as `contract_address,token_id`; JSON files can be an array of `{ "contractAddress": "0x...", "tokenId": "1" }` objects or a generated artifact. Pass `--chain-id` or include a `chain_id` column when the artifact should carry chain context.

```bash
rare utils tree build --input batch-tokens.csv --chain-id 11155111 --output batch-token-artifact.json
rare utils tree proof --input batch-token-artifact.json --contract 0x... --token-id 1 --output proof.json
rare utils tree verify --input batch-token-artifact.json --contract 0x... --token-id 1 --proof proof.json
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

The legacy protocol `RoyaltyRegistry` is also available under `collection royalty registry`. By default, the CLI reads the registry address from the configured Rare marketplace contract; pass `--registry 0x...` to target a specific registry.

```bash
rare collection royalty registry status --contract 0x... --token-id 1
rare collection royalty registry set-receiver-override --receiver 0x...
rare collection royalty registry set-contract-receiver --contract 0x... --receiver 0x...
rare collection royalty registry set-token-receiver --contract 0x... --token-id 1 --receiver 0x...
rare collection royalty registry set-contract-percentage --contract 0x... --percentage 10
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
rare collection mint \
  --contract 0x... \
  --name "My NFT" \
  --description "A description" \
  --image ./art.png
```

Or mint with a pre-built metadata URI:

```bash
rare collection mint --contract 0x... --token-uri ipfs://Qm...
```

Additional options:

```bash
rare collection mint \
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
  --start-time 2026-06-01T16:00:00Z \
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
`--max-mints 0` disables the per-transaction mint cap. Nonzero values must be between 1 and 100.
Release minting uses `RareMinter.mintDirectSale`; the contract mints to the connected wallet.

#### Release allowlists and limits

Allowlists are two-step. First, build a reusable proof artifact from creator-provided wallet input. CSV files can put wallet addresses in the first column or use an `address`/`wallet` header. JSON files can be an array of address strings, an array of objects with `address` or `wallet`, or an object with `wallets`/`addresses`.

```bash
rare listing release allowlist build \
  --input ./allowlist.csv \
  --output ./allowlist-artifact.json
```

The artifact contains the locally reproducible Merkle root plus one proof per wallet. In the normal flow, `allowlist set --input` submits the artifact wallet list to the Rare API and configures the API-returned canonical root on-chain with the allowlist end time:

```bash
rare listing release allowlist set \
  --contract 0x... \
  --input ./allowlist-artifact.json \
  --end-time 2026-06-01T16:00:00Z

# Or bypass artifact registration and set a known root directly
rare listing release allowlist set \
  --contract 0x... \
  --root 0x... \
  --end-time 1767283200

# Read a reusable proof for an account
rare listing release allowlist proof \
  --input ./allowlist-artifact.json \
  --account 0x...
```

Rare listing release minting checks the configured on-chain root while the allowlist window is active. The proof artifact is the portable file that maps each wallet to the proof needed by a mint client or service. Keep the artifact alongside release operations; the chain stores only the root and end timestamp. Use `--root` only when you already have a root that should be configured directly instead of registering an artifact through the Rare API.

Creator-facing RareMinter limits are configured separately and verified after each write:

```bash
# Per-wallet token count across the release; 0 disables it.
rare listing release limits set-mint --contract 0x... --limit 2

# Per-wallet mint transaction count; 0 disables it.
rare listing release limits set-tx --contract 0x... --limit 1

# Verify release config, allowlist, and limits.
rare listing release status --contract 0x... --account 0x...
```

### Auctions

```bash
# Create an auction (auto-approves the NFT transfer)
rare auction create \
  --contract 0x... \
  --token-id 1 \
  --price 0.1 \
  --end-time 1778586400

# Create a scheduled auction with explicit seller splits
rare auction create \
  --contract 0x... \
  --token-id 1 \
  --type scheduled \
  --start-time 1778500000 \
  --price 0.1 \
  --end-time 1778586400 \
  --split 0x...artist=70 \
  --split 0x...collaborator=30

# Place a bid
rare auction bid --contract 0x... --token-id 1 --price 0.5

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
rare offer create --contract 0x... --token-id 1 --price 0.5

# Create an offer with ERC20 currency
rare offer create --contract 0x... --token-id 1 --price 100 --currency usdc

# Accept an offer on a token you own
rare offer accept --contract 0x... --token-id 1 --price 0.5

# Accept with payout splits (must sum to 100; caller is NOT auto-included)
rare offer accept --contract 0x... --token-id 1 --price 0.5 \
  --split 0xCollab=30 --split 0xMyWallet=70

# Cancel your offer
rare offer cancel --contract 0x... --token-id 1

# Check offer status (read-only)
rare offer status --contract 0x... --token-id 1
```

`--price` on `accept` is a slippage assertion: the on-chain offer must still match the value you pass, otherwise the tx reverts. Re-run `offer status` if you suspect drift.

`--split <ADDR=RATIO>` is repeatable for up to 5 recipients. Ratios must sum to exactly 100. If you omit `--split`, the SDK defaults to `[caller, 100]` (100% to your wallet). If you pass any `--split`, you must specify the complete list — the caller is **not** auto-appended.

NFT approval (`setApprovalForAll`) is checked by `offer accept`, `auction create`, and `listing create`. If approval is already in place, the command continues without a prompt; if approval is required, pass `--yes` or confirm the interactive `[y/N]` prompt.

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
rare listing buy --contract 0x... --token-id 1 --price 1.0

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
rare utils merkle proof \
  --input ./root.json \
  --contract 0x... \
  --token-id 1 \
  --output ./proof.json

# If the root has an allowlist, include the buyer when generating the proof
rare utils merkle proof \
  --input ./root.json \
  --contract 0x... \
  --token-id 1 \
  --buyer 0x... \
  --output ./proof.json

# Register the batch listing from the root artifact
rare listing batch create --input ./root.json --yes

# Buy one token using a proof artifact
rare listing batch buy \
  --proof ./proof.json \
  --creator 0x...seller \
  --currency usdc \
  --price 25

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
  --input ./root.json

# Or pass explicit override values
rare listing batch set-allowlist \
  --root 0x... \
  --allowlist-root 0x... \
  --end-time 1735689600

# Cancel the listing root
rare listing batch cancel --input ./root.json
```

Named currencies are parsed with chain-aware decimals. Arbitrary ERC20 addresses are supported and their `decimals()` values are resolved from chain RPC when sending buys.

### Batch Offers and Batch Auctions

Batch offers and batch auctions use token Merkle roots. You can pass a token-list artifact with `--input` or a known bytes32 root with `--root`.

```bash
# Create a batch offer over a token set
rare offer batch create \
  --input batch-token-artifact.json \
  --price 1 \
  --currency eth \
  --end-time 1778586400 \
  --yes

# Accept a batch offer for one token
rare offer batch accept \
  --creator 0x...buyer \
  --contract 0x... \
  --token-id 1 \
  --root 0x... \
  --yes

# Create a batch reserve auction over a token set
rare auction batch create \
  --input batch-token-artifact.json \
  --price 0.1 \
  --end-time 1778586400 \
  --yes

# Bid on, inspect, settle, or cancel batch auctions
rare auction batch bid --creator 0x...seller --contract 0x... --token-id 1 --price 0.2
rare auction batch status --creator 0x...seller --contract 0x... --token-id 1
rare auction batch settle --contract 0x... --token-id 1
rare auction batch cancel --root 0x...
```

Batch marketplace commands can resolve proofs through the Rare API when enough token, root, and creator context is provided. Pass local proof artifacts when you need a portable offline override.

### Currencies

All marketplace commands (`auction`, `offer`, `listing`) accept `--currency` to specify a payment token. Named currencies (`eth`, `usdc`, `rare`) are resolved per-chain automatically. You can also pass any ERC20 address directly.

SDK marketplace methods use the same currency contract: pass `eth`, `rare`, `usdc`, or an ERC20 address to `currency`, and use `rare.currency.list()`, `rare.currency.resolve(input)`, or `rare.currency.resolveDecimals(input)` to inspect the chain-aware mapping.

ERC20 allowances are auto-approved when needed for bids, offers, listing purchases, and batch-listing purchases.

```bash
# List supported currencies and their addresses
rare currencies
rare currencies --chain mainnet
```

### Liquid Editions

Liquid Edition deployments support generated presets, custom curve files, metadata upload, preview-only output, and explicit transaction confirmation.

```bash
# Preview a generated curve before deploying
rare liquid-edition deploy multicurve "My Liquid Edition" "MLE" \
  --curve-preset medium-demand \
  --description "A liquid edition" \
  --image ./art.png \
  --preview

# Submit the deployment
rare liquid-edition deploy multicurve "My Liquid Edition" "MLE" \
  --curve-preset medium-demand \
  --description "A liquid edition" \
  --image ./art.png \
  --initial-rare-liquidity 1000 \
  --yes

# Inspect and maintain a Liquid Edition
rare liquid-edition status --contract 0x...
rare liquid-edition token-uri --contract 0x...
rare liquid-edition set-render-contract --contract 0x... --render-contract 0x...
```

Use `--preview` to stop before deployment. Otherwise, the CLI resolves the curve config and asks for confirmation unless you pass `--yes`; in `--json` or non-interactive mode, pass `--yes` to submit a transaction.

### Swaps

Swap commands quote before submitting. Use `--quote-only` to stop after the quote or `--yes` to submit without the interactive confirmation.

```bash
# Buy an arbitrary token with ETH
rare swap buy-token --token 0x... --amount-in 0.1 --quote-only
rare swap buy-token --token 0x... --amount-in 0.1 --slippage-bps 50 --yes

# Sell a token for ETH
rare swap sell-token --token 0x... --amount-in 10 --quote-only

# Buy RARE with ETH through the canonical route
rare swap buy-rare --amount-in 0.1 --quote-only

# Execute a prebuilt raw liquid-router swap
rare swap tokens \
  --token-in 0x... \
  --amount-in 10 \
  --token-out 0x... \
  --min-amount-out 9.5 \
  --commands 0x... \
  --inputs-file ./router-inputs.json \
  --yes
```

`buy-token` and `sell-token` accept `--route auto`, `--route local`, `--route uniswap`, or `--route raw`. Raw route execution requires `--commands`, `--inputs-file`, and `--min-amount-out`.

### Search

```bash
# Search all NFTs
rare search nfts --query "portrait"

# Search your own NFTs
rare search nfts --mine

# Search NFTs by owner
rare search nfts --owner 0x...

# Find NFTs with running auctions
rare search nfts --auction-state RUNNING

# Find NFTs with listings or offers
rare search nfts --has-listing
rare search nfts --has-offer

# Search NFT events by token
rare search events --chain-id 1 --contract 0x... --token-id 1 --event-type CREATE_NFT

# Search collection events by collection ID or by chain + contract
rare search events --collection-id 1-0x...
rare search events --chain-id 1 --contract 0x...

# Search collections
rare search collections

# Fetch a specific NFT or user
rare nft get --contract 0x... --token-id 1
rare user get 0x...
```

All search commands support `--per-page <n>` and `--page <n>` for pagination.

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

Public package subpaths are intentionally scoped:

```ts
import { createRareClient } from '@rareprotocol/rare-cli/client';
import { contractAddresses, supportedChains } from '@rareprotocol/rare-cli/contracts';
import { buildUtilsTree, getUtilsTreeProof } from '@rareprotocol/rare-cli/utils';
```

Use `@rareprotocol/rare-cli/client` for app-level SDK workflows, `@rareprotocol/rare-cli/contracts` for lower-level viem contract metadata and ABIs, and `@rareprotocol/rare-cli/utils` for standalone pure artifact/proof helpers.

### Search

`RareClient` is bound to the chain on its `publicClient`. Client methods use that chain automatically; create a separate client with a different viem chain to query or write another network.

```ts
const nfts = await rare.search.nfts({ query: 'portrait', perPage: 10 });
const collections = await rare.search.collections({ ownerAddress: account.address });
const events = await rare.search.events({
  contract: '0x...',
  tokenId: '1',
  eventType: ['CREATE_NFT', 'SETTLE_AUCTION'],
});
const nft = await rare.nft.get({
  contract: '0x...',
  tokenId: '1',
});
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

const minted = await rare.collection.mint({
  contract: '0xYourContractAddress',
  tokenUri,
  to: '0xRecipientAddress',
});

console.log(minted.tokenId);
```

### Deploy an ERC-721 collection

```ts
const created = await rare.collection.deploy.erc721({
  name: 'My Collection',
  symbol: 'MC',
  maxTokens: 1000,
});

console.log(created.contract);
```

### Deploy a Lazy ERC-721 collection

```ts
const release = await rare.collection.deploy.lazyErc721({
  name: 'My Release',
  symbol: 'MR',
  maxTokens: 1000,
  contractType: 'lazy',
});

console.log(release.contract);
console.log(release.nextStep);
```

### Deploy a Lazy Batch Mint collection

```ts
const lazyBatch = await rare.collection.deploy.lazyBatchMint({
  name: 'My Lazy Collection',
  symbol: 'MLC',
  maxTokens: 1000,
});

console.log(lazyBatch.contract);
```

### Batch mint a Sovereign collection

```ts
const batch = await rare.collection.mintBatch({
  contract: '0xYourContractAddress',
  baseUri: 'ipfs://your-metadata-directory',
  amount: 100,
});

console.log(batch.fromTokenId, batch.toTokenId);
```

### Prepare a Lazy Sovereign mint

```ts
const prepared = await rare.collection.prepareLazyMint({
  contract: '0xYourContractAddress',
  baseUri: 'ipfs://your-metadata-directory',
  amount: 100,
  minter: '0xOptionalMinterAddress',
});

console.log(prepared.tokenCount);
```

### Build utility token Merkle trees

```ts
const tree = rare.utils.tree.build({
  content: 'contract_address,token_id,chain_id\n0x1111111111111111111111111111111111111111,1,11155111\n',
  format: 'csv',
});

const tokenProof = rare.utils.tree.proof({
  artifact: tree,
  contractAddress: '0x1111111111111111111111111111111111111111',
  tokenId: 1,
});

const proofValid = rare.utils.tree.verify({
  root: tree.root,
  contractAddress: tokenProof.contractAddress,
  tokenId: tokenProof.tokenId,
  proof: tokenProof.proof,
});

console.log(tree.root, tokenProof.proof, proofValid);
```

### Liquid Edition and swap SDK methods

```ts
const liquidStatus = await rare.liquidEdition.status({
  contract: '0xLiquidEditionContract',
});

const buyQuote = await rare.swap.quoteBuyToken({
  token: '0xTokenAddress',
  amountIn: '0.1',
  route: 'auto',
});

console.log(liquidStatus.currentPrice.rarePerToken, buyQuote.minAmountOut);
```

### Inspect and maintain collection owner settings

```ts
const creator = await rare.collection.getTokenCreator({
  contract: '0xYourContractAddress',
  tokenId: 1,
});

const royalty = await rare.collection.royalty.status({
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

Config is stored at `~/.rare/config.json`. Each chain has its own key source and RPC URL. A key source can be a plaintext `privateKey` or a 1Password `privateKeyRef` plus a derived public address. `rare configure --show` prints the account address for configured key sources.

```bash
# Set private key and RPC for a chain
rare configure --chain sepolia --private-key 0x... --rpc-url https://...

# Set a 1Password-backed private key reference and RPC for a chain
rare configure --chain sepolia --private-key-ref op://Private/rare-sepolia/private-key --rpc-url https://...

# Configure multiple chains
rare configure --chain base --rpc-url https://your-base-rpc.com
rare configure --chain base-sepolia --private-key 0x... --rpc-url https://your-base-sepolia-rpc.com

# Change default network
rare configure --default-chain mainnet

# View current config, including derived account addresses
rare configure --show

# Delete local config (prompts for confirmation)
rare configure delete

# Delete local config without prompting
rare configure delete --yes
```

Merkle root and proof flows use `https://api.superrare.com` by default. Set `RARE_API_BASE_URL` to point the SDK and CLI at another rare-api deployment.

```bash
RARE_API_BASE_URL=https://rare-api.example.com rare listing batch buy --contract 0x... --token-id 1 --creator 0x... --currency eth --price 1
```

## Best Practices

- **Use sepolia for testing.** Default to sepolia and only switch to mainnet when you're ready.
- **Set a reliable RPC endpoint.** Public endpoints throttle and drop requests. Services like Alchemy or Infura provide free tiers.
- **Prefer 1Password for private keys.** Install the 1Password CLI, run `op signin`, and configure keys with `--private-key-ref` to avoid storing plaintext keys in rare config.
- **Don't share your private key.** If you use `--private-key` or generated saved wallets, keep `~/.rare/config.json` secure and never commit it to version control.
- **Check status before transacting.** Use `rare status` and `rare auction status` to inspect on-chain state before sending transactions.
- **Back up your wallet.** If you lose your private key, you lose access to your assets. Store a copy somewhere safe.

### 1Password Test Setup

The default test suite does not require access to a real 1Password vault. To run the optional live 1Password integration, sign in with `op signin` and provide a private-key secret reference:

```bash
RARE_CLI_TEST_OP_PRIVATE_KEY_REF=op://Private/rare-sepolia/private-key \
  npx vitest run test/integration/one-password.test.ts --config vitest.config.ts
```

## Contract Addresses

These are the addresses embedded in the SDK under `@rareprotocol/rare-cli/contracts`.

Core collection and marketplace contracts:

| Network | Factory | Sovereign Factory | Lazy Sovereign Factory | Lazy Batch Mint Factory | Auction | RareMinter |
|---|---|---|---|---|---|---|
| Sepolia | `0x3c7526a0975156299ceef369b8ff3c01cc670523` | `0x46B2850ba7787734F648A6848b5eDE0815C1F8Bf` | `0xc5B8Ad9003673a23d005A6448C74d8955a1a38fA` | `0xE5efBA88D556aDA98124654fE505465b8d494858` | `0xC8Edc7049b233641ad3723D6C60019D1c8771612` | `0xd28Dc0B89104d7BBd902F338a0193fF063617ccE` |
| Mainnet | `0xAe8E375a268Ed6442bEaC66C6254d6De5AeD4aB1` | `0xe980ec62378529d95ba446433f4deb6324129c59` | `0xba798BD606d86D207ca2751510173532899117a1` | `0x40F9E4b420D5A8fF5aED32B5F72A37013c0739B6` | `0x6D7c44773C52D396F43c2D511B81aa168E9a7a42` | `0x5fa112EFeD8297bec0010b312208d223E0cE891E` |
| Base Sepolia | `0x2b181ae0f1aea6fed75591b04991b1a3f9868d51` | — | — | — | `0x1f0c946f0ee87acb268d50ede6c9b4d010af65d2` | — |
| Base | `0xf776204233bfb52ba0ddff24810cbdbf3dbf94dd` | — | — | — | `0x51c36ffb05e17ed80ee5c02fa83d7677c5613de2` | — |

Batch, approval, Liquid Edition, and swap infrastructure:

| Network | Batch Listing | BatchOfferCreator | BatchAuctionHouse | Marketplace Settings | ERC20 Approval Manager | ERC721 Approval Manager | Liquid Factory | Swap Router | V4 Quoter |
|---|---|---|---|---|---|---|---|---|---|
| Sepolia | `0xF2bE72d4343beD375Cb6d0E799a3c003163860e0` | `0x371cca54ef859bb0c7b910581a528ee47773fd56` | `0x293AE7701A7830B1d38A7608EdF86A106d9E2645` | `0x972dEe8fa339ad2D9c6cbDA31b67f98Fac242d13` | `0x4619eB29e84392CE91C27FC936A5c94d1D14b93f` | `0x5fa0a461d3a2Ea3bFDf03e8BD37CAbB4ae84205E` | `0xb1777091C953fa2aC1fD67f2b3e2f61343F5Ce5e` | `0x429c3Ee66E7f6CDA12C5BadE4104aF3277aA2305` | `0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227` |
| Mainnet | `0x6a190885A806D39A0A8C348bfA1ac762D72E608d` | `0xe15cf80b25272ade261532efdb7912f9104851d4` | `0x71742c7196f1c334C4c038ce6dcDcEE98097F9Da` | `0x61DBF87164d33FD3695256DC8Ba74D3B1d304170` | `0xa837a7eAff154Ab837617Cf7250648D3Ec0A4436` | `0x4bb0Deea6d1A30C601338aAB776d394C2AE5c0F8` | `0xbb4341CFd588a098e9aCE1D224178836426c4a8E` | `0xEBd58EdA8408d9EA409f2c2bE8898BD9738f3583` | `0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203` |
| Base Sepolia | — | — | `0x2b181ae0f1aea6fed75591b04991b1a3f9868d51` | — | — | — | — | — | — |
| Base | — | — | `0xf776204233bfb52ba0ddff24810cbdbf3dbf94dd` | — | — | — | — | — | — |

## Underlying Solidity Contracts

If you want to inspect the on-chain contracts used by this CLI:

- Token contract used when minting NFTs: [`SovereignBatchMint.sol`](https://github.com/superrare/core/blob/main/src/v2/token/ERC721/sovereign/SovereignBatchMint.sol)
- Factory used for collection deployments: [`SovereignBatchMintFactory.sol`](https://github.com/superrare/core/blob/main/src/v2/token/ERC721/sovereign/SovereignBatchMintFactory.sol)
- Token contract used for RareMinter releases: [`LazySovereignNFT.sol`](https://github.com/superrare/core/blob/main/src/token/ERC721/sovereign/lazy/LazySovereignNFT.sol)
- Factory used for Lazy ERC-721 release collection deployments: [`LazySovereignNFTFactory.sol`](https://github.com/superrare/core/blob/main/src/token/ERC721/sovereign/lazy/LazySovereignNFTFactory.sol)
- Token contract used for lazy batch mint drops: [`LazySovereignBatchMint.sol`](https://github.com/superrare/core/blob/main/src/v2/token/ERC721/sovereign/LazySovereignBatchMint.sol)
- Factory used for lazy batch mint collection deployments: [`LazySovereignBatchMintFactory.sol`](https://github.com/superrare/core/blob/main/src/v2/token/ERC721/sovereign/LazySovereignBatchMintFactory.sol)
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
