# RARE CLI MCP server tool map

This map reflects the MCP stdio server exposed by `rare mcp serve`.

## Server startup

```bash
rare mcp serve [--allow-writes]
```

Default behavior:
- `rare mcp serve` registers read-only tools only.
- `rare mcp serve --allow-writes` also registers write-capable tools.
- Tool names are SDK-path-shaped snake_case where possible. For example, `rare.collection.deploy.erc721` becomes `collection_deploy_erc721`.
- `config_summary` and `wallet_address` are MCP-specific operational helpers.
- Tool results include JSON text content and `structuredContent`.
- `bigint` values are serialized as strings and `undefined` fields are omitted.
- Transaction-like results omit the full `receipt` and expose `receipt.blockNumber` as top-level `blockNumber`.
- Chain defaults resolve in this order: explicit `chain`, configured `defaultChain`, then `sepolia`.
- Supported chain names are `mainnet`, `sepolia`, `base`, and `base-sepolia`.
- Write tools require `--allow-writes` and a configured wallet for the selected chain.

MCP-specific structured tool errors include:
- `missing_wallet`: no configured private key or usable 1Password account reference for a write tool.
- `missing_rpc_url`: no configured RPC URL and no public default RPC URL is available.
- `unsupported_chain`: the requested chain is not supported.
- `tool_error`: any other SDK, RPC, API, wallet, filesystem, or contract error.

Manual protocol/debug testing can use the official MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js mcp serve
npx @modelcontextprotocol/inspector node dist/index.js mcp serve --allow-writes
```

## Common inputs

Most chain-bound tools accept:

```ts
chain?: 'mainnet' | 'sepolia' | 'base' | 'base-sepolia'
```

Common scalar inputs:

```ts
contract: string // valid 0x address
tokenId: string | number
price: string | number
amountIn: string | number
currency?: string // currency alias or ERC20 address
```

Tools that wrap SDK artifact helpers accept structured artifacts directly. `ipfs_pin_file` and `media_upload` read local file paths.

## Read-only tools

MCP operational helpers:

```text
config_summary
wallet_address
client_metadata
contracts_summary
```

Liquid Edition:

```text
liquid_edition_get_factory_config
liquid_edition_generate_preset_curves
liquid_edition_validate_curves
liquid_edition_get_token_uri
liquid_edition_get_render_contract
liquid_edition_get_pool_info
liquid_edition_get_market_state
liquid_edition_get_current_price
liquid_edition_status
```

Bridge:

```text
bridge_quote
```

Swap quotes:

```text
swap_quote_buy_token
swap_quote_sell_token
swap_quote_buy_rare
```

Marketplaces:

```text
auction_status
auction_batch_roots
auction_batch_status
offer_status
offer_erc1155_status
offer_batch_status
listing_status
listing_erc1155_status
listing_batch_status
```

Listing release:

```text
listing_release_allowlist_build
listing_release_allowlist_parse
listing_release_allowlist_proof
listing_release_allowlist_get_config
listing_release_limits_get_mint
listing_release_limits_get_tx
listing_release_status
listing_erc1155_release_allowlist_build
listing_erc1155_release_allowlist_parse
listing_erc1155_release_allowlist_proof
listing_erc1155_release_allowlist_get_config
listing_erc1155_release_limits_get_mint
listing_erc1155_release_limits_get_tx
listing_erc1155_release_status
```

Utilities:

```text
utils_tree_build
utils_tree_proof
utils_tree_verify
utils_merkle_proof
```

API and account reads:

```text
search_nfts
search_collections
search_events
nft_get
collection_get
collection_status
collection_erc1155_status
collection_get_token_creator
collection_royalty_status
collection_metadata_status
user_get
```

Token and currency:

```text
token_status
token_get_price
currency_list
currency_resolve
currency_resolve_decimals
```

## Write-capable tools

These tools are registered only with `--allow-writes`.

Liquid Edition:

```text
liquid_edition_deploy_multi_curve
liquid_edition_set_render_contract
```

Bridge:

```text
bridge_send
```

Swap execution:

```text
swap_buy
swap_sell
swap_swap_tokens
swap_buy_token
swap_sell_token
swap_buy_rare
```

Marketplaces:

```text
auction_create
auction_bid
auction_settle
auction_cancel
auction_batch_create
auction_batch_cancel
auction_batch_bid
auction_batch_settle
offer_create
offer_cancel
offer_accept
offer_erc1155_create
offer_erc1155_cancel
offer_erc1155_accept
offer_batch_create
offer_batch_revoke
offer_batch_accept
listing_create
listing_cancel
listing_buy
listing_erc1155_create
listing_erc1155_cancel
listing_erc1155_buy
listing_erc1155_checkout
listing_batch_create
listing_batch_cancel
listing_batch_buy
listing_batch_set_allowlist
```

Listing release:

```text
listing_release_allowlist_set_config
listing_release_allowlist_clear
listing_release_limits_set_mint
listing_release_limits_set_tx
listing_release_configure
listing_release_mint
listing_erc1155_release_allowlist_set_config
listing_erc1155_release_allowlist_clear
listing_erc1155_release_limits_set_mint
listing_erc1155_release_limits_set_tx
listing_erc1155_release_configure
listing_erc1155_release_mint
```

Collection:

```text
collection_deploy_erc721
collection_deploy_erc1155
collection_deploy_lazy_erc721
collection_deploy_lazy_batch_mint
collection_mint
collection_mint_batch
collection_prepare_lazy_mint
collection_erc1155_create_token
collection_erc1155_mint
collection_erc1155_mint_batch
collection_erc1155_set_minter_approval
collection_set_default_royalty_receiver
collection_set_default_royalty_percentage
collection_set_token_royalty_receiver
collection_update_base_uri
collection_update_token_uri
collection_lock_base_uri
```

IPFS:

```text
ipfs_pin_file
ipfs_pin_json
```

Media and import:

```text
media_upload
media_pin_metadata
import_erc721
```

## SDK mapping notes

The canonical mapping is:

```text
rare.<namespace>.<method> -> <namespace>_<method>
```

Camel-case SDK segments are converted to snake_case:

```text
rare.liquidEdition.deploy.multiCurve -> liquid_edition_deploy_multi_curve
rare.listing.release.allowlist.setConfig -> listing_release_allowlist_set_config
rare.swap.quoteBuyToken -> swap_quote_buy_token
rare.bridge.send -> bridge_send
```

The complete source of truth for tool inventory is `src/mcp/core.ts`; the MCP server registers tools from that inventory.
