import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
  parseEther,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { getContractAddresses, resolveCurrency } from '../../src/contracts/addresses.js';
import { rareMinterAbi } from '../../src/contracts/abis/rare-minter.js';
import { parseJsonStdout, runCli } from '../helpers/cli.js';
import { loadDotEnv } from './env.mjs';

loadDotEnv();

const requiredEnv = [
  'TEST_RPC_URL',
  'E2E_SELLER_PRIVATE_KEY',
  'E2E_BUYER_PRIVATE_KEY',
] as const;

const missingEnv = requiredEnv.filter((name) => !process.env[name]);
const describeLive = missingEnv.length === 0 ? describe.sequential : describe.skip;
const E2E_TOKEN_URI = 'ipfs://bafybeidznwopf6bnfakqbertnhohgh65usqlo7bhnehycurg4xmc5ebnm4/metadata.json';
const E2E_BATCH_BASE_URI = 'ipfs://bafybeidznwopf6bnfakqbertnhohgh65usqlo7bhnehycurg4xmc5ebnm4/batch';
const E2E_LAZY_BASE_URI = 'ipfs://bafybeidznwopf6bnfakqbertnhohgh65usqlo7bhnehycurg4xmc5ebnm4/lazy';
const E2E_LAZY_UPDATED_BASE_URI = 'ipfs://bafybeidznwopf6bnfakqbertnhohgh65usqlo7bhnehycurg4xmc5ebnm4/lazy-updated';
const E2E_LAZY_TOKEN_URI = 'ipfs://bafybeidznwopf6bnfakqbertnhohgh65usqlo7bhnehycurg4xmc5ebnm4/lazy-token-1.json';
const E2E_ALLOWLIST_ROOT = '0xcbf843e9efe7be41ca4d3a03347d27e7bb96d83ae75b3b36983ad907d2109c65';
const E2E_ETH_ADDRESS = '0x0000000000000000000000000000000000000000';

type DeployResult = {
  txHash: string;
  blockNumber: string;
  contract: string;
};

type CreateSovereignResult = {
  txHash: string;
  blockNumber: string;
  contract: string;
  factory: string;
  contractType: string;
  nextStep?: string;
};

type CollectionMintBatchResult = {
  txHash: string;
  blockNumber: string;
  contract: string;
  baseUri: string;
  tokenCount: string;
  fromTokenId: string;
  toTokenId: string;
  owner: string;
};

type CollectionPrepareLazyMintResult = {
  txHash: string;
  blockNumber: string;
  contract: string;
  baseUri: string;
  tokenCount: string;
  minter?: string;
};

type CollectionTokenCreatorResult = {
  chain: string;
  contract: string;
  tokenId: string;
  creator: string;
};

type CollectionRoyaltyInfoResult = {
  chain: string;
  contract: string;
  tokenId: string;
  salePrice: string;
  receiver: string;
  royaltyAmount: string;
  defaultReceiver?: string;
  defaultPercentage?: string;
};

type CollectionMetadataStatusResult = {
  chain: string;
  contract: string;
  baseUri: string;
  tokenCount: string;
  lockedMetadata: boolean;
};

type CollectionMetadataWriteResult = {
  txHash: string;
  blockNumber: string;
  contract: string;
  baseUri?: string;
  tokenId?: string;
  tokenUri?: string;
};

type ReleaseAllowlistConfigResult = {
  txHash: string;
  blockNumber: string;
  contract: string;
  minter: string;
  root: string;
  endTimestamp: string;
};

type ReleaseLimitResult = {
  txHash: string;
  blockNumber: string;
  contract: string;
  minter: string;
  limit: string;
};

type ReleaseStatusResult = {
  chain: string;
  contract: string;
  minter: string;
  allowlistRoot: string;
  allowlistEndTimestamp: string;
  mintLimit: string;
  txLimit: string;
  sellerStakingMinimum: string;
  sellerStakingMinimumEndTimestamp: string;
  account?: string;
  accountMints?: string;
  accountTxs?: string;
};

type ReleaseMintDirectSaleResult = TxResult & {
  contract: string;
  minter: string;
  buyer: string;
  recipient: string;
  quantity: number;
  currency: string;
  price: string;
  totalPrice: string;
  requiredPayment: string;
  allowlistRequired: boolean;
  tokenIdStart: string;
  tokenIdEnd: string;
  tokenIds: string[];
};

type AuctionCreateResult = TxResult & {
  auctionType: string;
  startTime: string;
};

type AuctionStatusResult = {
  status: string;
  state: string;
  auctionTypeName: string;
  currentBid: string;
  currentBidder: string | null;
  minimumNextBid: string;
  settlementEligible: boolean;
  startingTime: string;
};

type MintResult = {
  txHash: string;
  blockNumber: string;
  tokenId: string;
  contract: string;
  tokenUri: string;
};

type TxResult = {
  txHash: string;
  blockNumber: string;
  approvalTxHash?: string | null;
};

type BatchTreeBuildResult = {
  root: string;
  count: number;
  chainId: number;
  output: string;
};

type BatchTreeProofResult = {
  root: string;
  contractAddress: string;
  tokenId: string;
  proofLength: number;
  valid: boolean;
  output: string;
};

type BatchOfferWriteResult = TxResult & {
  batchOfferCreator: string;
  creator: string;
  root: string;
  amount: string;
  currency: string;
  requiredPayment?: string;
};

type BatchOfferStatusResult = {
  creator: string;
  root: string;
  amount: string;
  currency: string;
  hasOffer: boolean;
  expired: boolean;
  fillable: boolean;
  state: string;
};

type CollectionMarketOfferWriteResult = TxResult & {
  collectionMarket: string;
  buyer: string;
  originCollection: string;
  amount: string;
  currency: string;
  requiredPayment?: string;
  hadOffer?: boolean;
};

type CollectionMarketOfferStatusResult = {
  buyer: string;
  originCollection: string;
  amount: string;
  currency: string;
  hasOffer: boolean;
  state: string;
  canCancel: boolean;
  canAccept: boolean;
};

type BatchAuctionWriteResult = TxResult & {
  batchAuctionHouse: string;
  creator: string;
  root: string;
  currency: string;
  reserveAmount?: string;
  amount?: string;
  duration?: string;
  nonce?: number;
  requiredPayment?: string;
  approvalTxHashes?: string[];
};

type BatchAuctionStatusResult = {
  seller: string;
  root: string | null;
  currency: string;
  reserveAmount: string;
  hasRootConfig: boolean;
  hasAuction: boolean;
  currentBidder: string | null;
  currentBid: string;
  settlementEligible: boolean;
  state: string;
};

type LiveState = {
  sellerHome: string;
  buyerHome: string;
  sellerAddress: Address;
  buyerAddress: Address;
  collection: DeployResult;
  listingCancelToken: MintResult;
  listingBuyToken: MintResult;
  zeroPriceListingToken: MintResult;
  auctionCancelToken: MintResult;
  auctionSettleToken: MintResult;
  scheduledAuctionToken: MintResult;
  buyerAuctionCancelToken: MintResult;
  offerCancelToken: MintResult;
  offerCancelCreate: TxResult;
  offerCancelReady: Promise<void>;
  offerAcceptToken: MintResult;
  buyerMintToken: MintResult;
  rareOfferAcceptToken: MintResult;
  batchOfferToken: MintResult;
  batchAuctionToken: MintResult;
};

let live: LiveState;
const E2E_RARE_CURRENCY = 'rare';
const E2E_RARE_AMOUNT = '0.000001';

describeLive('live Sepolia CLI write commands', () => {
  beforeAll(async () => {
    const sellerHome = await createTempHome();
    const buyerHome = await createTempHome();
    const suffix = Date.now().toString(36);
    const sellerAddress = privateKeyToAccount(livePrivateKey('E2E_SELLER_PRIVATE_KEY')).address;
    const buyerAddress = privateKeyToAccount(livePrivateKey('E2E_BUYER_PRIVATE_KEY')).address;

    try {
      await step('configure seller wallet', () => configureLiveHome(sellerHome, process.env.E2E_SELLER_PRIVATE_KEY!));
      await step('configure buyer wallet', () => configureLiveHome(buyerHome, process.env.E2E_BUYER_PRIVATE_KEY!));

      const collection = await step('deploy ERC-721 collection', () =>
        jsonCommand<DeployResult>(sellerHome, [
          'deploy',
          'erc721',
          `Rare CLI E2E ${suffix}`,
          `RCE${suffix.slice(-4).toUpperCase()}`,
          '--max-tokens',
          '14',
          '--chain',
          'sepolia',
        ]),
      );
      expectTx(collection);
      expect(collection.contract).toMatch(/^0x[0-9a-fA-F]{40}$/);

      const offerCancelToken = await step('mint offer cancel token', () =>
        mintToken(sellerHome, collection.contract),
      );
      const offerCancelCreate = await step('create offer for cancellation', () =>
        jsonCommand<TxResult>(buyerHome, [
          'offer',
          'create',
          '--contract',
          collection.contract,
          '--token-id',
          offerCancelToken.tokenId,
          '--amount',
          '0.000001',
          '--chain',
          'sepolia',
        ]),
      );
      expectTx(offerCancelCreate);

      live = {
        sellerHome,
        buyerHome,
        sellerAddress,
        buyerAddress,
        collection,
        listingCancelToken: await step('mint listing cancel token', () =>
          mintToken(sellerHome, collection.contract),
        ),
        listingBuyToken: await step('mint listing buy token', () =>
          mintToken(sellerHome, collection.contract),
        ),
        zeroPriceListingToken: await step('mint zero-price listing token', () =>
          mintToken(sellerHome, collection.contract),
        ),
        auctionCancelToken: await step('mint auction cancel token', () =>
          mintToken(sellerHome, collection.contract),
        ),
        auctionSettleToken: await step('mint auction settle token', () =>
          mintToken(sellerHome, collection.contract),
        ),
        scheduledAuctionToken: await step('mint scheduled auction token', () =>
          mintToken(sellerHome, collection.contract),
        ),
        buyerAuctionCancelToken: await step('mint buyer-owned auction token', () =>
          mintToken(sellerHome, collection.contract, { to: buyerAddress }),
        ),
        offerCancelToken,
        offerCancelCreate,
        offerCancelReady: startOfferCancelDelay(),
        offerAcceptToken: await step('mint offer accept token', () =>
          mintToken(sellerHome, collection.contract),
        ),
        buyerMintToken: await step('mint token directly to buyer', () =>
          mintToken(sellerHome, collection.contract, { to: buyerAddress }),
        ),
        rareOfferAcceptToken: await step('mint RARE offer accept token', () =>
          mintToken(sellerHome, collection.contract),
        ),
        batchOfferToken: await step('mint batch offer token', () =>
          mintToken(sellerHome, collection.contract),
        ),
        batchAuctionToken: await step('mint batch auction token', () =>
          mintToken(sellerHome, collection.contract),
        ),
      };
    } catch (error) {
      await cleanupTempHome(sellerHome);
      await cleanupTempHome(buyerHome);
      throw error;
    }
  });

  afterAll(async () => {
    await cleanupTempHome(live?.sellerHome);
    await cleanupTempHome(live?.buyerHome);
  });

  it('deploys collection and mints token fixtures', () => {
    expectTx(live.collection);
    expect(live.collection.contract).toMatch(/^0x[0-9a-fA-F]{40}$/);
    for (const token of [
      live.listingCancelToken,
      live.listingBuyToken,
      live.zeroPriceListingToken,
      live.auctionCancelToken,
      live.auctionSettleToken,
      live.scheduledAuctionToken,
      live.buyerAuctionCancelToken,
      live.offerCancelToken,
      live.offerAcceptToken,
      live.buyerMintToken,
      live.rareOfferAcceptToken,
      live.batchOfferToken,
      live.batchAuctionToken,
    ]) {
      expectTx(token);
      expect(token.contract).toBe(live.collection.contract);
      expect(token.tokenUri).toBe(E2E_TOKEN_URI);
      expect(token.tokenId).toMatch(/^\d+$/);
    }
  });

  it('creates a standard Sovereign collection through the newer factory', async () => {
    const suffix = Date.now().toString(36);
    const created = await step('create standard Sovereign collection', () =>
      jsonCommand<CreateSovereignResult>(live.sellerHome, [
        'collection',
        'create',
        'sovereign',
        `Rare CLI Sovereign E2E ${suffix}`,
        `RCS${suffix.slice(-4).toUpperCase()}`,
        '--max-tokens',
        '3',
        '--chain',
        'sepolia',
      ]),
    );

    expectTx(created);
    expect(created.contract).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(created.factory).toBe('0x46B2850ba7787734F648A6848b5eDE0815C1F8Bf');
    expect(created.contractType).toBe('standard');

    const minted = await step('batch mint standard Sovereign collection', () =>
      jsonCommand<CollectionMintBatchResult>(live.sellerHome, [
        'collection',
        'mint-batch',
        '--contract',
        created.contract,
        '--base-uri',
        E2E_BATCH_BASE_URI,
        '--token-count',
        '2',
        '--chain',
        'sepolia',
      ]),
    );

    expectTx(minted);
    expect(minted.contract).toBe(created.contract);
    expect(minted.baseUri).toBe(E2E_BATCH_BASE_URI);
    expect(minted.tokenCount).toBe('2');
    expect(minted.fromTokenId).toBe('1');
    expect(minted.toTokenId).toBe('2');
    expect(minted.owner.toLowerCase()).toBe(live.sellerAddress.toLowerCase());

    const creator = await step('read Sovereign token creator', () =>
      jsonCommand<CollectionTokenCreatorResult>(live.sellerHome, [
        'collection',
        'creator',
        '--contract',
        created.contract,
        '--token-id',
        '1',
        '--chain',
        'sepolia',
      ]),
    );
    expect(creator.contract.toLowerCase()).toBe(created.contract.toLowerCase());
    expect(creator.tokenId).toBe('1');
    expect(creator.creator.toLowerCase()).toBe(live.sellerAddress.toLowerCase());

    const initialRoyalty = await readCollectionRoyalty(live.sellerHome, created.contract, '1');
    expect(initialRoyalty.receiver.toLowerCase()).toBe(live.sellerAddress.toLowerCase());
    expect(initialRoyalty.defaultReceiver?.toLowerCase()).toBe(live.sellerAddress.toLowerCase());
    expect(initialRoyalty.defaultPercentage).toBe('10');
    expect(initialRoyalty.royaltyAmount).toBe('1000');

    expectTx(await step('set default royalty receiver', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'collection',
        'royalty',
        'set-default-receiver',
        '--contract',
        created.contract,
        '--receiver',
        live.buyerAddress,
        '--chain',
        'sepolia',
      ]),
    ));

    const defaultReceiverRoyalty = await readCollectionRoyalty(live.sellerHome, created.contract, '1');
    expect(defaultReceiverRoyalty.receiver.toLowerCase()).toBe(live.buyerAddress.toLowerCase());
    expect(defaultReceiverRoyalty.defaultReceiver?.toLowerCase()).toBe(live.buyerAddress.toLowerCase());

    expectTx(await step('set token royalty receiver', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'collection',
        'royalty',
        'set-token-receiver',
        '--contract',
        created.contract,
        '--token-id',
        '1',
        '--receiver',
        live.sellerAddress,
        '--chain',
        'sepolia',
      ]),
    ));

    const tokenReceiverRoyalty = await readCollectionRoyalty(live.sellerHome, created.contract, '1');
    expect(tokenReceiverRoyalty.receiver.toLowerCase()).toBe(live.sellerAddress.toLowerCase());
    expect(tokenReceiverRoyalty.defaultReceiver?.toLowerCase()).toBe(live.buyerAddress.toLowerCase());
  });

  it('creates a Lazy Sovereign release collection through the lazy factory', async () => {
    const suffix = Date.now().toString(36);
    const allowlistEndTimestamp = Math.floor(Date.now() / 1000) + 3600;
    const created = await step('create Lazy Sovereign collection', () =>
      jsonCommand<CreateSovereignResult>(live.sellerHome, [
        'collection',
        'create',
        'lazy-sovereign',
        `Rare CLI Lazy E2E ${suffix}`,
        `RCL${suffix.slice(-4).toUpperCase()}`,
        '--max-tokens',
        '3',
        '--chain',
        'sepolia',
      ]),
    );

    expectTx(created);
    expect(created.contract).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(created.factory).toBe('0xc5B8Ad9003673a23d005A6448C74d8955a1a38fA');
    expect(created.contractType).toBe('lazy');
    expect(created.nextStep).toContain('Configure release sale and mint settings');

    const prepared = await step('prepare lazy mint batch', () =>
      jsonCommand<CollectionPrepareLazyMintResult>(live.sellerHome, [
        'collection',
        'prepare-lazy-mint',
        '--contract',
        created.contract,
        '--base-uri',
        E2E_LAZY_BASE_URI,
        '--token-count',
        '2',
        '--minter',
        live.buyerAddress,
        '--chain',
        'sepolia',
      ]),
    );

    expectTx(prepared);
    expect(prepared.contract).toBe(created.contract);
    expect(prepared.baseUri).toBe(E2E_LAZY_BASE_URI);
    expect(prepared.tokenCount).toBe('2');
    expect(prepared.minter?.toLowerCase()).toBe(live.buyerAddress.toLowerCase());

    const initialMetadata = await readCollectionMetadata(live.sellerHome, created.contract);
    expect(initialMetadata.baseUri).toBe(E2E_LAZY_BASE_URI);
    expect(initialMetadata.tokenCount).toBe('2');
    expect(initialMetadata.lockedMetadata).toBe(false);

    const updatedBase = await step('update lazy base URI', () =>
      jsonCommand<CollectionMetadataWriteResult>(live.sellerHome, [
        'collection',
        'metadata',
        'update-base-uri',
        '--contract',
        created.contract,
        '--base-uri',
        E2E_LAZY_UPDATED_BASE_URI,
        '--chain',
        'sepolia',
      ]),
    );
    expectTx(updatedBase);
    expect(updatedBase.baseUri).toBe(E2E_LAZY_UPDATED_BASE_URI);

    const updatedToken = await step('update lazy token URI', () =>
      jsonCommand<CollectionMetadataWriteResult>(live.sellerHome, [
        'collection',
        'metadata',
        'update-token-uri',
        '--contract',
        created.contract,
        '--token-id',
        '1',
        '--token-uri',
        E2E_LAZY_TOKEN_URI,
        '--chain',
        'sepolia',
      ]),
    );
    expectTx(updatedToken);
    expect(updatedToken.tokenId).toBe('1');
    expect(updatedToken.tokenUri).toBe(E2E_LAZY_TOKEN_URI);

    const locked = await step('lock lazy base URI', () =>
      jsonCommand<CollectionMetadataWriteResult>(live.sellerHome, [
        'collection',
        'metadata',
        'lock-base-uri',
        '--contract',
        created.contract,
        '--chain',
        'sepolia',
      ]),
    );
    expectTx(locked);
    expect(locked.baseUri).toBe(E2E_LAZY_UPDATED_BASE_URI);

    const lockedMetadata = await readCollectionMetadata(live.sellerHome, created.contract);
    expect(lockedMetadata.baseUri).toBe(E2E_LAZY_UPDATED_BASE_URI);
    expect(lockedMetadata.lockedMetadata).toBe(true);

    const allowlist = await step('set release allowlist config', () =>
      jsonCommand<ReleaseAllowlistConfigResult>(live.sellerHome, [
        'release',
        'allowlist',
        'set',
        '--contract',
        created.contract,
        '--root',
        E2E_ALLOWLIST_ROOT,
        '--end-timestamp',
        allowlistEndTimestamp.toString(),
        '--chain',
        'sepolia',
      ]),
    );
    expectTx(allowlist);
    expect(allowlist.contract.toLowerCase()).toBe(created.contract.toLowerCase());
    expect(allowlist.root).toBe(E2E_ALLOWLIST_ROOT);
    expect(allowlist.endTimestamp).toBe(allowlistEndTimestamp.toString());

    const mintLimit = await step('set release mint limit', () =>
      jsonCommand<ReleaseLimitResult>(live.sellerHome, [
        'release',
        'limits',
        'set-mint',
        '--contract',
        created.contract,
        '--limit',
        '2',
        '--chain',
        'sepolia',
      ]),
    );
    expectTx(mintLimit);
    expect(mintLimit.limit).toBe('2');

    const txLimit = await step('set release transaction limit', () =>
      jsonCommand<ReleaseLimitResult>(live.sellerHome, [
        'release',
        'limits',
        'set-tx',
        '--contract',
        created.contract,
        '--limit',
        '1',
        '--chain',
        'sepolia',
      ]),
    );
    expectTx(txLimit);
    expect(txLimit.limit).toBe('1');

    const releaseStatus = await step('read release config', () =>
      jsonCommand<ReleaseStatusResult>(live.sellerHome, [
        'release',
        'status',
        '--contract',
        created.contract,
        '--account',
        live.buyerAddress,
        '--chain',
        'sepolia',
      ]),
    );
    expect(releaseStatus.contract.toLowerCase()).toBe(created.contract.toLowerCase());
    expect(releaseStatus.allowlistRoot).toBe(E2E_ALLOWLIST_ROOT);
    expect(releaseStatus.allowlistEndTimestamp).toBe(allowlistEndTimestamp.toString());
    expect(releaseStatus.mintLimit).toBe('2');
    expect(releaseStatus.txLimit).toBe('1');
    expect(releaseStatus.account?.toLowerCase()).toBe(live.buyerAddress.toLowerCase());
    expect(releaseStatus.accountMints).toBe('0');
    expect(releaseStatus.accountTxs).toBe('0');
  });

  it('mints a prepared RareMinter direct sale release', async () => {
    const suffix = Date.now().toString(36);
    const minter = getContractAddresses('sepolia').rareMinter!;
    const created = await step('create direct sale Lazy Sovereign collection', () =>
      jsonCommand<CreateSovereignResult>(live.sellerHome, [
        'collection',
        'create',
        'lazy-sovereign',
        `Rare CLI Direct Sale E2E ${suffix}`,
        `RCD${suffix.slice(-4).toUpperCase()}`,
        '--max-tokens',
        '2',
        '--chain',
        'sepolia',
      ]),
    );
    expectTx(created);

    const prepared = await step('prepare direct sale lazy mint batch', () =>
      jsonCommand<CollectionPrepareLazyMintResult>(live.sellerHome, [
        'collection',
        'prepare-lazy-mint',
        '--contract',
        created.contract,
        '--base-uri',
        E2E_LAZY_BASE_URI,
        '--token-count',
        '2',
        '--minter',
        minter,
        '--chain',
        'sepolia',
      ]),
    );
    expectTx(prepared);

    await step('prepare RareMinter direct sale config', () =>
      prepareDirectSale(created.contract, minter),
    );

    const minted = await step('mint direct sale release', () =>
      jsonCommand<ReleaseMintDirectSaleResult>(live.buyerHome, [
        'release',
        'mint',
        '--contract',
        created.contract,
        '--quantity',
        '2',
        '--chain',
        'sepolia',
      ]),
    );

    expectTx(minted);
    expect(minted.contract.toLowerCase()).toBe(created.contract.toLowerCase());
    expect(minted.minter.toLowerCase()).toBe(minter.toLowerCase());
    expect(minted.buyer.toLowerCase()).toBe(live.buyerAddress.toLowerCase());
    expect(minted.recipient.toLowerCase()).toBe(live.buyerAddress.toLowerCase());
    expect(minted.quantity).toBe(2);
    expect(minted.currency).toBe(E2E_ETH_ADDRESS);
    expect(minted.price).toBe('0');
    expect(minted.totalPrice).toBe('0');
    expect(minted.requiredPayment).toBe('0');
    expect(minted.allowlistRequired).toBe(false);
    expect(minted.tokenIdStart).toBe('1');
    expect(minted.tokenIdEnd).toBe('2');
    expect(minted.tokenIds).toEqual(['1', '2']);
    await expectTokenOwner(live.buyerHome, created.contract, '1', live.buyerAddress, `${E2E_LAZY_BASE_URI}/1.json`);
    await expectTokenOwner(live.buyerHome, created.contract, '2', live.buyerAddress, `${E2E_LAZY_BASE_URI}/2.json`);
  });

  it('mints directly to another recipient', async () => {
    await expectTokenOwner(live.sellerHome, live.collection.contract, live.buyerMintToken.tokenId, live.buyerAddress);
  });

  it('creates and cancels a listing', async () => {
    const listingCancelCreate = await step('create listing for cancellation', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'listing',
        'create',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.listingCancelToken.tokenId,
        '--price',
        '0.000001',
        '--chain',
        'sepolia',
      ]),
    );
    expectTx(listingCancelCreate);
    expect(listingCancelCreate.approvalTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    await expectListingStatus(live.sellerHome, live.collection.contract, live.listingCancelToken.tokenId, true);

    expectTx(await step('cancel listing', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'listing',
        'cancel',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.listingCancelToken.tokenId,
        '--chain',
        'sepolia',
      ]),
    ));
    await expectListingStatus(live.sellerHome, live.collection.contract, live.listingCancelToken.tokenId, false);
  });

  it('creates and cancels a scheduled auction with explicit seller splits', async () => {
    const startTime = Math.floor(Date.now() / 1000) + 3600;
    const created = await step('create scheduled auction', () =>
      jsonCommand<AuctionCreateResult>(live.sellerHome, [
        'auction',
        'create',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.scheduledAuctionToken.tokenId,
        '--starting-price',
        '0.000001',
        '--duration',
        liveAuctionDurationSeconds().toString(),
        '--type',
        'scheduled',
        '--start-time',
        startTime.toString(),
        '--split-recipient',
        live.sellerAddress,
        '--split-ratio',
        '100',
        '--chain',
        'sepolia',
      ]),
    );
    expectTx(created);
    expect(created.auctionType).toBe('scheduled');
    expect(created.startTime).toBe(startTime.toString());

    const status = await step('read scheduled auction status', () =>
      jsonCommand<AuctionStatusResult>(live.sellerHome, [
        'auction',
        'status',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.scheduledAuctionToken.tokenId,
        '--chain',
        'sepolia',
      ]),
    );
    expect(status.status).toBe('PENDING');
    expect(status.state).toBe('SCHEDULED');
    expect(status.auctionTypeName).toBe('scheduled');
    expect(status.currentBid).toBe('0');
    expect(status.currentBidder).toBeNull();
    expect(status.settlementEligible).toBe(false);
    expect(status.startingTime).toBe(startTime.toString());

    expectTx(await step('cancel scheduled auction', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'auction',
        'cancel',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.scheduledAuctionToken.tokenId,
        '--chain',
        'sepolia',
      ]),
    ));
    await expectTokenOwner(live.sellerHome, live.collection.contract, live.scheduledAuctionToken.tokenId, live.sellerAddress);
  });

  it('creates a zero-price listing as an inactive listing without repeating approval', async () => {
    const zeroPriceListingCreate = await step('create zero-price listing', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'listing',
        'create',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.zeroPriceListingToken.tokenId,
        '--price',
        '0',
        '--chain',
        'sepolia',
      ]),
    );

    expectTx(zeroPriceListingCreate);
    expect(zeroPriceListingCreate.approvalTxHash).toBeNull();
    await expectListingStatus(live.sellerHome, live.collection.contract, live.zeroPriceListingToken.tokenId, false);
  });

  it('creates and buys a listing', async () => {
    const listingBuyCreate = await step('create listing for purchase', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'listing',
        'create',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.listingBuyToken.tokenId,
        '--price',
        '0.000001',
        '--chain',
        'sepolia',
      ]),
    );
    expectTx(listingBuyCreate);
    expect(listingBuyCreate.approvalTxHash).toBeNull();

    expectTx(await step('buy listing', () =>
      jsonCommand<TxResult>(live.buyerHome, [
        'listing',
        'buy',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.listingBuyToken.tokenId,
        '--amount',
        '0.000001',
        '--chain',
        'sepolia',
      ]),
    ));
    await expectListingStatus(live.sellerHome, live.collection.contract, live.listingBuyToken.tokenId, false);
  });

  it('creates and cancels an auction', async () => {
    const auctionCancelCreate = await step('create auction for cancellation', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'auction',
        'create',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.auctionCancelToken.tokenId,
        '--starting-price',
        '0.000001',
        '--duration',
        liveAuctionDurationSeconds().toString(),
        '--chain',
        'sepolia',
      ]),
    );
    expectTx(auctionCancelCreate);
    expect(auctionCancelCreate.approvalTxHash).toBeNull();

    await expectAuctionStatus(live.sellerHome, live.collection.contract, live.auctionCancelToken.tokenId, 'PENDING');
    expectTx(await step('cancel auction', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'auction',
        'cancel',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.auctionCancelToken.tokenId,
        '--chain',
        'sepolia',
      ]),
    ));
  });

  it('auto-approves a buyer-owned token before creating and cancelling an auction', async () => {
    const buyerAuctionCreate = await step('create buyer-owned auction for cancellation', () =>
      jsonCommand<TxResult>(live.buyerHome, [
        'auction',
        'create',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.buyerAuctionCancelToken.tokenId,
        '--starting-price',
        '0.000001',
        '--duration',
        liveAuctionDurationSeconds().toString(),
        '--chain',
        'sepolia',
      ]),
    );

    expectTx(buyerAuctionCreate);
    expect(buyerAuctionCreate.approvalTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    await expectAuctionStatus(live.buyerHome, live.collection.contract, live.buyerAuctionCancelToken.tokenId, 'PENDING');

    expectTx(await step('cancel buyer-owned auction', () =>
      jsonCommand<TxResult>(live.buyerHome, [
        'auction',
        'cancel',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.buyerAuctionCancelToken.tokenId,
        '--chain',
        'sepolia',
      ]),
    ));
  });

  it('creates, bids, and settles an auction', async () => {
    const auctionSettleCreate = await step('create auction for settlement', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'auction',
        'create',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.auctionSettleToken.tokenId,
        '--starting-price',
        '0.000001',
        '--duration',
        liveAuctionDurationSeconds().toString(),
        '--chain',
        'sepolia',
      ]),
    );
    expectTx(auctionSettleCreate);
    expect(auctionSettleCreate.approvalTxHash).toBeNull();

    expectTx(await step('bid on auction', () =>
      jsonCommand<TxResult>(live.buyerHome, [
        'auction',
        'bid',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.auctionSettleToken.tokenId,
        '--amount',
        '0.000001',
        '--chain',
        'sepolia',
      ]),
    ));
    await step('wait for auction to end', waitForAuctionToEnd);
    await expectAuctionStatus(live.sellerHome, live.collection.contract, live.auctionSettleToken.tokenId, 'ENDED');
    expectTx(await step('settle auction', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'auction',
        'settle',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.auctionSettleToken.tokenId,
        '--chain',
        'sepolia',
      ]),
    ));
  });

  it('creates and cancels an offer', async () => {
    expectTx(live.offerCancelCreate);
    await expectOfferStatus(live.sellerHome, live.collection.contract, live.offerCancelToken.tokenId, true);
    await live.offerCancelReady;
    expectTx(await step('cancel offer', () =>
      jsonCommand<TxResult>(live.buyerHome, [
        'offer',
        'cancel',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.offerCancelToken.tokenId,
        '--chain',
        'sepolia',
      ]),
    ));
    await expectOfferStatus(live.sellerHome, live.collection.contract, live.offerCancelToken.tokenId, false);
  });

  it('creates and accepts an offer', async () => {
    expectTx(await step('create offer for acceptance', () =>
      jsonCommand<TxResult>(live.buyerHome, [
        'offer',
        'create',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.offerAcceptToken.tokenId,
        '--amount',
        '0.000001',
        '--chain',
        'sepolia',
      ]),
    ));
    expectTx(await step('accept offer', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'offer',
        'accept',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.offerAcceptToken.tokenId,
        '--amount',
        '0.000001',
        '--chain',
        'sepolia',
      ]),
    ));
    await expectOfferStatus(live.sellerHome, live.collection.contract, live.offerAcceptToken.tokenId, false);
  });

  it('creates and accepts a RARE offer through the live allowance path', async () => {
    const currency = resolveCurrency(E2E_RARE_CURRENCY, 'sepolia');
    const amountWei = parseEther(E2E_RARE_AMOUNT);
    const auctionAddress = getContractAddresses('sepolia').auction;
    const balance = await readErc20Balance(currency, live.buyerAddress);

    if (balance < amountWei) {
      throw new Error(
        `E2E buyer has insufficient Sepolia RARE balance for live ERC20 offer test. ` +
          `Required at least ${amountWei}, found ${balance}.`,
      );
    }

    await step('reset buyer ERC20 allowance', () =>
      approveErc20(currency, livePrivateKey('E2E_BUYER_PRIVATE_KEY'), auctionAddress, 0n),
    );
    expect(await readErc20Allowance(currency, live.buyerAddress, auctionAddress)).toBe(0n);

    expectTx(await step('create ERC20 offer for acceptance', () =>
      jsonCommand<TxResult>(live.buyerHome, [
        'offer',
        'create',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.rareOfferAcceptToken.tokenId,
        '--amount',
        E2E_RARE_AMOUNT,
        '--currency',
        E2E_RARE_CURRENCY,
        '--chain',
        'sepolia',
      ], 240_000),
    ));

    expect(await readErc20Allowance(currency, live.buyerAddress, auctionAddress)).toBeGreaterThanOrEqual(amountWei);
    await expectOfferStatus(live.sellerHome, live.collection.contract, live.rareOfferAcceptToken.tokenId, true, E2E_RARE_CURRENCY);

    expectTx(await step('accept ERC20 offer', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'offer',
        'accept',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.rareOfferAcceptToken.tokenId,
        '--amount',
        E2E_RARE_AMOUNT,
        '--currency',
        E2E_RARE_CURRENCY,
        '--chain',
        'sepolia',
      ]),
    ));
    await expectOfferStatus(live.sellerHome, live.collection.contract, live.rareOfferAcceptToken.tokenId, false, E2E_RARE_CURRENCY);
  });

  it('creates, cancels, recreates, and accepts a collection-wide offer when RareCollectionMarket is configured', async () => {
    const collectionMarket = getContractAddresses('sepolia').collectionMarket;
    if (!collectionMarket) {
      return;
    }

    const token = await step('mint collection-market offer token', () =>
      mintToken(live.sellerHome, live.collection.contract),
    );

    const createdForCancel = await step('create collection-market offer for cancellation', () =>
      jsonCommand<CollectionMarketOfferWriteResult>(live.buyerHome, [
        'collection-market',
        'offer',
        'create',
        '--collection',
        live.collection.contract,
        '--amount',
        '0.000001',
        '--chain',
        'sepolia',
      ], 240_000),
    );
    expectTx(createdForCancel);
    expect(createdForCancel.collectionMarket.toLowerCase()).toBe(collectionMarket.toLowerCase());
    expect(createdForCancel.buyer.toLowerCase()).toBe(live.buyerAddress.toLowerCase());
    expect(createdForCancel.originCollection.toLowerCase()).toBe(live.collection.contract.toLowerCase());
    await expectCollectionMarketOfferStatus({
      home: live.sellerHome,
      buyer: live.buyerAddress,
      collection: live.collection.contract,
      tokenId: token.tokenId,
      hasOffer: true,
      canAccept: true,
      account: live.sellerAddress,
    });

    const cancelled = await step('cancel collection-market offer', () =>
      jsonCommand<CollectionMarketOfferWriteResult>(live.buyerHome, [
        'collection-market',
        'offer',
        'cancel',
        '--collection',
        live.collection.contract,
        '--chain',
        'sepolia',
      ], 240_000),
    );
    expectTx(cancelled);
    expect(cancelled.hadOffer).toBe(true);
    await expectCollectionMarketOfferStatus({
      home: live.sellerHome,
      buyer: live.buyerAddress,
      collection: live.collection.contract,
      tokenId: token.tokenId,
      hasOffer: false,
      canAccept: false,
      account: live.sellerAddress,
    });

    const createdForAccept = await step('create collection-market offer for acceptance', () =>
      jsonCommand<CollectionMarketOfferWriteResult>(live.buyerHome, [
        'collection-market',
        'offer',
        'create',
        '--collection',
        live.collection.contract,
        '--amount',
        '0.000001',
        '--chain',
        'sepolia',
      ], 240_000),
    );
    expectTx(createdForAccept);

    const accepted = await step('accept collection-market offer', () =>
      jsonCommand<CollectionMarketOfferWriteResult>(live.sellerHome, [
        'collection-market',
        'offer',
        'accept',
        '--collection',
        live.collection.contract,
        '--buyer',
        live.buyerAddress,
        '--token-id',
        token.tokenId,
        '--amount',
        '0.000001',
        '--chain',
        'sepolia',
      ], 240_000),
    );
    expectTx(accepted);
    expect(accepted.approvalTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    await expectCollectionMarketOfferStatus({
      home: live.sellerHome,
      buyer: live.buyerAddress,
      collection: live.collection.contract,
      tokenId: token.tokenId,
      hasOffer: false,
      canAccept: false,
      account: live.sellerAddress,
    });
    await expectTokenOwner(live.sellerHome, live.collection.contract, token.tokenId, live.buyerAddress);
  });

  it('creates, revokes, recreates, and accepts a batch offer', async () => {
    const tokenCsv = join(live.sellerHome, 'batch-offer-tokens.csv');
    const artifactPath = join(live.sellerHome, 'batch-offer-artifact.json');
    const proofPath = join(live.sellerHome, 'batch-offer-proof.json');
    await writeFile(tokenCsv, [
      'contract_address,token_id,chain_id',
      `${live.collection.contract},${live.batchOfferToken.tokenId},11155111`,
    ].join('\n'), 'utf8');

    const artifact = await step('build batch offer token tree artifact', () =>
      jsonCommand<BatchTreeBuildResult>(live.sellerHome, [
        'batch',
        'tree',
        'build',
        '--input',
        tokenCsv,
        '--output',
        artifactPath,
      ]),
    );
    expect(artifact.count).toBe(1);
    expect(artifact.chainId).toBe(11_155_111);
    expect(artifact.output).toBe(artifactPath);

    const proof = await step('build batch offer token proof', () =>
      jsonCommand<BatchTreeProofResult>(live.sellerHome, [
        'batch',
        'tree',
        'proof',
        '--input',
        artifactPath,
        '--contract',
        live.collection.contract,
        '--token-id',
        live.batchOfferToken.tokenId,
        '--output',
        proofPath,
      ]),
    );
    expect(proof.root).toBe(artifact.root);
    expect(proof.valid).toBe(true);
    expect(proof.output).toBe(proofPath);

    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const createdForRevoke = await step('create batch offer for revocation', () =>
      jsonCommand<BatchOfferWriteResult>(live.buyerHome, [
        'batch',
        'offer',
        'create',
        '--input',
        artifactPath,
        '--amount',
        '0.000001',
        '--expiry',
        expiry.toString(),
        '--chain',
        'sepolia',
      ], 240_000),
    );
    expectTx(createdForRevoke);
    expect(createdForRevoke.creator.toLowerCase()).toBe(live.buyerAddress.toLowerCase());
    expect(createdForRevoke.root).toBe(artifact.root);
    expect(createdForRevoke.currency).toBe(E2E_ETH_ADDRESS);
    expect(BigInt(createdForRevoke.requiredPayment ?? '0')).toBeGreaterThanOrEqual(parseEther('0.000001'));
    await expectBatchOfferStatus(live.sellerHome, live.buyerAddress, artifactPath, true);

    const revoked = await step('revoke batch offer', () =>
      jsonCommand<BatchOfferWriteResult>(live.buyerHome, [
        'batch',
        'offer',
        'revoke',
        '--input',
        artifactPath,
        '--chain',
        'sepolia',
      ]),
    );
    expectTx(revoked);
    expect(revoked.root).toBe(artifact.root);
    await expectBatchOfferStatus(live.sellerHome, live.buyerAddress, artifactPath, false);

    const createdForAccept = await step('create batch offer for acceptance', () =>
      jsonCommand<BatchOfferWriteResult>(live.buyerHome, [
        'batch',
        'offer',
        'create',
        '--input',
        artifactPath,
        '--amount',
        '0.000001',
        '--expiry',
        expiry.toString(),
        '--chain',
        'sepolia',
      ], 240_000),
    );
    expectTx(createdForAccept);
    expect(createdForAccept.root).toBe(artifact.root);

    const accepted = await step('accept batch offer', () =>
      jsonCommand<BatchOfferWriteResult>(live.sellerHome, [
        'batch',
        'offer',
        'accept',
        '--creator',
        live.buyerAddress,
        '--proof',
        proofPath,
        '--contract',
        live.collection.contract,
        '--token-id',
        live.batchOfferToken.tokenId,
        '--chain',
        'sepolia',
      ], 240_000),
    );
    expectTx(accepted);
    expect(accepted.approvalTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(accepted.root).toBe(artifact.root);
    await expectBatchOfferStatus(live.sellerHome, live.buyerAddress, artifactPath, false);
    await expectTokenOwner(live.sellerHome, live.collection.contract, live.batchOfferToken.tokenId, live.buyerAddress);
  });

  it('creates, bids, and settles a batch auction', async () => {
    const tokenCsv = join(live.sellerHome, 'batch-auction-tokens.csv');
    const artifactPath = join(live.sellerHome, 'batch-auction-artifact.json');
    const proofPath = join(live.sellerHome, 'batch-auction-proof.json');
    await writeFile(tokenCsv, [
      'contract_address,token_id,chain_id',
      `${live.collection.contract},${live.batchAuctionToken.tokenId},11155111`,
    ].join('\n'), 'utf8');

    const artifact = await step('build batch auction token tree artifact', () =>
      jsonCommand<BatchTreeBuildResult>(live.sellerHome, [
        'batch',
        'tree',
        'build',
        '--input',
        tokenCsv,
        '--output',
        artifactPath,
      ]),
    );
    expect(artifact.count).toBe(1);
    expect(artifact.output).toBe(artifactPath);

    const proof = await step('build batch auction token proof', () =>
      jsonCommand<BatchTreeProofResult>(live.sellerHome, [
        'batch',
        'tree',
        'proof',
        '--input',
        artifactPath,
        '--contract',
        live.collection.contract,
        '--token-id',
        live.batchAuctionToken.tokenId,
        '--output',
        proofPath,
      ]),
    );
    expect(proof.root).toBe(artifact.root);
    expect(proof.valid).toBe(true);

    const created = await step('create batch auction root', () =>
      jsonCommand<BatchAuctionWriteResult>(live.sellerHome, [
        'batch',
        'auction',
        'create',
        '--input',
        artifactPath,
        '--reserve',
        '0.000001',
        '--duration',
        '1',
        '--chain',
        'sepolia',
      ], 240_000),
    );
    expectTx(created);
    expect(created.creator.toLowerCase()).toBe(live.sellerAddress.toLowerCase());
    expect(created.root).toBe(artifact.root);
    expect(created.currency).toBe(E2E_ETH_ADDRESS);
    expect(created.approvalTxHashes?.length).toBeGreaterThanOrEqual(1);

    await expectBatchAuctionStatus({
      home: live.sellerHome,
      creator: live.sellerAddress,
      artifactPath,
      contract: live.collection.contract,
      tokenId: live.batchAuctionToken.tokenId,
      state: 'RESERVE_NOT_MET',
      hasAuction: false,
    });

    const bid = await step('bid on batch auction token', () =>
      jsonCommand<BatchAuctionWriteResult>(live.buyerHome, [
        'batch',
        'auction',
        'bid',
        '--creator',
        live.sellerAddress,
        '--proof',
        proofPath,
        '--contract',
        live.collection.contract,
        '--token-id',
        live.batchAuctionToken.tokenId,
        '--amount',
        '0.000001',
        '--chain',
        'sepolia',
      ], 240_000),
    );
    expectTx(bid);
    expect(bid.creator.toLowerCase()).toBe(live.sellerAddress.toLowerCase());
    expect(bid.root).toBe(artifact.root);
    expect(BigInt(bid.requiredPayment ?? '0')).toBeGreaterThanOrEqual(parseEther('0.000001'));

    await expectBatchAuctionStatus({
      home: live.sellerHome,
      creator: live.sellerAddress,
      artifactPath,
      contract: live.collection.contract,
      tokenId: live.batchAuctionToken.tokenId,
      state: 'ACTIVE',
      hasAuction: true,
      currentBidder: live.buyerAddress,
    });

    await new Promise((resolve) => setTimeout(resolve, 15_000));

    const settled = await step('settle batch auction token', () =>
      jsonCommand<BatchAuctionWriteResult>(live.sellerHome, [
        'batch',
        'auction',
        'settle',
        '--contract',
        live.collection.contract,
        '--token-id',
        live.batchAuctionToken.tokenId,
        '--chain',
        'sepolia',
      ], 240_000),
    );
    expectTx(settled);
    await expectTokenOwner(live.sellerHome, live.collection.contract, live.batchAuctionToken.tokenId, live.buyerAddress);
  });
});

async function configureLiveHome(home: string, privateKey: string): Promise<void> {
  const result = await runCli([
    'configure',
    '--default-chain',
    'sepolia',
    '--chain',
    'sepolia',
    '--private-key',
    privateKey,
    '--rpc-url',
    process.env.TEST_RPC_URL!,
  ], { home });

  expect(result.code).toBe(0);
  expect(result.stderr).toBe('');
}

async function mintToken(home: string, contract: string, opts: { to?: string } = {}): Promise<MintResult> {
  const args = [
    'mint',
    '--contract',
    contract,
    '--token-uri',
    E2E_TOKEN_URI,
    '--chain',
    'sepolia',
  ];
  if (opts.to) {
    args.push('--to', opts.to);
  }

  const result = await jsonCommand<MintResult>(home, args);

  expectTx(result);
  expect(result.contract).toBe(contract);
  expect(result.tokenUri).toBe(E2E_TOKEN_URI);
  expect(result.tokenId).toMatch(/^\d+$/);
  return result;
}

async function expectListingStatus(
  home: string,
  contract: string,
  tokenId: string,
  hasListing: boolean,
): Promise<void> {
  const status = await jsonCommand<{ hasListing: boolean }>(home, [
    'listing',
    'status',
    '--contract',
    contract,
    '--token-id',
    tokenId,
    '--chain',
    'sepolia',
  ]);
  expect(status.hasListing).toBe(hasListing);
}

async function expectOfferStatus(
  home: string,
  contract: string,
  tokenId: string,
  hasOffer: boolean,
  currency?: string,
): Promise<void> {
  const args = [
    'offer',
    'status',
    '--contract',
    contract,
    '--token-id',
    tokenId,
    '--chain',
    'sepolia',
  ];
  if (currency) {
    args.push('--currency', currency);
  }

  const status = await jsonCommand<{ hasOffer: boolean }>(home, args);
  expect(status.hasOffer).toBe(hasOffer);
}

async function expectCollectionMarketOfferStatus(opts: {
  home: string;
  buyer: Address;
  collection: string;
  tokenId: string;
  hasOffer: boolean;
  canAccept: boolean;
  account: Address;
}): Promise<void> {
  const status = await jsonCommand<CollectionMarketOfferStatusResult>(opts.home, [
    'collection-market',
    'offer',
    'status',
    '--collection',
    opts.collection,
    '--buyer',
    opts.buyer,
    '--token-id',
    opts.tokenId,
    '--account',
    opts.account,
    '--chain',
    'sepolia',
  ]);

  expect(status.buyer.toLowerCase()).toBe(opts.buyer.toLowerCase());
  expect(status.originCollection.toLowerCase()).toBe(opts.collection.toLowerCase());
  expect(status.hasOffer).toBe(opts.hasOffer);
  expect(status.state).toBe(opts.hasOffer ? 'ACTIVE' : 'NONE');
  expect(status.canAccept).toBe(opts.canAccept);
}

async function expectBatchOfferStatus(
  home: string,
  creator: Address,
  artifactPath: string,
  hasOffer: boolean,
): Promise<void> {
  const status = await jsonCommand<BatchOfferStatusResult>(home, [
    'batch',
    'offer',
    'status',
    '--creator',
    creator,
    '--input',
    artifactPath,
    '--chain',
    'sepolia',
  ]);

  expect(status.hasOffer).toBe(hasOffer);
  expect(status.fillable).toBe(hasOffer);
  expect(status.state).toBe(hasOffer ? 'ACTIVE' : 'NONE');
}

async function expectBatchAuctionStatus(opts: {
  home: string;
  creator: Address;
  artifactPath: string;
  contract: string;
  tokenId: string;
  state: string;
  hasAuction: boolean;
  currentBidder?: Address;
}): Promise<void> {
  const status = await jsonCommand<BatchAuctionStatusResult>(opts.home, [
    'batch',
    'auction',
    'status',
    '--creator',
    opts.creator,
    '--input',
    opts.artifactPath,
    '--contract',
    opts.contract,
    '--token-id',
    opts.tokenId,
    '--chain',
    'sepolia',
  ]);

  expect(status.root).toMatch(/^0x[0-9a-fA-F]{64}$/);
  expect(status.hasRootConfig).toBe(true);
  expect(status.hasAuction).toBe(opts.hasAuction);
  expect(status.state).toBe(opts.state);
  if (opts.currentBidder !== undefined) {
    expect(status.currentBidder?.toLowerCase()).toBe(opts.currentBidder.toLowerCase());
  }
}

async function expectAuctionStatus(
  home: string,
  contract: string,
  tokenId: string,
  expectedStatus: 'PENDING' | 'RUNNING' | 'ENDED',
): Promise<void> {
  const status = await jsonCommand<{ status: string }>(home, [
    'auction',
    'status',
    '--contract',
    contract,
    '--token-id',
    tokenId,
    '--chain',
    'sepolia',
  ]);
  expect(status.status).toBe(expectedStatus);
}

async function readCollectionRoyalty(
  home: string,
  contract: string,
  tokenId: string,
): Promise<CollectionRoyaltyInfoResult> {
  return jsonCommand<CollectionRoyaltyInfoResult>(home, [
    'collection',
    'royalty',
    'status',
    '--contract',
    contract,
    '--token-id',
    tokenId,
    '--chain',
    'sepolia',
  ]);
}

async function readCollectionMetadata(
  home: string,
  contract: string,
): Promise<CollectionMetadataStatusResult> {
  return jsonCommand<CollectionMetadataStatusResult>(home, [
    'collection',
    'metadata',
    'status',
    '--contract',
    contract,
    '--chain',
    'sepolia',
  ]);
}

async function jsonCommand<T>(home: string, args: string[], timeoutMs = 180_000): Promise<T> {
  return parseJsonStdout<T>(await runCli(['--json', ...args], { home, timeoutMs }));
}

function expectTx(result: TxResult): void {
  expect(result.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  expect(result.blockNumber).toMatch(/^\d+$/);
}

async function expectTokenOwner(
  home: string,
  contract: string,
  tokenId: string,
  owner: Address,
  expectedTokenUri = E2E_TOKEN_URI,
): Promise<void> {
  const status = await jsonCommand<{
    token: { owner: Address; tokenUri: string; tokenId: string } | null;
  }>(home, [
    'status',
    '--contract',
    contract,
    '--token-id',
    tokenId,
    '--chain',
    'sepolia',
  ]);

  expect(status.token).not.toBeNull();
  expect(status.token!.owner.toLowerCase()).toBe(owner.toLowerCase());
  expect(status.token!.tokenUri).toBe(expectedTokenUri);
}

async function readErc20Balance(currency: Address, owner: Address): Promise<bigint> {
  return createLivePublicClient().readContract({
    address: currency,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner],
  });
}

async function readErc20Allowance(currency: Address, owner: Address, spender: Address): Promise<bigint> {
  return createLivePublicClient().readContract({
    address: currency,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, spender],
  });
}

async function approveErc20(
  currency: Address,
  privateKey: `0x${string}`,
  spender: Address,
  amount: bigint,
): Promise<void> {
  const publicClient = createLivePublicClient();
  const walletClient = createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: sepolia,
    transport: http(process.env.TEST_RPC_URL!),
  });
  const txHash = await walletClient.writeContract({
    address: currency,
    abi: erc20Abi,
    functionName: 'approve',
    args: [spender, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
}

async function prepareDirectSale(contract: string, minter: Address): Promise<void> {
  const publicClient = createLivePublicClient();
  const walletClient = createWalletClient({
    account: privateKeyToAccount(livePrivateKey('E2E_SELLER_PRIVATE_KEY')),
    chain: sepolia,
    transport: http(process.env.TEST_RPC_URL!),
  });
  const txHash = await walletClient.writeContract({
    address: minter,
    abi: rareMinterAbi,
    functionName: 'prepareMintDirectSale',
    args: [
      contract as Address,
      E2E_ETH_ADDRESS,
      0n,
      0n,
      2n,
      [live.sellerAddress],
      [100],
    ],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
}

function createLivePublicClient() {
  return createPublicClient({
    chain: sepolia,
    transport: http(process.env.TEST_RPC_URL!),
  });
}

function livePrivateKey(name: 'E2E_SELLER_PRIVATE_KEY' | 'E2E_BUYER_PRIVATE_KEY'): `0x${string}` {
  const value = process.env[name];
  if (!value || !value.startsWith('0x')) {
    throw new Error(`${name} must be set to a 0x-prefixed private key.`);
  }
  return value as `0x${string}`;
}

function liveAuctionDurationSeconds(): number {
  return Number.parseInt(process.env.E2E_AUCTION_DURATION_SECONDS ?? '60', 10);
}

function liveOfferCancelDelaySeconds(): number {
  return Number.parseInt(process.env.E2E_OFFER_CANCEL_DELAY_SECONDS ?? '310', 10);
}

async function waitForAuctionToEnd(): Promise<void> {
  const duration = liveAuctionDurationSeconds();
  await new Promise((resolve) => setTimeout(resolve, (duration + 10) * 1000));
}

async function waitForOfferCancelDelay(): Promise<void> {
  const duration = liveOfferCancelDelaySeconds();
  await new Promise((resolve) => setTimeout(resolve, duration * 1000));
}

function startOfferCancelDelay(): Promise<void> {
  console.error(`[live e2e] wait for offer cancellation delay (${liveOfferCancelDelaySeconds()}s)`);
  return waitForOfferCancelDelay();
}

async function createTempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'rare-cli-live-e2e-home-'));
}

async function cleanupTempHome(home: string | undefined): Promise<void> {
  if (!home) return;
  await rm(home, { recursive: true, force: true });
}

async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  console.error(`[live e2e] ${label}`);
  return fn();
}
