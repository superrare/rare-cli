# RARE Protocol CLI — Functionality Overview

## What It Is

A command-line tool for interacting with the RARE Protocol smart contracts on Ethereum. It allows users to deploy NFT contracts, mint NFTs, and manage auctions — all from the terminal.

**Version:** 0.1.0
**Runtime:** Node.js 22+
**Blockchain Library:** Viem v2
**Supported Networks:** Ethereum Mainnet, Sepolia Testnet

---

## Commands

### `rare configure`

Manages CLI configuration stored at `~/.rare/config.json`.

| Option | Description |
|---|---|
| `--chain <chain>` | Target chain (`sepolia` or `mainnet`) |
| `--private-key <key>` | Set private key for signing transactions |
| `--rpc-url <url>` | Set custom RPC endpoint |
| `--default-chain <chain>` | Set the default network |
| `--show` | Display current config (keys masked) |

---

### `rare deploy erc721 <name> <symbol>`

Deploys a new ERC-721 NFT contract via the RARE Protocol factory.

| Option | Description |
|---|---|
| `--max-tokens <number>` | Max mintable supply |
| `--chain <chain>` | Network to deploy on |

**Flow:** Calls `createSovereignNFTContract()` on the factory → parses `SovereignNFTContractCreated` event → outputs deployed contract address.

**Factory Addresses:**
- Sepolia: `0xce719c6C4aCac81c6052Fb2A6723B7e4209a7992`
- Mainnet: `0x8B0a05d8FCEA149dC2d215342b233962dcc63483`

---

### `rare mint`

Mints a new NFT on an existing ERC-721 contract.

| Option | Description |
|---|---|
| `--contract <address>` | **(required)** Token contract address |
| `--uri <uri>` | **(required)** Token metadata URI (IPFS hash or full URL) |
| `--to <address>` | Recipient (defaults to caller) |
| `--royalty-receiver <address>` | Royalty receiver (defaults to caller) |
| `--chain <chain>` | Network |

**Current Flow:**
1. User provides a pre-existing metadata URI (e.g. an IPFS URL)
2. If `--to` or `--royalty-receiver` is specified → calls `mintTo(uri, receiver, royaltyReceiver)`
3. Otherwise → calls `addNewToken(uri)`
4. Parses `Transfer` event to extract the minted token ID
5. Outputs tx hash, block number, and token ID

#### Planned Improvement: Mint with Local Image

The current flow requires the user to have already uploaded metadata to IPFS. The improved flow will let users mint by providing human-readable inputs and a local image file:

**New options:**
- `--name <name>` — NFT name
- `--description <text>` — NFT description
- `--image <path>` — Path to a local image file

**Planned flow:**
1. User runs: `rare mint --contract 0x... --name "My NFT" --description "A cool piece" --image ./art.png`
2. CLI uploads the local image file to the backend API, which pins it to IPFS → returns an IPFS image URI
3. CLI constructs ERC-721 metadata JSON (`{ name, description, image }`)
4. CLI sends the metadata JSON to the backend API, which pins it to IPFS → returns an IPFS metadata URI
5. CLI calls the contract's mint function with the metadata URI
6. Outputs tx hash, block number, and token ID

This makes minting a single-step experience — users no longer need to manually upload to IPFS beforehand.

The existing `--uri` option will remain supported for users who already have metadata pinned.

---

### `rare auction`

Full auction lifecycle management with the following subcommands:

#### `rare auction create`

| Option | Description |
|---|---|
| `--contract <address>` | **(required)** NFT contract address |
| `--token-id <id>` | **(required)** Token ID to auction |
| `--starting-price <amount>` | **(required)** Starting price in ETH/token units |
| `--duration <seconds>` | **(required)** Auction duration |
| `--currency <address>` | ERC20 currency (defaults to ETH) |
| `--chain <chain>` | Network |

**Flow:** Checks NFT approval → auto-approves auction contract if needed → calls `configureAuction()` with COLDIE_AUCTION type.

#### `rare auction bid`

| Option | Description |
|---|---|
| `--contract <address>` | **(required)** NFT contract address |
| `--token-id <id>` | **(required)** Token ID |
| `--amount <amount>` | **(required)** Bid amount |
| `--currency <address>` | Currency (defaults to ETH) |
| `--chain <chain>` | Network |

#### `rare auction settle`

Settles a completed auction — transfers NFT to winner and distributes funds.

| Option | Description |
|---|---|
| `--contract <address>` | **(required)** NFT contract |
| `--token-id <id>` | **(required)** Token ID |
| `--chain <chain>` | Network |

#### `rare auction cancel`

Cancels an auction (only if no bids placed).

| Option | Description |
|---|---|
| `--contract <address>` | **(required)** NFT contract |
| `--token-id <id>` | **(required)** Token ID |
| `--chain <chain>` | Network |

#### `rare auction status`

Read-only query that displays auction details: seller, starting price, current bid, end time, currency, and auction type.

| Option | Description |
|---|---|
| `--contract <address>` | **(required)** NFT contract |
| `--token-id <id>` | **(required)** Token ID |
| `--chain <chain>` | Network |

---

## Architecture

```
src/
├── index.ts              # CLI entry point, registers all commands
├── config.ts             # Config management (~/.rare/config.json)
├── client.ts             # Viem public + wallet client setup
├── errors.ts             # Centralized contract error formatting
├── commands/
│   ├── configure.ts      # Configure command
│   ├── deploy.ts         # Deploy ERC-721 contracts
│   ├── mint.ts           # Mint NFTs
│   └── auction.ts        # Auction lifecycle (create/bid/settle/cancel/status)
└── contracts/
    ├── addresses.ts      # Contract addresses per chain
    └── abis/
        ├── token.ts      # ERC-721 + RARE extensions ABI
        ├── auction.ts    # Auction house ABI
        └── factory.ts    # Factory ABI
```

**Key patterns:**
- All commands accept `--chain` to select network; defaults to configured `defaultChain`
- Transaction commands: send tx → wait for receipt → parse event logs → display results
- Read-only commands: call view functions → format and display
- Error handling walks the Viem error cause chain to surface revert reasons

---

## Contract Addresses

| Contract | Sepolia | Mainnet |
|---|---|---|
| Factory | `0xce719c6C4aCac81c6052Fb2A6723B7e4209a7992` | `0x8B0a05d8FCEA149dC2d215342b233962dcc63483` |
| Auction | `0xC8Edc7049b233641ad3723D6C60019D1c8771612` | `0x6D7c44773C52D396F43c2D511B81aa168E9a7a42` |
