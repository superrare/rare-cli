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

All commands accept `--chain` to select a network. Defaults to `sepolia`.

Supported chains (including deploy, mint, import, and auction flows): `mainnet`, `sepolia`, `base`, `base-sepolia`

### Deploy an NFT Collection

```bash
rare deploy erc721 "My Collection" "MC"
rare deploy erc721 "My Collection" "MC" --max-tokens 1000
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

### Back Up an Existing NFT

Resolve an existing token's `tokenURI`, fetch its metadata and directly referenced media locally, request a hosted preservation quote, and optionally pay/pin via x402 using `RARE`.

```bash
# Quote only
rare backup token \
  --contract 0x... \
  --token-id 1 \
  --chain sepolia \
  --quote-only

# Full preserve flow
rare backup token \
  --contract 0x... \
  --token-id 1 \
  --chain mainnet \
  --payment-chain base

# Or resolve by universal token ID
rare backup token \
  --universal-token-id 1-0x...-1
```

Useful options:

```bash
rare backup token \
  --contract 0x... \
  --token-id 1 \
  --service-url https://your-preservation-service.com \
  --gateway https://ipfs.io \
  --max-bytes 1073741824
```

The CLI defaults to `http://localhost:8005` for preservation requests. Use `--service-url` or `rare configure --backup-service-url <url>` to point at another seller.

For paid preserves, the selected `--payment-chain` must have both a private key and RPC URL configured. The backup flow does not auto-generate wallets. Before any payment-capable request, the CLI now prints the quote and asks for confirmation. Use `--yes` to skip the prompt in automation.

Preservation currently only supports CID-backed IPFS metadata and media references. Use `ipfs://...` URIs or IPFS gateway URLs like `https://ipfs.io/ipfs/<cid>...`.

### Auctions

```bash
# Create an auction (auto-approves the NFT transfer)
rare auction create \
  --contract 0x... \
  --token-id 1 \
  --starting-price 0.1 \
  --duration 86400

# Place a bid
rare auction bid --contract 0x... --token-id 1 --amount 0.5

# Settle after the auction ends
rare auction settle --contract 0x... --token-id 1

# Cancel (only if no bids placed)
rare auction cancel --contract 0x... --token-id 1

# Check auction status (read-only)
rare auction status --contract 0x... --token-id 1
```

### Offers

```bash
# Create an offer on a token
rare offer create --contract 0x... --token-id 1 --amount 0.5

# Create an offer with ERC20 currency
rare offer create --contract 0x... --token-id 1 --amount 100 --currency usdc

# Accept an offer on a token you own
rare offer accept --contract 0x... --token-id 1 --amount 0.5

# Cancel your offer
rare offer cancel --contract 0x... --token-id 1

# Check offer status (read-only)
rare offer status --contract 0x... --token-id 1
```

### Listings

```bash
# List a token for sale at a fixed price
rare listing create --contract 0x... --token-id 1 --price 1.0

# List with ERC20 currency or a targeted buyer
rare listing create --contract 0x... --token-id 1 --price 100 --currency rare --target 0x...buyer

# Buy a listed token
rare listing buy --contract 0x... --token-id 1 --amount 1.0

# Cancel a listing
rare listing cancel --contract 0x... --token-id 1

# Check listing status (read-only)
rare listing status --contract 0x... --token-id 1
```

### Currencies

All marketplace commands (`auction`, `offer`, `listing`) accept `--currency` to specify a payment token. Named currencies (`eth`, `usdc`, `rare`) are resolved per-chain automatically. You can also pass any ERC20 address directly.

ERC20 allowances are auto-approved when needed for bids, offers, and purchases.

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

### Import an ERC-721 collection

`import.erc721` derives `chainId` from the client. If `owner` is omitted, it defaults to the configured account.

```ts
await rare.import.erc721({
  contract: '0xYourContractAddress',
});
```

### Quote or preserve an existing NFT

`backup.quoteTokenPreservation` resolves metadata/media locally, computes exact byte counts and hashes, then requests a hosted quote. `backup.preserveToken` continues through upload session creation, uploads the staged bytes, and finalizes the receipt.

```ts
const quote = await rare.backup.quoteTokenPreservation({
  serviceUrl: 'https://your-preservation-service.com',
  contract: '0xYourContractAddress',
  tokenId: '1',
  sourceChain: 'sepolia',
});

console.log(quote.billableBytes, quote.tokenAmount);
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

# Override preservation defaults
rare configure --backup-service-url https://your-preservation-service.com
rare configure --backup-payment-chain base
rare configure --backup-gateway-url https://ipfs.io
rare configure --backup-max-bytes 1073741824
```

## Best Practices

- **Use sepolia for testing.** Default to sepolia and only switch to mainnet when you're ready.
- **Set a reliable RPC endpoint.** Public endpoints throttle and drop requests. Services like Alchemy or Infura provide free tiers.
- **Don't share your private key.** Keep `~/.rare/config.json` secure and never commit it to version control.
- **Check status before transacting.** Use `rare status` and `rare auction status` to inspect on-chain state before sending transactions.
- **Back up your wallet.** If you lose your private key, you lose access to your assets. Store a copy somewhere safe.

## Contract Addresses

| Network | Factory | Auction |
|---|---|---|
| Sepolia | `0x3c7526a0975156299ceef369b8ff3c01cc670523` | `0xC8Edc7049b233641ad3723D6C60019D1c8771612` |
| Mainnet | `0xAe8E375a268Ed6442bEaC66C6254d6De5AeD4aB1` | `0x6D7c44773C52D396F43c2D511B81aa168E9a7a42` |
| Base Sepolia | `0x2b181ae0f1aea6fed75591b04991b1a3f9868d51` | `0x1f0c946f0ee87acb268d50ede6c9b4d010af65d2` |
| Base | `0xf776204233bfb52ba0ddff24810cbdbf3dbf94dd` | `0x51c36ffb05e17ed80ee5c02fa83d7677c5613de2` |

## Underlying Solidity Contracts

If you want to inspect the on-chain contracts used by this CLI:

- Token contract used when minting NFTs: [`SovereignBatchMint.sol`](https://github.com/superrare/core/blob/main/src/v2/token/ERC721/sovereign/SovereignBatchMint.sol)
- Factory used for collection deployments: [`SovereignBatchMintFactory.sol`](https://github.com/superrare/core/blob/main/src/v2/token/ERC721/sovereign/SovereignBatchMintFactory.sol)
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
