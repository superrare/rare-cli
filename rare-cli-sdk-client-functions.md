# RARE SDK client function map

This map reflects the top-level `RareClient` returned by `createRareClient(config)` in `src/sdk/client.ts` and typed in `src/sdk/types/client.ts`.

Scope:
- Includes `createRareClient` and the methods reachable from the returned client object.
- Excludes standalone helper exports from `src/sdk/index.ts`, ABI exports, type exports, and pure planning utilities.
- Method signatures are listed as `rare.<namespace>.<method>(...)`.
- CLI confirmation flags such as `--yes`, `--preview`, and `--quote-only` are not SDK concepts. SDK approval behavior is represented in the relevant typed params, such as `autoApprove?: boolean`; quote flows are explicit `quote*` methods.

Client construction:

rare = createRareClient(config: RareClientConfig): RareClient

Client metadata:

rare.chain: SupportedChain
rare.chainId: number
rare.contracts.factory: Address
rare.contracts.auction: Address
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

Swap:

rare.swap.buy(params: RouterBuyParams): Promise<TransactionResult>
rare.swap.sell(params: RouterSellParams): Promise<TransactionResult>
rare.swap.swap(params: RouterSwapParams): Promise<TransactionResult>
rare.swap.quoteBuyToken(params: BuyTokenParams): Promise<TokenTradeQuote>
rare.swap.buyToken(params: BuyTokenParams): Promise<TokenTradeResult>
rare.swap.quoteSellToken(params: SellTokenParams): Promise<TokenTradeQuote>
rare.swap.sellToken(params: SellTokenParams): Promise<TokenTradeResult>
rare.swap.quoteBuyRare(params: BuyRareParams): Promise<BuyRareQuote>
rare.swap.buyRare(params: BuyRareParams): Promise<BuyRareResult>

Auction:

rare.auction.create(params: AuctionCreateParams): Promise<TransactionResult & { approvalTxHash?: Hash; auctionType: 'reserve' | 'scheduled'; startTime: bigint }>
rare.auction.bid(params: AuctionBidParams): Promise<TransactionResult & { approvalTxHash?: Hash }>
rare.auction.settle(params: AuctionSettleParams): Promise<TransactionResult>
rare.auction.cancel(params: AuctionCancelParams): Promise<TransactionResult>
rare.auction.status(params: AuctionStatusParams): Promise<AuctionStatus>
rare.auction.batch.create(params: BatchAuctionCreateParams): Promise<BatchAuctionCreateResult>
rare.auction.batch.cancel(params: BatchAuctionCancelParams): Promise<BatchAuctionCancelResult>
rare.auction.batch.bid(params: BatchAuctionBidParams): Promise<BatchAuctionBidResult>
rare.auction.batch.settle(params: BatchAuctionSettleParams): Promise<BatchAuctionSettleResult>
rare.auction.batch.status(params: BatchAuctionStatusParams): Promise<BatchAuctionStatus>

Offer:

rare.offer.create(params: OfferCreateParams): Promise<TransactionResult & { approvalTxHash?: Hash }>
rare.offer.cancel(params: OfferCancelParams): Promise<TransactionResult>
rare.offer.accept(params: OfferAcceptParams): Promise<TransactionResult & { approvalTxHash?: Hash }>
rare.offer.status(params: OfferStatusParams): Promise<OfferStatus>
rare.offer.batch.create(params: BatchOfferCreateParams): Promise<BatchOfferCreateResult>
rare.offer.batch.revoke(params: BatchOfferRevokeParams): Promise<BatchOfferRevokeResult>
rare.offer.batch.accept(params: BatchOfferAcceptParams): Promise<BatchOfferAcceptResult>
rare.offer.batch.status(params: BatchOfferStatusParams): Promise<BatchOfferStatus>

Listing:

rare.listing.create(params: ListingCreateParams): Promise<TransactionResult & { approvalTxHash?: Hash }>
rare.listing.cancel(params: ListingCancelParams): Promise<TransactionResult>
rare.listing.buy(params: ListingBuyParams): Promise<TransactionResult & { approvalTxHash?: Hash }>
rare.listing.status(params: ListingStatusParams): Promise<ListingStatus>

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

Batch listing:

rare.listing.batch.create(params: BatchListingCreateParams): Promise<BatchListingCreateResult>
rare.listing.batch.cancel(params: BatchListingCancelParams): Promise<BatchListingCancelResult>
rare.listing.batch.buy(params: BatchListingBuyParams): Promise<TransactionResult & { approvalTxHash?: Hash }>
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
rare.collection.deploy.lazyErc721(params: DeployLazyErc721Params): Promise<DeployLazyErc721Result>
rare.collection.deploy.lazyBatchMint(params: DeployLazyBatchMintParams): Promise<DeployLazyBatchMintResult>
rare.collection.mint(params: CollectionMintParams): Promise<CollectionMintResult>
rare.collection.mintBatch(params: CollectionMintBatchParams): Promise<CollectionMintBatchResult>
rare.collection.prepareLazyMint(params: CollectionPrepareLazyMintParams): Promise<CollectionPrepareLazyMintResult>
rare.collection.getTokenCreator(params: CollectionTokenCreatorParams): Promise<CollectionTokenCreatorResult>
rare.collection.royalty.status(params: CollectionRoyaltyInfoParams): Promise<CollectionRoyaltyInfoResult>
rare.collection.setDefaultRoyaltyReceiver(params: CollectionSetDefaultRoyaltyReceiverParams): Promise<CollectionSetDefaultRoyaltyReceiverResult>
rare.collection.setTokenRoyaltyReceiver(params: CollectionSetTokenRoyaltyReceiverParams): Promise<CollectionSetTokenRoyaltyReceiverResult>
rare.collection.royalty.registry.status(params: CollectionRoyaltyRegistryStatusParams): Promise<CollectionRoyaltyRegistryStatusResult>
rare.collection.setRoyaltyRegistryReceiverOverride(params: CollectionRoyaltyRegistryReceiverOverrideParams): Promise<CollectionRoyaltyRegistryReceiverOverrideResult>
rare.collection.setRoyaltyRegistryContractReceiver(params: CollectionRoyaltyRegistryContractReceiverParams): Promise<CollectionRoyaltyRegistryContractReceiverResult>
rare.collection.setRoyaltyRegistryTokenReceiver(params: CollectionRoyaltyRegistryTokenReceiverParams): Promise<CollectionRoyaltyRegistryTokenReceiverResult>
rare.collection.setRoyaltyRegistryContractPercentage(params: CollectionRoyaltyRegistryContractPercentageParams): Promise<CollectionRoyaltyRegistryContractPercentageResult>
rare.collection.metadata.status(params: CollectionMintConfigParams): Promise<CollectionMintConfigResult>
rare.collection.updateBaseUri(params: CollectionUpdateBaseUriParams): Promise<CollectionUpdateBaseUriResult>
rare.collection.updateTokenUri(params: CollectionUpdateTokenUriParams): Promise<CollectionUpdateTokenUriResult>
rare.collection.lockBaseUri(params: CollectionLockBaseUriParams): Promise<CollectionLockBaseUriResult>

User:

rare.user.get(address: string): Promise<UserProfile>

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
- Liquid Edition deployment is grouped under `liquidEdition.deploy.multiCurve`, matching the CLI's `liquid-edition deploy multicurve` shape and leaving room for future deployment types.
- Collection single-token minting now lives at `collection.mint`, alongside `collection.mintBatch` and `collection.prepareLazyMint`.
- Batch marketplaces are nested under their sale type: `listing.batch.*`, `offer.batch.*`, and `auction.batch.*`. Offline tree helpers live under `utils.tree.*`.
- Marketplace currency aliases are first-class SDK inputs. `eth`, `rare`, `usdc`, and ERC20 addresses are accepted by marketplace methods that take `currency`; `rare.currency.*` exposes the same chain-aware resolver/list contract used by the CLI.
