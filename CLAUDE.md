# RARE Protocol CLI

CLI tool for interacting with RARE Protocol smart contracts on Ethereum. Deploy NFT contracts, mint tokens, and manage auctions.

## Quick Reference

Binary: `rare` (after `npm link`) or `node dist/index.js`
Runtime: Node.js 24+
Config: `~/.rare/config.json`
Networks: `sepolia` (default), `mainnet`

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

### Mint

```bash
rare mint --contract <address> --uri <ipfs://...> [--to <address>] [--royalty-receiver <address>] [--chain <chain>]
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

### Query Status (read-only)

```bash
rare status --contract <addr> [--token-id <id>] [--chain <chain>]
```

## Contract Addresses

| Contract | Sepolia | Mainnet |
|----------|---------|---------|
| Factory  | `0xce719c6C4aCac81c6052Fb2A6723B7e4209a7992` | `0x8B0a05d8FCEA149dC2d215342b233962dcc63483` |
| Auction  | `0xC8Edc7049b233641ad3723D6C60019D1c8771612` | `0x6D7c44773C52D396F43c2D511B81aa168E9a7a42` |

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
8. **Approval is automatic:** `auction create` handles NFT approval automatically — no separate approval step needed.
