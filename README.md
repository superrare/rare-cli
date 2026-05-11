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

Configure RareMinter release allowlists and limits from files or direct values. Allowlist CSV files can be a single address column or include an `address`, `user address`, `wallet`, or `wallet address` header. JSON files can be an array of address strings, address objects, or a generated artifact.

```bash
rare release allowlist build --input allowlist.csv --output allowlist-artifact.json
rare release allowlist proof --input allowlist-artifact.json --account 0x...
rare release allowlist set --contract 0x... --input allowlist-artifact.json --end-timestamp 1778500000
rare release limits set-mint --contract 0x... --limit 5
rare release limits set-tx --contract 0x... --limit 2
rare release staking set-minimum --contract 0x... --minimum 1000000000000000000 --end-timestamp 1778500000
rare release status --contract 0x... --account 0x...
rare release mint --contract 0x... --quantity 1
rare release mint --contract 0x... --quantity 1 --proof proof.json
```

`set-mint` limits the total mints per wallet, `set-tx` limits the number of mint transactions per wallet, and `staking set-minimum` configures the raw staking-token amount required while the end timestamp is active. Use `0` for a limit or minimum to disable that check on the contract. `release mint` reads the configured direct sale currency and price by default; pass `--currency` or `--price` only when you want the command to fail if on-chain sale settings differ. RareMinter direct sales mint to the connected wallet.

Build batch marketplace token-list Merkle artifacts for later batch offer, batch listing, and batch auction flows. CSV files should include contract and token ID columns such as `contract_address,token_id`; JSON files can be an array of `{ "contractAddress": "0x...", "tokenId": "1" }` objects or a generated artifact. Pass `--chain-id` or include a `chain_id` column when the artifact should carry chain context.

```bash
rare batch tree build --input batch-tokens.csv --chain-id 11155111 --output batch-token-artifact.json
rare batch tree proof --input batch-token-artifact.json --contract 0x... --token-id 1 --output proof.json
rare batch tree verify --input batch-token-artifact.json --contract 0x... --token-id 1 --proof proof.json
```

Batch token artifacts use `type: "rare-batch-token-list"` and include `root`, `count`, optional `chainId`, canonical sorted `tokens`, and per-token `entries` with leaves and proofs. Proof artifacts use `type: "rare-batch-token-proof"` and include `root`, `contractAddress`, `tokenId`, optional `chainId`, `leaf`, `proof`, and `valid`.

Use the generated root and proof artifacts with batch offer commands. Batch offers escrow the offer amount plus marketplace fee in the `BatchOfferCreator`; accepting a batch offer validates the proof, verifies the connected wallet owns the token, and auto-approves the NFT transfer unless `--no-auto-approve` is passed.

```bash
rare batch offer create --input batch-token-artifact.json --amount 1.0 --expiry 1778500000
rare batch offer status --creator 0x... --input batch-token-artifact.json
rare batch offer accept --creator 0x... --proof proof.json --contract 0x... --token-id 1
rare batch offer revoke --input batch-token-artifact.json
```

Batch auctions use the same token-list and proof artifacts. Creating a batch auction registers a reserve price for the Merkle root and, when `--input` includes token context, auto-approves the configured ERC721 approval manager for those token contracts unless `--no-auto-approve` is passed. Bidding validates the proof and sends the bid amount plus marketplace fee.

```bash
rare batch auction create --input batch-token-artifact.json --reserve 1.0 --duration 86400
rare batch auction status --creator 0x... --input batch-token-artifact.json --contract 0x... --token-id 1
rare batch auction bid --creator 0x... --proof proof.json --contract 0x... --token-id 1 --amount 1.0
rare batch auction settle --contract 0x... --token-id 1
rare batch auction cancel --input batch-token-artifact.json
```

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
  --split-recipient 0x...seller \
  --split-ratio 100

# Place a bid
rare auction bid --contract 0x... --token-id 1 --amount 0.5

# Settle after the auction ends
rare auction settle --contract 0x... --token-id 1

# Cancel (only if no bids placed)
rare auction cancel --contract 0x... --token-id 1

# Check auction status (read-only)
rare auction status --contract 0x... --token-id 1
```

Reserve auctions start when the first valid bid meets the reserve. Scheduled auctions escrow the token at configuration time and become bid-ready at `--start-time`. Use repeated `--split-recipient` and `--split-ratio` pairs when seller proceeds should be split; ratios must sum to 100.

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

### Collection-Wide Offers

Collection-wide offers are made against an origin collection and can be accepted by any current owner of a token in that collection. They are different from token-specific Bazaar offers, which target one contract/token ID pair.

```bash
# Create a collection-wide offer
rare collection-market offer create --collection 0x... --amount 0.5

# Cancel your collection-wide offer
rare collection-market offer cancel --collection 0x...

# Accept a collection-wide offer for a token you own
rare collection-market offer accept --collection 0x... --buyer 0x...buyer --token-id 1 --amount 0.5

# Check collection offer status and wallet affordances
rare collection-market offer status --collection 0x... --buyer 0x...buyer --token-id 1
```

The current `RareCollectionMarket` contract stores buyer, origin collection, currency, amount, and marketplace fee. It does not store offer expiry or timing fields, so status reports expiry as unsupported.

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

All marketplace commands (`auction`, `offer`, `listing`, `collection-market offer`) accept `--currency` to specify a payment token. Named currencies (`eth`, `usdc`, `rare`) are resolved per-chain automatically. You can also pass any ERC20 address directly.

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

### Configure RareMinter release settings

```ts
const allowlist = rare.release.buildAllowlist({
  content: 'address\n0x1111111111111111111111111111111111111111\n0x2222222222222222222222222222222222222222\n',
  format: 'csv',
});

const proof = rare.release.getAllowlistProof({
  artifact: allowlist,
  address: '0x1111111111111111111111111111111111111111',
});

await rare.release.setAllowlistConfig({
  contract: '0xLazySovereignContractAddress',
  root: allowlist.root,
  endTimestamp: 1778500000,
});

await rare.release.setMintLimit({
  contract: '0xLazySovereignContractAddress',
  limit: 5,
});

const status = await rare.release.getConfig({
  contract: '0xLazySovereignContractAddress',
  account: '0x1111111111111111111111111111111111111111',
});

const minted = await rare.release.mintDirectSale({
  contract: '0xLazySovereignContractAddress',
  quantity: 1,
  proof: proof.proof,
});

console.log(proof.valid, status.mintLimit, minted.tokenIds);
```

### Create and accept collection-wide offers

```ts
const collectionOffer = await rare.collectionMarket.offer.create({
  originCollection: '0xCollectionAddress',
  amount: '1.0',
});

const collectionOfferStatus = await rare.collectionMarket.offer.getStatus({
  originCollection: '0xCollectionAddress',
  buyer: collectionOffer.buyer,
  tokenId: 1,
});

const acceptedCollectionOffer = await rare.collectionMarket.offer.accept({
  originCollection: '0xCollectionAddress',
  buyer: collectionOffer.buyer,
  tokenId: 1,
  amount: '1.0',
});

console.log(collectionOfferStatus.state, acceptedCollectionOffer.txHash);
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

### Create and accept batch offers

```ts
const createdOffer = await rare.batch.offer.create({
  artifact: tree,
  amount: '1.0',
  expiry: 1778500000,
});

const offerStatus = await rare.batch.offer.getStatus({
  creator: createdOffer.creator,
  root: tree.root,
});

const acceptedOffer = await rare.batch.offer.accept({
  creator: createdOffer.creator,
  proofArtifact: tokenProof,
  contract: tokenProof.contractAddress,
  tokenId: tokenProof.tokenId,
});

console.log(offerStatus.state, acceptedOffer.txHash);
```

### Create and settle batch auctions

```ts
const createdAuction = await rare.batch.auction.create({
  artifact: tree,
  reserveAmount: '1.0',
  duration: 86400,
});

const auctionStatus = await rare.batch.auction.getStatus({
  creator: createdAuction.creator,
  root: tree.root,
  contract: tokenProof.contractAddress,
  tokenId: tokenProof.tokenId,
});

const bid = await rare.batch.auction.bid({
  creator: createdAuction.creator,
  proofArtifact: tokenProof,
  contract: tokenProof.contractAddress,
  tokenId: tokenProof.tokenId,
  amount: '1.0',
});

const settled = await rare.batch.auction.settle({
  contract: tokenProof.contractAddress,
  tokenId: tokenProof.tokenId,
});

console.log(auctionStatus.state, bid.requiredPayment, settled.txHash);
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

| Network | Factory | Sovereign Factory | Lazy Sovereign Factory | Space Factory | RareMinter | Auction | CollectionMarket | BatchOfferCreator | BatchAuctionHouse |
|---|---|---|---|---|---|---|---|---|---|
| Sepolia | `0x3c7526a0975156299ceef369b8ff3c01cc670523` | `0x46B2850ba7787734F648A6848b5eDE0815C1F8Bf` | `0xc5B8Ad9003673a23d005A6448C74d8955a1a38fA` | not configured | `0xd28Dc0B89104d7BBd902F338a0193fF063617ccE` | `0xC8Edc7049b233641ad3723D6C60019D1c8771612` | not configured | `0x371cca54ef859bb0c7b910581a528ee47773fd56` | `0x293AE7701A7830B1d38A7608EdF86A106d9E2645` |
| Mainnet | `0xAe8E375a268Ed6442bEaC66C6254d6De5AeD4aB1` | `0xe980ec62378529d95ba446433f4deb6324129c59` | `0xba798BD606d86D207ca2751510173532899117a1` | `0x3b2d699110aa1788b2b1cae336e0ba8ff942a390` | `0x5fa112EFeD8297bec0010b312208d223E0cE891E` | `0x6D7c44773C52D396F43c2D511B81aa168E9a7a42` | not configured | `0xe15cf80b25272ade261532efdb7912f9104851d4` | `0x71742c7196f1c334C4c038ce6dcDcEE98097F9Da` |
| Base Sepolia | `0x2b181ae0f1aea6fed75591b04991b1a3f9868d51` | not configured | not configured | not configured | not configured | `0x1f0c946f0ee87acb268d50ede6c9b4d010af65d2` | not configured | not configured | `0x2b181ae0f1aea6fed75591b04991b1a3f9868d51` |
| Base | `0xf776204233bfb52ba0ddff24810cbdbf3dbf94dd` | not configured | not configured | not configured | not configured | `0x51c36ffb05e17ed80ee5c02fa83d7677c5613de2` | not configured | not configured | `0xf776204233bfb52ba0ddff24810cbdbf3dbf94dd` |

## Underlying Solidity Contracts

If you want to inspect the on-chain contracts used by this CLI:

- Token contract used when minting NFTs: [`SovereignBatchMint.sol`](https://github.com/superrare/core/blob/main/src/v2/token/ERC721/sovereign/SovereignBatchMint.sol)
- Factory used for collection deployments: [`SovereignBatchMintFactory.sol`](https://github.com/superrare/core/blob/main/src/v2/token/ERC721/sovereign/SovereignBatchMintFactory.sol)
- Token contract used for newer Sovereign batch minting: [`SovereignNFT.sol`](https://github.com/rareprotocol/core/blob/main/src/token/ERC721/sovereign/SovereignNFT.sol)
- Factory used for Sovereign collection creation: [`SovereignNFTContractFactory.sol`](https://github.com/rareprotocol/core/blob/main/src/token/ERC721/sovereign/SovereignNFTContractFactory.sol)
- Token contract used for Lazy Sovereign mint preparation: [`LazySovereignNFT.sol`](https://github.com/rareprotocol/core/blob/main/src/token/ERC721/sovereign/lazy/LazySovereignNFT.sol)
- Factory used for Lazy Sovereign release collection creation: [`LazySovereignNFTFactory.sol`](https://github.com/rareprotocol/core/blob/main/src/token/ERC721/sovereign/lazy/LazySovereignNFTFactory.sol)
- Minter used for release allowlists, mint limits, transaction limits, and seller staking requirements: [`RareMinter.sol`](https://github.com/rareprotocol/core/blob/main/src/collection/RareMinter.sol)
- RareSpace collection contract: [`RareSpaceNFT.sol`](https://github.com/rareprotocol/core/blob/main/src/token/ERC721/spaces/RareSpaceNFT.sol)
- Factory used for RareSpace collection creation: [`RareSpaceNFTContractFactory.sol`](https://github.com/rareprotocol/core/blob/main/src/token/ERC721/spaces/RareSpaceNFTContractFactory.sol)
- Auction/market contract used for auction operations: [`SuperRareBazaar.sol`](https://github.com/superrare/core/blob/main/src/bazaar/SuperRareBazaar.sol)
- Collection-wide offer contract interface: [`RareCollectionMarket.sol`](https://github.com/rareprotocol/core/blob/main/src/collection/RareCollectionMarket.sol)
- Batch offer contract used by batch token Merkle roots and proofs: [`BatchOffer.sol`](https://github.com/rareprotocol/core/blob/main/src/batchoffer/BatchOffer.sol)
- Batch auctionhouse ABI follows the SuperRare client contract surface: `registerAuctionMerkleRoot`, `bidWithAuctionMerkleProof`, `settleAuction`, and Merkle auction status reads.

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
