# RARE Protocol CLI

Command-line tool for the [RARE Protocol](https://superrare.com) on Ethereum. Deploy NFT contracts, mint tokens, run auctions — all from your terminal.

## Quick Start

```bash
npm install
npm run build
```

The CLI is available as the `rare` command:

```bash
# Link globally for development
npm link

# Or run directly
node dist/index.js
```

### First Run

No wallet? No problem. The CLI auto-generates one the first time you run a command that needs a key. It saves the private key to your config so you don't have to think about it.

Or generate one explicitly:

```bash
rare wallet generate --save
```

### Set Up Your RPC (Recommended)

Public RPC endpoints are unreliable. Point the CLI at your own node:

```bash
rare configure --chain sepolia --rpc-url https://your-rpc-endpoint.com
```

## Commands

### `rare configure`

Manage CLI configuration. Stored at `~/.rare/config.json`.

```bash
# Set private key and RPC for a chain
rare configure --chain sepolia --private-key 0x... --rpc-url https://...

# Change default network
rare configure --default-chain mainnet

# View current config (private keys are masked)
rare configure --show
```

| Option | Description |
|---|---|
| `--chain <chain>` | Chain to configure (`sepolia` or `mainnet`) |
| `--private-key <key>` | Private key for the chain |
| `--rpc-url <url>` | Custom RPC endpoint |
| `--default-chain <chain>` | Set the default network |
| `--show` | Display current configuration |

---

### `rare wallet generate`

Generate a new Ethereum wallet.

```bash
# Just display the new wallet
rare wallet generate

# Generate and save to config
rare wallet generate --save

# Save to a specific chain
rare wallet generate --save --chain mainnet
```

| Option | Description |
|---|---|
| `--save` | Save the key to config |
| `--chain <chain>` | Chain to save the key to (default: `sepolia`) |

---

### `rare deploy erc721`

Deploy a new ERC-721 NFT contract through the RARE Protocol factory.

```bash
# Basic deployment
rare deploy erc721 "My Collection" "MC"

# With a max supply cap
rare deploy erc721 "My Collection" "MC" --max-tokens 1000

# On mainnet
rare deploy erc721 "My Collection" "MC" --chain mainnet
```

| Argument / Option | Description |
|---|---|
| `<name>` | Collection name |
| `<symbol>` | Collection symbol |
| `--max-tokens <n>` | Maximum mintable supply |
| `--chain <chain>` | Network (`sepolia` or `mainnet`) |

**Output:** The deployed contract address, parsed from the `SovereignNFTContractCreated` event.

---

### `rare mint`

Mint a new NFT on a deployed contract.

```bash
# Mint with a metadata URI you've already uploaded
rare mint --contract 0x... --uri ipfs://Qm...

# Mint to a different address
rare mint --contract 0x... --uri ipfs://Qm... --to 0x...

# Specify a royalty receiver
rare mint --contract 0x... --uri ipfs://Qm... --royalty-receiver 0x...
```

| Option | Description |
|---|---|
| `--contract <address>` | **(required)** Token contract address |
| `--uri <uri>` | **(required)** Metadata URI (IPFS or any URL) |
| `--to <address>` | Recipient address (default: caller) |
| `--royalty-receiver <address>` | Royalty receiver (default: caller) |
| `--chain <chain>` | Network |

**Output:** Transaction hash and minted token ID.

---

### `rare auction create`

Start an auction for an NFT. Automatically handles approval if the auction contract isn't already approved to transfer your tokens.

```bash
rare auction create \
  --contract 0x... \
  --token-id 1 \
  --starting-price 0.1 \
  --duration 86400
```

| Option | Description |
|---|---|
| `--contract <address>` | **(required)** NFT contract address |
| `--token-id <id>` | **(required)** Token ID to auction |
| `--starting-price <amount>` | **(required)** Starting price in ETH |
| `--duration <seconds>` | **(required)** Auction duration in seconds |
| `--currency <address>` | ERC-20 token address (default: ETH) |
| `--chain <chain>` | Network |

### `rare auction bid`

Place a bid on an active auction.

```bash
rare auction bid --contract 0x... --token-id 1 --amount 0.5
```

| Option | Description |
|---|---|
| `--contract <address>` | **(required)** NFT contract address |
| `--token-id <id>` | **(required)** Token ID |
| `--amount <amount>` | **(required)** Bid amount in ETH |
| `--currency <address>` | ERC-20 token address (default: ETH) |
| `--chain <chain>` | Network |

### `rare auction settle`

Settle a completed auction. Transfers the NFT to the winner and distributes funds.

```bash
rare auction settle --contract 0x... --token-id 1
```

### `rare auction cancel`

Cancel an auction that has no bids.

```bash
rare auction cancel --contract 0x... --token-id 1
```

### `rare auction status`

Check the current state of an auction (read-only, no wallet required).

```bash
rare auction status --contract 0x... --token-id 1
```

**Output:**
```
Auction Details:
  Seller:         0x...
  Starting price: 0.1 ETH
  Current bid:    0.5 ETH
  End time:       2026-03-10T12:00:00.000Z (1741608000)
  Currency:       ETH
  Auction type:   1
```

---

### `rare status`

Query contract and token information (read-only).

```bash
# Contract info
rare status --contract 0x...

# Include a specific token
rare status --contract 0x... --token-id 1
```

| Option | Description |
|---|---|
| `--contract <address>` | **(required)** Token contract address |
| `--token-id <id>` | Query a specific token's owner and URI |
| `--chain <chain>` | Network |

---

## Networks

All commands accept `--chain` to select a network. Defaults to `sepolia` unless changed with `rare configure --default-chain`.

| Network | Factory | Auction |
|---|---|---|
| Sepolia | `0xce719c6C4aCac81c6052Fb2A6723B7e4209a7992` | `0xC8Edc7049b233641ad3723D6C60019D1c8771612` |
| Mainnet | `0x8B0a05d8FCEA149dC2d215342b233962dcc63483` | `0x6D7c44773C52D396F43c2D511B81aa168E9a7a42` |

## Configuration

Config is stored at `~/.rare/config.json`:

```json
{
  "defaultChain": "sepolia",
  "chains": {
    "sepolia": {
      "privateKey": "0x...",
      "rpcUrl": "https://..."
    }
  }
}
```

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev
```

Built with [Commander](https://github.com/tj/commander.js) and [Viem](https://viem.sh). Requires Node.js 24+.
