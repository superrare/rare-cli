# RARE SDK public interface

The SDK exposes a small set of intentional package subpaths. Treat these exports as the supported public API.

## Package subpaths

### `@rareprotocol/rare-cli/client`

Primary high-level SDK surface. Import this for app-level RARE workflows.

Runtime exports:

```ts
createRareClient
Erc1155CheckoutAllItemsSkippedError
NftApprovalRequiredError
PaymentApprovalRequiredError
```

Type exports include `RareClient`, `RareClientConfig`, public namespace params/results, API response model types, currency/common input types, liquid curve types, and utility types used by `rare.utils.*`.

### `@rareprotocol/rare-cli/contracts`

Lower-level viem building blocks for consumers who need direct contract access.

Exports:

```ts
supportedChains
viemChains
chainIds
defaultRpcUrls
contractAddresses
canonicalV4Pools
currencyNames
ETH_ADDRESS
PUBLIC_LISTING_TARGET
listCurrencies
resolveCurrency
resolveCurrencyInfo
getContractAddresses
requireContractAddress
isSupportedChain
getBatchListingAddress
getErc1155MarketplaceAddress
getErc1155ContractFactoryAddress
getErc1155ApprovalManagerAddress
getErc721ApprovalManagerAddress
getCcipChainSelector
getRareBridgeAddress
getRareMinterAddress
getLiquidFactoryAddress
getSwapRouterAddress
getV4QuoterAddress
getCanonicalV4Pools
getCanonicalRareEthPool
getCanonicalUsdcEthPool
```

ABI exports:

```ts
auctionAbi
batchAuctionHouseAbi
batchListingAbi
batchOfferAbi
collectionMintAbi
collectionOwnerAbi
factoryAbi
lazyBatchMintFactoryAbi
lazySovereignFactoryAbi
liquidEditionAbi
liquidFactoryAbi
liquidRouterAbi
rareBridgeAbi
rareErc1155Abi
rareErc1155ContractFactoryAbi
rareErc1155MarketplaceAbi
erc1155ApprovalManagerAbi
rareMinterAbi
sovereignFactoryAbi
tokenAbi
uniswapV4QuoterAbi
```

Type exports include `CanonicalV4Pool`, `CanonicalV4Pools`, `ContractAddresses`, `CurrencyInfo`, `CurrencyInput`, `CurrencyName`, `CurrencyResolveResult`, `CustomCurrencyInfo`, `ResolvedCurrency`, and `SupportedChain`.

### `@rareprotocol/rare-cli/utils`

Standalone pure helpers for artifact/proof workflows that do not need a configured client.

Runtime exports:

```ts
buildUtilsTree(params: BuildUtilsTreeParams): UtilsTreeArtifact
getUtilsTreeProof(params: UtilsTreeProofParams): UtilsTreeProofArtifact
verifyUtilsTreeProof(params: UtilsTreeProofVerifyParams): boolean
buildUtilsMerkleProof(params: UtilsMerkleProofParams): UtilsMerkleProofArtifact
```

Type exports:

```ts
BuildUtilsTreeParams
UtilsTreeArtifact
UtilsTreeProofParams
UtilsTreeProofArtifact
UtilsTreeProofVerifyParams
UtilsMerkleProofParams
UtilsMerkleProofArtifact
```

## Client function map

This map reflects the top-level `RareClient` returned by `createRareClient(config)` in `src/sdk/client.ts` and typed in `src/sdk/types/client.ts`.

Scope:
- Includes `createRareClient` and the methods reachable from the returned client object.
- Excludes ABI exports, contract-address exports, standalone utility exports, type exports, and pure planning utilities.
- Method signatures are listed as `rare.<namespace>.<method>(...)`.
- CLI confirmation flags such as `--yes` and `--quote-only` are not SDK concepts. SDK approval behavior is represented in the relevant typed params, such as `autoApprove?: boolean`; quote flows are explicit `quote*` methods.

Client construction:

rare = createRareClient(config: RareClientConfig): RareClient

Client metadata:

rare.chain: SupportedChain
rare.chainId: number
rare.contracts.factory: Address
rare.contracts.auction: Address
rare.contracts.rareBridge?: Address
rare.contracts.sovereignFactory?: Address
rare.contracts.lazySovereignFactory?: Address
rare.contracts.rareMinter?: Address
rare.contracts.lazyBatchMintFactory?: Address
rare.contracts.batchListing?: Address
rare.contracts.batchOfferCreator?: Address
rare.contracts.batchAuctionHouse?: Address
rare.contracts.marketplaceSettings?: Address
rare.contracts.erc20ApprovalManager?: Address
rare.contracts.erc721ApprovalManager?: Address
rare.contracts.erc1155Marketplace?: Address
rare.contracts.erc1155ContractFactory?: Address
rare.contracts.erc1155ApprovalManager?: Address
rare.contracts.liquidFactory?: Address
rare.contracts.swapRouter?: Address
rare.contracts.v4Quoter?: Address

Chain model:

`RareClient` is bound to the chain configured on `config.publicClient`.
Client methods use `rare.chain` / `rare.chainId` automatically and do not accept per-call `chain` or `chainId` overrides.
To use another chain, create another client with a viem `publicClient` for that chain.

Liquid editions:

rare.liquidEdition.getFactoryConfig(): Promise<LiquidFactoryConfig>
rare.liquidEdition.generatePresetCurves(params: GeneratePresetCurvesParams): Promise<GeneratePresetCurvesResult>
rare.liquidEdition.validateCurves(params: ValidateLiquidCurvesParams): Promise<LiquidCurvePreview>
rare.liquidEdition.deploy.multiCurve(params: DeployLiquidEditionParams): Promise<DeployLiquidEditionResult>
rare.liquidEdition.getTokenUri(params: { contract: Address }): Promise<string>
rare.liquidEdition.getRenderContract(params: { contract: Address }): Promise<Address>
rare.liquidEdition.setRenderContract(params: SetLiquidEditionRenderContractParams): Promise<SetLiquidEditionRenderContractResult>
rare.liquidEdition.getPoolInfo(params: { contract: Address }): Promise<LiquidEditionPoolInfo>
rare.liquidEdition.getMarketState(params: { contract: Address }): Promise<LiquidEditionMarketState>
rare.liquidEdition.getCurrentPrice(params: { contract: Address }): Promise<LiquidEditionCurrentPrice>
rare.liquidEdition.status(params: { contract: Address }): Promise<LiquidEditionTelemetry>

Bridge:

rare.bridge.quote(params: BridgeParams): Promise<BridgeQuote>
rare.bridge.send(params: BridgeSendParams): Promise<BridgeResult>

Swap:

rare.swap.buy(params: RouterBuyParams): Promise<TransactionResult>
rare.swap.sell(params: RouterSellParams): Promise<TransactionResult>
rare.swap.swapTokens(params: RouterSwapTokensParams): Promise<TransactionResult>
rare.swap.quoteBuyToken(params: TokenTradeQuoteParams): Promise<TokenTradeQuote>
rare.swap.buyToken(params: BuyTokenParams): Promise<TokenTradeResult>
rare.swap.quoteSellToken(params: TokenTradeQuoteParams): Promise<TokenTradeQuote>
rare.swap.sellToken(params: SellTokenParams): Promise<TokenTradeResult>
rare.swap.quoteBuyRare(params: BuyRareParams): Promise<BuyRareQuote>
rare.swap.buyRare(params: BuyRareParams): Promise<BuyRareResult>

Auction:

rare.auction.create(params: AuctionCreateParams): Promise<AuctionCreateResult>
rare.auction.bid(params: AuctionBidParams): Promise<AuctionBidResult>
rare.auction.settle(params: AuctionSettleParams): Promise<TransactionResult>
rare.auction.cancel(params: AuctionCancelParams): Promise<TransactionResult>
rare.auction.status(params: AuctionStatusParams): Promise<AuctionStatus>
rare.auction.batch.create(params: BatchAuctionCreateParams): Promise<BatchAuctionCreateResult>
rare.auction.batch.cancel(params: BatchAuctionCancelParams): Promise<BatchAuctionCancelResult>
rare.auction.batch.roots(params?: BatchAuctionRootsParams): Promise<Hex[]>
rare.auction.batch.bid(params: BatchAuctionBidParams): Promise<BatchAuctionBidResult>
rare.auction.batch.settle(params: BatchAuctionSettleParams): Promise<BatchAuctionSettleResult>
rare.auction.batch.status(params: BatchAuctionStatusParams): Promise<BatchAuctionStatus>

Offer:

rare.offer.create(params: OfferCreateParams): Promise<OfferCreateResult>
rare.offer.cancel(params: OfferCancelParams): Promise<TransactionResult>
rare.offer.accept(params: OfferAcceptParams): Promise<OfferAcceptResult>
rare.offer.status(params: OfferStatusParams): Promise<OfferStatus>
rare.offer.batch.create(params: BatchOfferCreateParams): Promise<BatchOfferCreateResult>
rare.offer.batch.revoke(params: BatchOfferRevokeParams): Promise<BatchOfferRevokeResult>
rare.offer.batch.accept(params: BatchOfferAcceptParams): Promise<BatchOfferAcceptResult>
rare.offer.batch.status(params: BatchOfferStatusParams): Promise<BatchOfferStatus>
rare.offer.erc1155.create(params: Erc1155OfferCreateParams): Promise<Erc1155OfferCreateResult>
rare.offer.erc1155.cancel(params: Erc1155OfferCancelParams): Promise<TransactionResult>
rare.offer.erc1155.accept(params: Erc1155OfferAcceptParams): Promise<Erc1155OfferAcceptResult>
rare.offer.erc1155.status(params: Erc1155OfferStatusParams): Promise<Erc1155OfferStatus>

Listing:

rare.listing.create(params: ListingCreateParams): Promise<ListingCreateResult>
rare.listing.cancel(params: ListingCancelParams): Promise<TransactionResult>
rare.listing.buy(params: ListingBuyParams): Promise<ListingBuyResult>
rare.listing.status(params: ListingStatusParams): Promise<ListingStatus>
rare.listing.erc1155.create(params: Erc1155ListingCreateParams): Promise<Erc1155ListingCreateResult>
rare.listing.erc1155.createBatch(params: Erc1155ListingCreateBatchParams): Promise<Erc1155ListingCreateBatchResult>
rare.listing.erc1155.cancel(params: Erc1155ListingCancelParams): Promise<TransactionResult>
rare.listing.erc1155.buy(params: Erc1155ListingBuyParams): Promise<Erc1155ListingBuyResult>
rare.listing.erc1155.checkout(params: Erc1155CheckoutParams): Promise<Erc1155CheckoutResult>
rare.listing.erc1155.status(params: Erc1155ListingStatusParams): Promise<Erc1155ListingStatus>

Listing release:

rare.listing.release.allowlist.build(params: { input: string; format: 'csv' | 'json' }): ReleaseAllowlistArtifact
rare.listing.release.allowlist.parse(params: { input: string }): ReleaseAllowlistArtifact
rare.listing.release.allowlist.proof(params: { artifact: ReleaseAllowlistArtifact; address: Address }): ReleaseAllowlistWalletProof | null
rare.listing.release.allowlist.getConfig(params: { contract: Address }): Promise<ReleaseAllowlistConfig>
rare.listing.release.allowlist.setConfig(params: ReleaseSetAllowlistConfigParams): Promise<ReleaseSetAllowlistConfigResult>
rare.listing.release.allowlist.clear(params: { contract: Address }): Promise<ReleaseSetAllowlistConfigResult>
rare.listing.release.limits.getMint(params: { contract: Address }): Promise<ReleaseLimitConfig>
rare.listing.release.limits.setMint(params: ReleaseSetLimitParams): Promise<ReleaseSetLimitResult>
rare.listing.release.limits.getTx(params: { contract: Address }): Promise<ReleaseLimitConfig>
rare.listing.release.limits.setTx(params: ReleaseSetLimitParams): Promise<ReleaseSetLimitResult>
rare.listing.release.configure(params: ReleaseConfigureParams): Promise<ReleaseConfigureResult>
rare.listing.release.mint(params: ReleaseMintDirectSaleParams): Promise<ReleaseMintDirectSaleResult>
rare.listing.release.status(params: ReleaseStatusParams): Promise<ReleaseStatus>

ERC1155 listing release:

rare.listing.erc1155.release.allowlist.build(params: { input: string; format: 'csv' | 'json' }): ReleaseAllowlistArtifact
rare.listing.erc1155.release.allowlist.parse(params: { input: string }): ReleaseAllowlistArtifact
rare.listing.erc1155.release.allowlist.proof(params: { artifact: ReleaseAllowlistArtifact; address: Address }): ReleaseAllowlistWalletProof | null
rare.listing.erc1155.release.allowlist.getConfig(params: { contract: Address; tokenId: IntegerInput }): Promise<Erc1155ReleaseAllowlistConfig>
rare.listing.erc1155.release.allowlist.setConfig(params: Erc1155ReleaseSetAllowlistConfigParams): Promise<Erc1155ReleaseSetAllowlistConfigResult>
rare.listing.erc1155.release.allowlist.setConfigBatch(params: Erc1155ReleaseSetAllowlistConfigBatchParams): Promise<Erc1155ReleaseSetAllowlistConfigBatchResult>
rare.listing.erc1155.release.allowlist.clear(params: { contract: Address; tokenId: IntegerInput }): Promise<Erc1155ReleaseSetAllowlistConfigResult>
rare.listing.erc1155.release.limits.getMint(params: { contract: Address; tokenId: IntegerInput }): Promise<Erc1155ReleaseLimitConfig>
rare.listing.erc1155.release.limits.setMint(params: Erc1155ReleaseSetLimitParams): Promise<Erc1155ReleaseSetLimitResult>
rare.listing.erc1155.release.limits.setMintBatch(params: Erc1155ReleaseSetLimitBatchParams): Promise<Erc1155ReleaseSetLimitBatchResult>
rare.listing.erc1155.release.limits.getTx(params: { contract: Address; tokenId: IntegerInput }): Promise<Erc1155ReleaseLimitConfig>
rare.listing.erc1155.release.limits.setTx(params: Erc1155ReleaseSetLimitParams): Promise<Erc1155ReleaseSetLimitResult>
rare.listing.erc1155.release.limits.setTxBatch(params: Erc1155ReleaseSetLimitBatchParams): Promise<Erc1155ReleaseSetLimitBatchResult>
rare.listing.erc1155.release.configure(params: Erc1155ReleaseConfigureParams): Promise<Erc1155ReleaseConfigureResult>
rare.listing.erc1155.release.configureBatch(params: Erc1155ReleaseConfigureBatchParams): Promise<Erc1155ReleaseConfigureBatchResult>
rare.listing.erc1155.release.cancel(params: Erc1155ReleaseCancelParams): Promise<Erc1155ReleaseCancelResult>
rare.listing.erc1155.release.mint(params: Erc1155ReleaseMintParams): Promise<Erc1155ReleaseMintResult>
rare.listing.erc1155.release.status(params: Erc1155ReleaseStatusParams): Promise<Erc1155ReleaseStatus>

Batch listing:

rare.listing.batch.create(params: BatchListingCreateParams): Promise<BatchListingCreateResult>
rare.listing.batch.cancel(params: BatchListingCancelParams): Promise<BatchListingCancelResult>
rare.listing.batch.buy(params: BatchListingBuyParams): Promise<BatchListingBuyResult>
rare.listing.batch.setAllowlist(params: BatchListingSetAllowListParams): Promise<BatchListingSetAllowListResult>
rare.listing.batch.status(params: BatchListingStatusParams): Promise<BatchListingStatus>

Utils:

rare.utils.tree.build(params: BuildUtilsTreeParams): UtilsTreeArtifact
rare.utils.tree.proof(params: UtilsTreeProofParams): UtilsTreeProofArtifact
rare.utils.tree.verify(params: UtilsTreeProofVerifyParams): boolean
rare.utils.merkle.proof(params: UtilsMerkleProofParams): UtilsMerkleProofArtifact

Search:

rare.search.nfts(params?: RareClientNftSearchParams): Promise<SearchPageResponse<Nft>>
rare.search.collections(params?: RareClientCollectionSearchParams): Promise<SearchPageResponse<Collection>>
rare.search.events(params: { contract?: Address; tokenId?: IntegerInput; collectionId?: string; eventType?: string | string[]; sortBy?: 'newest' | 'oldest'; page?: number; perPage?: number }): Promise<SearchPageResponse<NftEvent>>

NFT:

rare.nft.get(params: { contract: Address; tokenId: IntegerInput }): Promise<Nft>

Collection:

rare.collection.get(id: string): Promise<Collection>
rare.collection.deploy.erc721(params: DeployErc721Params): Promise<DeployErc721Result>
rare.collection.deploy.erc1155(params: DeployErc1155Params): Promise<DeployErc1155Result>
rare.collection.deploy.lazyErc721(params: DeployLazyErc721Params): Promise<DeployLazyErc721Result>
rare.collection.deploy.lazyBatchMint(params: DeployLazyBatchMintParams): Promise<DeployLazyBatchMintResult>
rare.collection.mint(params: CollectionMintParams): Promise<CollectionMintResult>
rare.collection.mintBatch(params: CollectionMintBatchParams): Promise<CollectionMintBatchResult>
rare.collection.prepareLazyMint(params: CollectionPrepareLazyMintParams): Promise<CollectionPrepareLazyMintResult>
rare.collection.getTokenCreator(params: CollectionTokenCreatorParams): Promise<CollectionTokenCreatorResult>
rare.collection.royalty.status(params: CollectionRoyaltyInfoParams): Promise<CollectionRoyaltyInfoResult>
rare.collection.setDefaultRoyaltyReceiver(params: CollectionSetDefaultRoyaltyReceiverParams): Promise<CollectionSetDefaultRoyaltyReceiverResult>
rare.collection.setDefaultRoyaltyPercentage(params: CollectionSetDefaultRoyaltyPercentageParams): Promise<CollectionSetDefaultRoyaltyPercentageResult>
rare.collection.setTokenRoyaltyReceiver(params: CollectionSetTokenRoyaltyReceiverParams): Promise<CollectionSetTokenRoyaltyReceiverResult>
rare.collection.metadata.status(params: CollectionMintConfigParams): Promise<CollectionMintConfigResult>
rare.collection.updateBaseUri(params: CollectionUpdateBaseUriParams): Promise<CollectionUpdateBaseUriResult>
rare.collection.updateTokenUri(params: CollectionUpdateTokenUriParams): Promise<CollectionUpdateTokenUriResult>
rare.collection.lockBaseUri(params: CollectionLockBaseUriParams): Promise<CollectionLockBaseUriResult>
rare.collection.erc1155.createToken(params: Erc1155CollectionCreateTokenParams): Promise<Erc1155CollectionCreateTokenResult>
rare.collection.erc1155.mint(params: Erc1155CollectionMintParams): Promise<Erc1155CollectionMintResult>
rare.collection.erc1155.mintBatch(params: Erc1155CollectionMintBatchParams): Promise<Erc1155CollectionMintBatchResult>
rare.collection.erc1155.setMinterApproval(params: Erc1155CollectionSetMinterApprovalParams): Promise<Erc1155CollectionSetMinterApprovalResult>
rare.collection.erc1155.updateTokenUri(params: Erc1155CollectionUpdateTokenUriParams): Promise<Erc1155CollectionUpdateTokenUriResult>
rare.collection.erc1155.disable(params: Erc1155CollectionDisableParams): Promise<Erc1155CollectionDisableResult>
rare.collection.erc1155.status(params: Erc1155CollectionStatusParams): Promise<Erc1155CollectionStatus>

User:

rare.user.get(address: string): Promise<UserProfile>

IPFS:

rare.ipfs.pinFile(buffer: Uint8Array, filename: string): Promise<IpfsUploadResult>
rare.ipfs.pinJson(value: unknown, filename?: string): Promise<IpfsUploadResult>

Media:

rare.media.upload(buffer: Uint8Array, filename: string): Promise<NftMediaEntry>
rare.media.pinMetadata(opts: PinMetadataParams): Promise<string>

Import:

rare.import.erc721(params: ImportErc721Params): Promise<void>

Token:

rare.token.status(params: { contract: Address; tokenId?: IntegerInput }): Promise<TokenStatus>
rare.token.getPrice(symbol: string): Promise<{ symbol: string; priceUsd: number; decimals: number; chainId: number; address: string }>

Currency:

rare.currency.list(): CurrencyInfo[]
rare.currency.resolve(input: CurrencyInput): ResolvedCurrency
rare.currency.resolveDecimals(input: CurrencyInput): Promise<ResolvedCurrencyWithDecimals>

Consistency notes:
- Collection deployments are grouped under `collection.deploy.*`, matching the CLI's `collection deploy ...` shape.
- ERC1155 support is explicit under `.erc1155` namespaces. Existing shorthand collection, listing, and offer methods remain ERC721 compatibility behavior for v1.
- Token-specific royalty receiver updates stay under `rare.collection.setTokenRoyaltyReceiver`; the SDK probes ERC721 and ERC1155 argument order before writing.
- Liquid Edition deployment is grouped under `liquidEdition.deploy.multiCurve`, matching the CLI's `liquid-edition deploy multicurve` shape and leaving room for future deployment types.
- Collection single-token minting now lives at `collection.mint`, alongside `collection.mintBatch` and `collection.prepareLazyMint`.
- Batch marketplaces are nested under their sale type: `listing.batch.*`, `offer.batch.*`, and `auction.batch.*`. Offline tree helpers live under `utils.tree.*`.
- Generic IPFS pinning lives under `ipfs.*`; `media.*` remains NFT media-specific and feeds NFT metadata assembly.
- Marketplace currency aliases are first-class SDK inputs. `eth`, `rare`, `usdc`, and ERC20 addresses are accepted by marketplace methods that take `currency`; `rare.currency.*` exposes the same chain-aware resolver/list contract used by the CLI.
- Swap token flows accept `route?: 'auto' | 'local' | 'uniswap'`; execution methods also accept `route: 'raw'` with `commands` and `inputs` for prebuilt liquid-router calldata. `rare.swap.buy` and `rare.swap.sell` remain lower-level raw router methods.

## MCP coverage

`rare mcp serve` exposes an agent-friendly stdio MCP server over the public `RareClient` surface. Tool names are SDK-path-shaped snake_case:

```text
rare.collection.deploy.erc721 -> collection_deploy_erc721
rare.liquidEdition.deploy.multiCurve -> liquid_edition_deploy_multi_curve
rare.listing.release.allowlist.setConfig -> listing_release_allowlist_set_config
rare.swap.quoteBuyToken -> swap_quote_buy_token
```

Read-only SDK methods and pure helper flows are registered by default. Write-capable SDK methods are registered only when the server is started with `--allow-writes`. See `rare-cli-mcp-tools.md` for the complete MCP tool inventory.
