---
name: rare-protocol
description: Interact with RARE Protocol smart contracts on Ethereum. Use when the user wants to deploy NFT contracts, mint tokens, create or manage auctions, or check on-chain status using the RARE Protocol CLI.
allowed-tools: Bash(rare *), Bash(node dist/index.js *), Bash(npm run build), Bash(npm install)
---

# RARE Protocol CLI

You have access to the `rare` CLI for interacting with RARE Protocol smart contracts on Ethereum.

## Setup

Before running any commands, ensure the CLI is built and configured:

```bash
# Build (required after source changes)
npm install && npm run build

# Check current config
rare configure --show
```

If no wallet is configured, one is auto-generated on first use. To explicitly generate and save:

```bash
rare wallet generate --save
```

To set a custom RPC endpoint (recommended over public defaults):

```bash
rare configure --chain sepolia --rpc-url https://your-rpc-endpoint.com
```

## Available Commands

### Configuration & Wallet

```bash
rare configure --chain sepolia --private-key 0x... --rpc-url https://...
rare configure --default-chain mainnet
rare configure --show
rare wallet generate          # display only
rare wallet generate --save   # save to config
```

### Deploy ERC-721

```bash
rare deploy erc721 "<name>" "<symbol>" [--max-tokens <n>] [--chain <chain>]
```

Deploys via RARE factory. Outputs the new contract address.

### Mint

```bash
rare mint --contract <address> --uri <ipfs://...> [--to <address>] [--royalty-receiver <address>] [--chain <chain>]
```

### Auction Lifecycle

```bash
# Create (auto-approves NFT transfer if needed)
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

### Query Status (read-only)

```bash
rare status --contract <addr> [--token-id <id>] [--chain <chain>]
```

## Contract Addresses

| Contract | Sepolia | Mainnet |
|----------|---------|---------|
| Factory  | `0xce719c6C4aCac81c6052Fb2A6723B7e4209a7992` | `0x8B0a05d8FCEA149dC2d215342b233962dcc63483` |
| Auction  | `0xC8Edc7049b233641ad3723D6C60019D1c8771612` | `0x6D7c44773C52D396F43c2D511B81aa168E9a7a42` |

## Agent Guidelines

1. **Always check config first:** Run `rare configure --show` before attempting transactions.
2. **Default to sepolia** unless the user explicitly asks for mainnet.
3. **Build before running:** Run `npm run build` if source has changed.
4. **Read-only first:** Use `rare status` and `rare auction status` to inspect state before taking actions.
5. **Capture output:** Parse contract addresses, token IDs, and tx hashes from stdout.
6. **Error handling:** Contract errors include revert reasons. Read the error before retrying.
7. **Auction flow:** The full lifecycle is: deploy -> mint -> auction create -> bid -> settle. Each step requires the output of the previous step.
8. **Approval is automatic:** `auction create` handles NFT approval — no separate step needed.

## Networks

All commands accept `--chain <sepolia|mainnet>`. Defaults to `sepolia` unless changed with `rare configure --default-chain`.
