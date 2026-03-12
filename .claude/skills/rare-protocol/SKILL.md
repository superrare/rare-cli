---
name: rare-protocol
description: Interact with RARE Protocol from the CLI. Use when the user wants to configure wallets/RPC, deploy or import ERC-721 contracts, mint NFTs, run auctions, search assets, list collections, or inspect on-chain status.
allowed-tools: Bash(rare *), Bash(npm install -g @rareprotocol/rare-cli), Bash(npm update -g @rareprotocol/rare-cli), Bash(npm run build), Bash(npm install), Bash(node dist/index.js *)
---

# RARE Protocol CLI

Use the `rare` CLI to interact with RARE Protocol contracts and APIs from the terminal.

## Setup

Install and use the globally published CLI package:

```bash
# Install globally
npm install -g @rareprotocol/rare-cli

# Verify install
rare --help

# Check current config
rare configure --show
```

If the global install is already present but outdated:

```bash
npm update -g @rareprotocol/rare-cli
```

If no wallet is configured for a chain, the CLI auto-generates one on first use.
To explicitly generate and save a wallet:

```bash
rare wallet generate --save
```

Set a custom RPC URL (recommended over public defaults):

```bash
rare configure --chain sepolia --rpc-url https://your-rpc-endpoint.com
```

## Networks

All command groups support `--chain`.

Supported chains:
`mainnet`, `sepolia`, `base`, `base-sepolia`, `arbitrum`, `arbitrum-sepolia`, `optimism`, `optimism-sepolia`, `zora`, `zora-sepolia`

RARE protocol contracts used by `deploy` and `auction` are currently deployed on:
`mainnet`, `sepolia`

## Command Reference

### Configuration and Wallet

```bash
rare configure --chain sepolia --private-key 0x... --rpc-url https://...
rare configure --default-chain mainnet
rare configure --show
rare wallet generate          # display only
rare wallet generate --save   # save to config
rare wallet address
```

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

```bash
# Mint with pre-built metadata URI
rare mint --contract <address> --token-uri <ipfs://...> [--to <address>] [--royalty-receiver <address>] [--chain <chain>]

# Or upload local media/metadata in one flow
rare mint --contract <address> --name "My NFT" --description "A description" --image ./art.png [--video ./animation.mp4] [--tag art --tag digital] [--attribute "Base=Starfish" --attribute '{"trait_type":"Power","value":40,"display_type":"boost_number"}'] [--to <address>] [--royalty-receiver <address>] [--chain <chain>]
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

### Search

```bash
# List NFTs (optionally filter by text/owner/pagination)
rare search tokens [--query <text>] [--owner <address>] [--mine] [--take <n>] [--cursor <n>] [--chain <chain>]

# List NFTs with auctions (defaults to PENDING, RUNNING)
rare search auctions [--state <states...>] [--owner <address>] [--query <text>] [--take <n>] [--cursor <n>] [--chain <chain>]

# List collections owned by your wallet
rare search collections [--query <text>] [--take <n>] [--cursor <n>] [--chain <chain>]
```

### List All Collections

```bash
rare list-collections [--query <text>] [--chain <chain>]
```

### Query Status (read-only)

```bash
rare status --contract <addr> [--token-id <id>] [--chain <chain>]
```

## Contract Addresses

| Contract | Sepolia | Mainnet |
|----------|---------|---------|
| Factory  | `0x3c7526a0975156299ceef369b8ff3c01cc670523` | `0xAe8E375a268Ed6442bEaC66C6254d6De5AeD4aB1` |
| Auction  | `0xC8Edc7049b233641ad3723D6C60019D1c8771612` | `0x6D7c44773C52D396F43c2D511B81aa168E9a7a42` |

## Agent Guidelines

1. **Always check config first:** Run `rare configure --show` before attempting transactions.
2. **Default to sepolia** unless the user explicitly asks for another chain.
3. **Prefer global CLI usage:** Use the globally installed `rare` binary for normal operation.
4. **Read-only first:** Use `rare status` and `rare auction status` to inspect state before taking actions.
5. **Capture output:** Parse contract addresses, token IDs, and tx hashes from stdout.
6. **Error handling:** Contract errors include revert reasons. Read the error before retrying.
7. **Lifecycle flow:** Typical flow is deploy/import -> mint -> auction create -> bid -> settle. Each step depends on data from prior output.
8. **Approval is automatic:** `auction create` handles NFT approval — no separate step needed.
9. **Local source workflows are optional:** Only use `npm install && npm run build` plus `node dist/index.js` when explicitly testing or modifying this repository.
