# RARE Protocol CLI

Command-line tool for the [RARE Protocol](https://superrare.com) on Ethereum. Deploy NFT contracts, mint tokens, run auctions, and search the network — all from your terminal.

## Install

```bash
npm install -g @rareprotocol/rare-cli
```

This makes the `rare` command available globally.

## Getting Started

### 1. Configure a wallet

Import an existing private key:

```bash
rare configure --chain sepolia --private-key 0xYourPrivateKeyHere
```

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

Supported chains: `mainnet`, `sepolia`, `base`, `base-sepolia`, `arbitrum`, `arbitrum-sepolia`, `optimism`, `optimism-sepolia`, `zora`, `zora-sepolia`

> **Note:** RARE Protocol contracts (deploy, auction) are currently deployed on `mainnet` and `sepolia` only. Other chains support wallet, search, and status operations.

### Deploy an NFT Collection

```bash
rare deploy erc721 "My Collection" "MC"
rare deploy erc721 "My Collection" "MC" --max-tokens 1000
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

## Configuration

Config is stored at `~/.rare/config.json`. Each chain has its own private key and RPC URL.

```bash
# Set private key and RPC for a chain
rare configure --chain sepolia --private-key 0x... --rpc-url https://...

# Configure multiple chains
rare configure --chain base --rpc-url https://your-base-rpc.com
rare configure --chain arbitrum --private-key 0x... --rpc-url https://your-arb-rpc.com

# Change default network
rare configure --default-chain mainnet

# View current config
rare configure --show
```

## Best Practices

- **Use sepolia for testing.** Default to sepolia and only switch to mainnet when you're ready.
- **Set a reliable RPC endpoint.** Public endpoints throttle and drop requests. Services like Alchemy or Infura provide free tiers.
- **Don't share your private key.** The config file at `~/.rare/config.json` contains your key in plaintext. Keep it secure and never commit it to version control.
- **Check status before transacting.** Use `rare status` and `rare auction status` to inspect on-chain state before sending transactions.
- **Back up your wallet.** If you lose your private key, you lose access to your assets. Store a copy somewhere safe.

## Contract Addresses

| Network | Factory | Auction |
|---|---|---|
| Sepolia | `0x3c7526a0975156299ceef369b8ff3c01cc670523` | `0xC8Edc7049b233641ad3723D6C60019D1c8771612` |
| Mainnet | `0xAe8E375a268Ed6442bEaC66C6254d6De5AeD4aB1` | `0x6D7c44773C52D396F43c2D511B81aa168E9a7a42` |

## Contributing

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

To test the CLI locally without a global install:

```bash
node dist/index.js --help
# or
npm link
rare --help
```

Requires Node.js 24+. Built with [Commander](https://github.com/tj/commander.js) and [Viem](https://viem.sh).

## License

[MIT](LICENSE)
