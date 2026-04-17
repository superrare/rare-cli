# RARE Protocol CLI

CLI tool for interacting with RARE Protocol smart contracts on Ethereum. Deploy NFT contracts, mint tokens, manage auctions, create offers and listings.

## Quick Reference

Binary: `rare` (after `npm link`) or `node dist/index.js`
Runtime: Node.js 22+
Config: `~/.rare/config.json`
Networks: `mainnet`, `sepolia`, `base`, `base-sepolia`, `arbitrum`, `arbitrum-sepolia`, `optimism`, `optimism-sepolia`, `zora`, `zora-sepolia`
RARE contracts deployed on: `mainnet`, `sepolia`, `base`, `base-sepolia`

## Build

```bash
npm install && npm run build
```

## Commands

All commands accept `--chain <sepolia|mainnet>` to override the default network.

### Configuration & Wallet

```bash
rare configure --chain sepolia --private-key 0x... --rpc-url https://...
rare configure --default-chain mainnet
rare configure --backup-service-url https://your-preservation-service.com
rare configure --backup-payment-chain base
rare configure --backup-gateway-url https://ipfs.io
rare configure --backup-max-bytes 1073741824
rare configure --show
rare wallet generate          # display only
rare wallet generate --save   # save to config
```

A wallet is auto-generated on first use if none is configured.

### Deploy ERC-721

```bash
rare deploy erc721 "<name>" "<symbol>" [--max-tokens <n>] [--chain <chain>]
```

Deploys via RARE factory. Outputs the new contract address.

### Import ERC-721

```bash
rare import erc721 --contract <address> [--chain <chain>]
```

Imports an existing ERC-721 contract into the RARE Protocol registry.

### Mint

With local media upload (uploads image/video to IPFS, builds metadata, then mints):

```bash
rare mint --contract <address> --name "My NFT" --description "A description" --image ./art.png [--video ./animation.mp4] [--tag art --tag digital] [--attribute "Base=Starfish" --attribute '{"trait_type":"Power","value":40,"display_type":"boost_number"}'] [--to <address>] [--royalty-receiver <address>] [--chain <chain>]
```

With a pre-built metadata URI:

```bash
rare mint --contract <address> --token-uri <ipfs://...> [--to <address>] [--royalty-receiver <address>] [--chain <chain>]
```

### Backup

Resolve an existing token, quote its billable bytes, and optionally preserve it through a hosted x402-backed service:

```bash
rare backup token --contract <addr> --token-id <id> [--chain <chain>] --quote-only --service-url <url>
rare backup token --contract <addr> --token-id <id> [--chain <chain>] [--payment-chain <chain>] --service-url <url>
rare backup token --universal-token-id <chainId-contract-tokenId> --service-url <url>
```

### Auction Lifecycle

```bash
# Create (auto-approves if needed)
rare auction create --contract <addr> --token-id <id> --starting-price <eth> --duration <seconds> [--currency <erc20>]

# Bid
rare auction bid --contract <addr> --token-id <id> --amount <eth> [--currency <erc20>]

# Settle (after auction ends)
rare auction settle --contract <addr> --token-id <id>

# Cancel (only if no bids)
rare auction cancel --contract <addr> --token-id <id>

# Check status (read-only)
rare auction status --contract <addr> --token-id <id>
```

### Offers

```bash
# Create an offer on a token
rare offer create --contract <addr> --token-id <id> --amount <eth> [--currency <currency>] [--convertible]

# Cancel an offer
rare offer cancel --contract <addr> --token-id <id> [--currency <currency>]

# Accept an offer on a token you own
rare offer accept --contract <addr> --token-id <id> --amount <eth> [--currency <currency>]

# Check offer status (read-only)
rare offer status --contract <addr> --token-id <id> [--currency <currency>]
```

### Listings

```bash
# Create a listing (set sale price; auto-approves if needed)
rare listing create --contract <addr> --token-id <id> --price <eth> [--currency <currency>] [--target <address>]

# Cancel a listing
rare listing cancel --contract <addr> --token-id <id> [--target <address>]

# Buy a listed token
rare listing buy --contract <addr> --token-id <id> --amount <eth> [--currency <currency>]

# Check listing status (read-only)
rare listing status --contract <addr> --token-id <id> [--target <address>]
```

### Currencies

All marketplace commands (`auction`, `offer`, `listing`) accept `--currency` with a named token (`eth`, `usdc`, `rare`) or an ERC20 address. ERC20 allowances are auto-approved when needed.

```bash
# List supported currencies and addresses for the active chain
rare currencies [--chain <chain>]
```

### Search

```bash
# List NFTs owned by your wallet
rare search tokens [--query <text>] [--take <n>] [--cursor <n>] [--chain <chain>]

# List NFTs with auctions (defaults to PENDING, RUNNING; accepts PENDING, RUNNING, SETTLED, UNSETTLED)
rare search auctions [--state <states...>] [--owner <address>] [--query <text>] [--take <n>] [--cursor <n>] [--chain <chain>]

# List collections owned by your wallet
rare search collections [--query <text>] [--take <n>] [--cursor <n>] [--chain <chain>]
```

### Query Status (read-only)

```bash
rare status --contract <addr> [--token-id <id>] [--chain <chain>]
```

## Contract Addresses

| Contract | Sepolia | Mainnet | Base Sepolia | Base |
|----------|---------|---------|--------------|------|
| Factory  | `0x3c7526a0975156299ceef369b8ff3c01cc670523` | `0xAe8E375a268Ed6442bEaC66C6254d6De5AeD4aB1` | `0x2b181ae0f1aea6fed75591b04991b1a3f9868d51` | `0xf776204233bfb52ba0ddff24810cbdbf3dbf94dd` |
| Auction  | `0xC8Edc7049b233641ad3723D6C60019D1c8771612` | `0x6D7c44773C52D396F43c2D511B81aa168E9a7a42` | `0x1f0c946f0ee87acb268d50ede6c9b4d010af65d2` | `0x51c36ffb05e17ed80ee5c02fa83d7677c5613de2` |

## Development

- Source: `src/` (TypeScript, ESM)
- Entry: `src/index.ts`
- CLI framework: Commander.js v12
- Blockchain: Viem v2
- Build: tsup v8 (`npm run build`, `npm run dev` for watch)
- Commands are in `src/commands/`, ABIs in `src/contracts/abis/`, addresses in `src/contracts/addresses.ts`

## Using the CLI as an Agent

When operating as an autonomous agent using this CLI:

1. **Always check config first:** Run `rare configure --show` to verify a wallet and RPC are configured before attempting transactions.
2. **Prefer sepolia for testing:** Default to sepolia unless the user explicitly asks for mainnet.
3. **Build before running:** If source has changed, run `npm run build` before invoking the CLI.
4. **Read-only first:** Use `rare status` and `rare auction status` to inspect state before taking actions.
5. **Capture output:** All commands print structured output. Parse contract addresses, token IDs, and tx hashes from stdout.
6. **Error handling:** Contract errors include revert reasons. If a tx fails, read the error message before retrying.
7. **Auction flow:** The full lifecycle is: deploy -> mint -> auction create -> bid -> settle. Each step requires the output of the previous step.
8. **Approval is automatic:** `auction create` and `listing create` handle NFT approval automatically — no separate approval step needed.
9. **ERC20 approval is automatic:** When using `--currency` with an ERC20 token, the CLI auto-approves allowances for bids, offers, and purchases.
10. **Offer/listing flow:** Offers and listings are alternatives to auctions. A seller can list at a fixed price (`listing create`) or a buyer can make an offer (`offer create`).
