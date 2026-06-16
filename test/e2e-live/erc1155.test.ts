import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Address } from 'viem';
import { chainIds, getContractAddresses, type SupportedChain } from '../../src/contracts/addresses.js';
import { getPublicClient } from '../../src/client.js';
import { createRareClient } from '../../src/sdk/client.js';
import type { Nft } from '../../src/sdk/api.js';
import {
  cleanupTempHome,
  configureLiveHome,
  createTempHome,
  detectLiveChain,
  expectTx,
  jsonCommand,
  step,
  type TxResult,
} from './live-helpers.js';
import { hasLiveWalletEnv } from './env.mjs';
import { E2E_BATCH_BASE_URI, E2E_TOKEN_URI } from './helpers/live-cli-fixture.js';
import { releaseLiveWallets, reserveLiveWalletPair, type LiveWalletLease } from './helpers/live-wallet-pool.js';

const requiredEnv = [
  'TEST_RPC_URL',
] as const;

const missingEnv = [
  ...requiredEnv.filter((name) => !process.env[name]),
  ...(hasLiveWalletEnv('seller') ? [] : ['E2E_SELLER_PRIVATE_KEYS']),
  ...(hasLiveWalletEnv('buyer') ? [] : ['E2E_BUYER_PRIVATE_KEYS']),
];
const describeLive = missingEnv.length === 0 ? describe.sequential : describe.skip;
const ONE_WEI_ETH = '0.000000000000000001';
const alternateRecipient = '0x000000000000000000000000000000000000dead' as Address;
const rareApiIndexTimeoutMs = Number.parseInt(process.env.E2E_RARE_API_INDEX_TIMEOUT_MS ?? '180000', 10);
const rareApiIndexPollMs = Number.parseInt(process.env.E2E_RARE_API_INDEX_POLL_MS ?? '5000', 10);

type DeployErc1155Result = TxResult & {
  contract: Address;
  factory: Address;
  defaultMinter: Address;
};

type CreateTokenResult = TxResult & {
  contract: Address;
  tokenId: string;
  maxSupply: string;
  tokenUri: string;
};

type MintResult = TxResult & {
  contract: Address;
  tokenId: string;
  quantity: string;
  to: Address;
};

type MintBatchResult = TxResult & {
  contract: Address;
  to: Address;
  items: Array<{ tokenId: string; quantity: string }>;
};

type CollectionStatus = {
  contract: Address;
  account?: Address;
  accountApprovedMinter?: boolean;
  token?: {
    tokenId: string;
    maxSupply?: string;
    totalMinted?: string;
    accountBalance?: string;
    uri?: string;
  };
};

type ReleaseConfigureResult = TxResult & {
  contract: Address;
  tokenId: string;
  price: string;
  maxMints: string;
  approvalTxHash?: string | null;
};

type ReleaseMintResult = TxResult & {
  contract: Address;
  tokenId: string;
  quantity: string;
  requiredPayment: string;
};

type ListingCreateResult = TxResult & {
  approvalTxHash?: string | null;
};

type ListingBuyResult = TxResult & {
  buyer: Address;
  recipient: Address;
};

type CheckoutResult = TxResult & {
  summary: {
    payer: Address;
    recipient: Address;
    filledCount: string;
    skippedCount: string;
    ethSpent: string;
    ethRefunded: string;
  };
  items: Array<{
    status: 'filled' | 'skipped';
    kind: 'release' | 'listing' | 'unknown';
    tokenId: string;
    quantity?: string;
  }>;
};

type ListingStatus = {
  seller: Address;
  price: string;
  quantity: string;
  hasListing: boolean;
};

type OfferCreateResult = TxResult;

type OfferAcceptResult = TxResult & {
  approvalTxHash?: string | null;
};

type OfferStatus = {
  buyer: Address;
  quantity: string;
  hasOffer: boolean;
};

type AllowlistBuildResult = {
  value: {
    root: `0x${string}`;
    wallets: unknown[];
  };
  outputPath: string;
};

type AllowlistSetResult = TxResult & {
  config: {
    root: `0x${string}`;
    active: boolean;
  };
};

type LiveState = {
  sellerHome: string;
  buyerHome: string;
  sellerWallet: LiveWalletLease;
  buyerWallet: LiveWalletLease;
  sellerAddress: Address;
  buyerAddress: Address;
  chain: SupportedChain;
  contract: Address;
  tokenA: string;
  tokenB: string;
  tokenC: string;
};

let live: LiveState;

describeLive('live ERC1155 CLI writes', () => {
  beforeAll(async () => {
    const sellerHome = await createTempHome();
    const buyerHome = await createTempHome();
    const chain = await detectLiveChain();
    let sellerWallet: LiveWalletLease | undefined;
    let buyerWallet: LiveWalletLease | undefined;

    try {
      ({ sellerWallet, buyerWallet } = await reserveLiveWalletPair(chain));
      const reservedSellerWallet = sellerWallet;
      const reservedBuyerWallet = buyerWallet;
      await step('configure ERC1155 seller wallet', () => configureLiveHome(sellerHome, reservedSellerWallet.privateKey, chain));
      await step('configure ERC1155 buyer wallet', () => configureLiveHome(buyerHome, reservedBuyerWallet.privateKey, chain));

      const suffix = Date.now().toString().slice(-6);
      const deployed = await step('deploy ERC1155 collection', () =>
        jsonCommand<DeployErc1155Result>(sellerHome, [
          'collection',
          'deploy',
          'erc1155',
          `Rare CLI ERC1155 ${suffix}`,
          `R1155${suffix}`,
          '--base-uri',
          E2E_BATCH_BASE_URI,
          '--chain',
          chain,
        ], 240_000),
      );
      expectTx(deployed);
      expect(deployed.factory).toBe(getContractAddresses(chain).erc1155ContractFactory);

      const tokenA = await createToken(sellerHome, chain, deployed.contract, '20', E2E_TOKEN_URI);
      const tokenB = await createToken(sellerHome, chain, deployed.contract, '20', E2E_TOKEN_URI);
      const tokenC = await createToken(sellerHome, chain, deployed.contract, '20', E2E_TOKEN_URI);

      live = {
        sellerHome,
        buyerHome,
        sellerWallet: reservedSellerWallet,
        buyerWallet: reservedBuyerWallet,
        sellerAddress: reservedSellerWallet.address,
        buyerAddress: reservedBuyerWallet.address,
        chain,
        contract: deployed.contract,
        tokenA: tokenA.tokenId,
        tokenB: tokenB.tokenId,
        tokenC: tokenC.tokenId,
      };
    } catch (error) {
      await cleanupTempHome(sellerHome);
      await cleanupTempHome(buyerHome);
      await releaseLiveWallets([sellerWallet, buyerWallet]);
      throw error;
    }
  }, 900_000);

  afterAll(async () => {
    await cleanupTempHome(live?.sellerHome);
    await cleanupTempHome(live?.buyerHome);
    await releaseLiveWallets([live?.sellerWallet, live?.buyerWallet]);
  });

  it('creates token types, mints single and batch quantities, and sets minter approval', async () => {
    const sellerMint = await mintToken(live.sellerHome, live.chain, live.contract, live.tokenA, '8', live.sellerAddress);
    const buyerMint = await mintToken(live.sellerHome, live.chain, live.contract, live.tokenA, '2', live.buyerAddress);
    expectTx(sellerMint);
    expectTx(buyerMint);
    expect(sellerMint.to.toLowerCase()).toBe(live.sellerAddress.toLowerCase());
    expect(buyerMint.to.toLowerCase()).toBe(live.buyerAddress.toLowerCase());
    const indexedNft = await expectRareApiNftSearchResult(live.tokenA, live.sellerAddress);
    expect(indexedNft.type).toBe('ERC1155');
    expect(indexedNft.contractAddress.toLowerCase()).toBe(live.contract.toLowerCase());
    expect(indexedNft.tokenId).toBe(live.tokenA);

    const batchInput = join(live.sellerHome, 'erc1155-mint-batch.json');
    await writeFile(batchInput, JSON.stringify([
      { tokenId: live.tokenA, quantity: '1' },
      { tokenId: live.tokenB, quantity: '1' },
    ]), 'utf8');
    const batchMint = await step('batch mint ERC1155 quantities', () =>
      jsonCommand<MintBatchResult>(live.sellerHome, [
        'collection',
        'erc1155',
        'mint-batch',
        '--contract',
        live.contract,
        '--input',
        batchInput,
        '--to',
        live.sellerAddress,
        '--chain',
        live.chain,
      ], 240_000),
    );
    expectTx(batchMint);
    expect(batchMint.items.map((item) => item.tokenId)).toEqual([live.tokenA, live.tokenB]);

    const approval = await step('approve ERC1155 marketplace as minter', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'collection',
        'erc1155',
        'minter',
        'set',
        '--contract',
        live.contract,
        '--minter',
        getContractAddresses(live.chain).erc1155Marketplace!,
        '--approved',
        'true',
        '--chain',
        live.chain,
      ], 240_000),
    );
    expectTx(approval);

    const sellerStatus = await readCollectionStatus(live.sellerHome, live.tokenA, live.sellerAddress);
    const buyerStatus = await readCollectionStatus(live.buyerHome, live.tokenA, live.buyerAddress);
    expect(sellerStatus.accountApprovedMinter).toBe(false);
    expect(sellerStatus.token?.accountBalance).toBe('9');
    expect(sellerStatus.token?.totalMinted).toBe('11');
    expect(sellerStatus.token?.uri).toBe(E2E_TOKEN_URI);
    expect(buyerStatus.token?.accountBalance).toBe('2');
  }, 900_000);

  it('configures releases, mints public and allowlisted quantities, and reads counters', async () => {
    const configured = await step('configure ERC1155 direct sale release', () =>
      jsonCommand<ReleaseConfigureResult>(live.sellerHome, [
        'listing',
        'erc1155',
        'release',
        'configure',
        '--contract',
        live.contract,
        '--token-id',
        live.tokenB,
        '--price',
        ONE_WEI_ETH,
        '--max-mints',
        '3',
        '--split',
        `${live.sellerAddress}=100`,
        '--chain',
        live.chain,
      ], 240_000),
    );
    expectTx(configured);
    expect(configured.tokenId).toBe(live.tokenB);

    const minted = await step('mint ERC1155 direct sale release', () =>
      jsonCommand<ReleaseMintResult>(live.buyerHome, [
        'listing',
        'erc1155',
        'release',
        'mint',
        '--contract',
        live.contract,
        '--token-id',
        live.tokenB,
        '--quantity',
        '2',
        '--price',
        ONE_WEI_ETH,
        '--chain',
        live.chain,
      ], 240_000),
    );
    expectTx(minted);
    expect(minted.quantity).toBe('2');
    expect(BigInt(minted.requiredPayment) >= 2n).toBe(true);

    const allowlistInput = join(live.sellerHome, 'erc1155-allowlist.csv');
    const allowlistArtifact = join(live.sellerHome, 'erc1155-allowlist.json');
    const proofPath = join(live.buyerHome, 'erc1155-proof.json');
    await writeFile(allowlistInput, `wallet\n${live.buyerAddress}\n`, 'utf8');
    const built = await step('build ERC1155 release allowlist artifact', () =>
      jsonCommand<AllowlistBuildResult>(live.sellerHome, [
        'listing',
        'erc1155',
        'release',
        'allowlist',
        'build',
        '--input',
        allowlistInput,
        '--output',
        allowlistArtifact,
      ]),
    );
    expect(built.value.wallets).toHaveLength(1);
    const allowlistedConfigured = await step('configure allowlisted ERC1155 direct sale release', () =>
      jsonCommand<ReleaseConfigureResult>(live.sellerHome, [
        'listing',
        'erc1155',
        'release',
        'configure',
        '--contract',
        live.contract,
        '--token-id',
        live.tokenC,
        '--price',
        ONE_WEI_ETH,
        '--max-mints',
        '2',
        '--split',
        `${live.sellerAddress}=100`,
        '--chain',
        live.chain,
      ], 240_000),
    );
    expectTx(allowlistedConfigured);

    const allowlistSet = await step('set ERC1155 release allowlist', () =>
      jsonCommand<AllowlistSetResult>(live.sellerHome, [
        'listing',
        'erc1155',
        'release',
        'allowlist',
        'set',
        '--contract',
        live.contract,
        '--token-id',
        live.tokenC,
        '--input',
        allowlistArtifact,
        '--end-time',
        String(Math.floor(Date.now() / 1000) + 86_400),
        '--chain',
        live.chain,
      ], 240_000),
    );
    expectTx(allowlistSet);
    expect(allowlistSet.config.root).toBe(built.value.root);

    const proofJson = await jsonCommand<unknown>(live.buyerHome, [
      'listing',
      'erc1155',
      'release',
      'allowlist',
      'proof',
      '--input',
      allowlistArtifact,
      '--account',
      live.buyerAddress,
    ]);
    await writeFile(proofPath, `${JSON.stringify(proofJson)}\n`, 'utf8');

    const allowlistedMint = await step('mint allowlisted ERC1155 direct sale release', () =>
      jsonCommand<ReleaseMintResult>(live.buyerHome, [
        'listing',
        'erc1155',
        'release',
        'mint',
        '--contract',
        live.contract,
        '--token-id',
        live.tokenC,
        '--quantity',
        '1',
        '--price',
        ONE_WEI_ETH,
        '--proof',
        proofPath,
        '--chain',
        live.chain,
      ], 240_000),
    );
    expectTx(allowlistedMint);

    const tokenBStatus = await readCollectionStatus(live.buyerHome, live.tokenB, live.buyerAddress);
    const tokenCStatus = await readCollectionStatus(live.buyerHome, live.tokenC, live.buyerAddress);
    expect(tokenBStatus.token?.accountBalance).toBe('2');
    expect(tokenBStatus.token?.uri).toBe(E2E_TOKEN_URI);
    expect(tokenCStatus.token?.accountBalance).toBe('1');
    expect(tokenCStatus.token?.uri).toBe(E2E_TOKEN_URI);
  }, 1_200_000);

  it('checks out an ERC1155 release item and listing item together', async () => {
    const listing = await step('create ERC1155 listing for checkout', () =>
      jsonCommand<ListingCreateResult>(live.sellerHome, [
        'listing',
        'erc1155',
        'create',
        '--contract',
        live.contract,
        '--token-id',
        live.tokenA,
        '--quantity',
        '2',
        '--price',
        ONE_WEI_ETH,
        '--split',
        `${live.sellerAddress}=100`,
        '--chain',
        live.chain,
      ], 240_000),
    );
    expectTx(listing);

    const checkoutInput = join(live.buyerHome, 'erc1155-checkout.json');
    await writeFile(checkoutInput, JSON.stringify({
      items: [
        {
          kind: 'release',
          contract: live.contract,
          tokenId: live.tokenB,
          quantity: '1',
          price: ONE_WEI_ETH,
          currency: 'eth',
        },
        {
          kind: 'listing',
          contract: live.contract,
          seller: live.sellerAddress,
          tokenId: live.tokenA,
          quantity: '1',
          price: ONE_WEI_ETH,
          currency: 'eth',
        },
      ],
    }), 'utf8');

    const checkout = await step('checkout ERC1155 mixed cart', () =>
      jsonCommand<CheckoutResult>(live.buyerHome, [
        'listing',
        'erc1155',
        'checkout',
        '--input',
        checkoutInput,
        '--recipient',
        alternateRecipient,
        '--chain',
        live.chain,
      ], 240_000),
    );
    expectTx(checkout);
    expect(checkout.summary.payer.toLowerCase()).toBe(live.buyerAddress.toLowerCase());
    expect(checkout.summary.recipient.toLowerCase()).toBe(alternateRecipient.toLowerCase());
    expect(checkout.summary.filledCount).toBe('2');
    expect(checkout.summary.skippedCount).toBe('0');
    expect(checkout.items.map((item) => item.status)).toEqual(['filled', 'filled']);
    expect(checkout.items.map((item) => item.kind)).toEqual(['release', 'listing']);

    const tokenAStatus = await readCollectionStatus(live.buyerHome, live.tokenA, live.buyerAddress);
    const tokenBStatus = await readCollectionStatus(live.buyerHome, live.tokenB, live.buyerAddress);
    const recipientTokenAStatus = await readCollectionStatus(live.buyerHome, live.tokenA, alternateRecipient);
    const recipientTokenBStatus = await readCollectionStatus(live.buyerHome, live.tokenB, alternateRecipient);
    expect(tokenAStatus.token?.accountBalance).toBe('2');
    expect(tokenBStatus.token?.accountBalance).toBe('2');
    expect(recipientTokenAStatus.token?.accountBalance).toBe('1');
    expect(recipientTokenBStatus.token?.accountBalance).toBe('1');
    expect((await readListingStatus()).quantity).toBe('1');

    const cancelled = await step('cancel remaining checkout ERC1155 listing', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'listing',
        'erc1155',
        'cancel',
        '--contract',
        live.contract,
        '--token-id',
        live.tokenA,
        '--chain',
        live.chain,
      ], 240_000),
    );
    expectTx(cancelled);
    expect((await readListingStatus()).hasListing).toBe(false);
  }, 900_000);

  it('creates, buys, and cancels ERC1155 secondary listings', async () => {
    const created = await step('create ERC1155 listing', () =>
      jsonCommand<ListingCreateResult>(live.sellerHome, [
        'listing',
        'erc1155',
        'create',
        '--contract',
        live.contract,
        '--token-id',
        live.tokenA,
        '--quantity',
        '3',
        '--price',
        ONE_WEI_ETH,
        '--split',
        `${live.sellerAddress}=100`,
        '--chain',
        live.chain,
      ], 240_000),
    );
    expectTx(created);

    const purchased = await step('buy ERC1155 listing quantity', () =>
      jsonCommand<ListingBuyResult>(live.buyerHome, [
        'listing',
        'erc1155',
        'buy',
        '--contract',
        live.contract,
        '--token-id',
        live.tokenA,
        '--seller',
        live.sellerAddress,
        '--quantity',
        '1',
        '--price',
        ONE_WEI_ETH,
        '--recipient',
        live.buyerAddress,
        '--chain',
        live.chain,
      ], 240_000),
    );
    expectTx(purchased);
    expect(purchased.buyer.toLowerCase()).toBe(live.buyerAddress.toLowerCase());
    expect(purchased.recipient.toLowerCase()).toBe(live.buyerAddress.toLowerCase());

    const listingStatus = await readListingStatus();
    expect(listingStatus.hasListing).toBe(true);
    expect(listingStatus.quantity).toBe('2');
    const buyerTokenAStatus = await readCollectionStatus(live.buyerHome, live.tokenA, live.buyerAddress);
    expect(buyerTokenAStatus.token?.accountBalance).toBe('3');

    const cancelled = await step('cancel ERC1155 listing', () =>
      jsonCommand<TxResult>(live.sellerHome, [
        'listing',
        'erc1155',
        'cancel',
        '--contract',
        live.contract,
        '--token-id',
        live.tokenA,
        '--chain',
        live.chain,
      ], 240_000),
    );
    expectTx(cancelled);
    expect((await readListingStatus()).hasListing).toBe(false);
  }, 900_000);

  it('creates, accepts, and cancels ERC1155 offers', async () => {
    const created = await step('create ERC1155 offer', () =>
      jsonCommand<OfferCreateResult>(live.buyerHome, [
        'offer',
        'erc1155',
        'create',
        '--contract',
        live.contract,
        '--token-id',
        live.tokenA,
        '--quantity',
        '2',
        '--price',
        ONE_WEI_ETH,
        '--expiration-time',
        String(Math.floor(Date.now() / 1000) + 86_400),
        '--chain',
        live.chain,
      ], 240_000),
    );
    expectTx(created);

    const accepted = await step('accept ERC1155 offer quantity', () =>
      jsonCommand<OfferAcceptResult>(live.sellerHome, [
        'offer',
        'erc1155',
        'accept',
        '--contract',
        live.contract,
        '--token-id',
        live.tokenA,
        '--buyer',
        live.buyerAddress,
        '--quantity',
        '1',
        '--price',
        ONE_WEI_ETH,
        '--split',
        `${live.sellerAddress}=100`,
        '--chain',
        live.chain,
      ], 240_000),
    );
    expectTx(accepted);

    const offerStatus = await readOfferStatus();
    expect(offerStatus.hasOffer).toBe(true);
    expect(offerStatus.quantity).toBe('1');

    const cancelled = await step('cancel remaining ERC1155 offer', () =>
      jsonCommand<TxResult>(live.buyerHome, [
        'offer',
        'erc1155',
        'cancel',
        '--contract',
        live.contract,
        '--token-id',
        live.tokenA,
        '--chain',
        live.chain,
      ], 240_000),
    );
    expectTx(cancelled);
    expect((await readOfferStatus()).hasOffer).toBe(false);
  }, 900_000);
});

async function createToken(
  home: string,
  chain: SupportedChain,
  contract: Address,
  maxSupply: string,
  tokenUri: string,
): Promise<CreateTokenResult> {
  return step(`create ERC1155 token ${tokenUri}`, () =>
    jsonCommand<CreateTokenResult>(home, [
      'collection',
      'erc1155',
      'create-token',
      '--contract',
      contract,
      '--max-supply',
      maxSupply,
      '--token-uri',
      tokenUri,
      '--chain',
      chain,
    ], 240_000),
  );
}

async function mintToken(
  home: string,
  chain: SupportedChain,
  contract: Address,
  tokenId: string,
  quantity: string,
  to: Address,
): Promise<MintResult> {
  return step(`mint ERC1155 token ${tokenId}`, () =>
    jsonCommand<MintResult>(home, [
      'collection',
      'erc1155',
      'mint',
      '--contract',
      contract,
      '--token-id',
      tokenId,
      '--quantity',
      quantity,
      '--to',
      to,
      '--chain',
      chain,
    ], 240_000),
  );
}

async function expectRareApiNftSearchResult(tokenId: string, owner: Address): Promise<Nft> {
  const rare = createRareClient({ publicClient: getPublicClient(live.chain) });
  const chainId = chainIds[live.chain];
  const contract = live.contract;
  const deadline = Date.now() + normalizedRareApiIndexTimeoutMs();
  let lastResult: Nft[] = [];

  while (Date.now() <= deadline) {
    const result = await rare.search.nfts({
      contractAddress: contract,
      ownerAddress: owner,
      perPage: 50,
      page: 1,
    });
    lastResult = result.data;
    const nft = result.data.find((entry) =>
      entry.tokenId === tokenId &&
      entry.contractAddress.toLowerCase() === contract.toLowerCase() &&
      entry.chainId === String(chainId) &&
      nftOwnedBy(entry, owner));
    if (nft !== undefined) {
      return nft;
    }
    await sleep(normalizedRareApiIndexPollMs());
  }

  throw new Error(
    `Rare API did not index ERC1155 token ${contract}/${tokenId} for owner ${owner} within ` +
      `${normalizedRareApiIndexTimeoutMs().toString()}ms. Last result token IDs: ${lastResult.map((entry) => entry.tokenId).join(', ') || 'none'}.`,
  );
}

function nftOwnedBy(nft: Nft, owner: Address): boolean {
  const normalizedOwner = owner.toLowerCase();
  return nft.owner.address.toLowerCase() === normalizedOwner ||
    (nft.owners ?? []).some((entry) => entry.address.toLowerCase() === normalizedOwner && BigInt(entry.balance) > 0n);
}

function normalizedRareApiIndexTimeoutMs(): number {
  return Number.isFinite(rareApiIndexTimeoutMs) && rareApiIndexTimeoutMs > 0 ? rareApiIndexTimeoutMs : 180_000;
}

function normalizedRareApiIndexPollMs(): number {
  return Number.isFinite(rareApiIndexPollMs) && rareApiIndexPollMs > 0 ? rareApiIndexPollMs : 5_000;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readCollectionStatus(home: string, tokenId: string, account: Address): Promise<CollectionStatus> {
  return jsonCommand<CollectionStatus>(home, [
    'collection',
    'erc1155',
    'status',
    '--contract',
    live.contract,
    '--token-id',
    tokenId,
    '--account',
    account,
    '--chain',
    live.chain,
  ]);
}

async function readListingStatus(): Promise<ListingStatus> {
  return jsonCommand<ListingStatus>(live.sellerHome, [
    'listing',
    'erc1155',
    'status',
    '--contract',
    live.contract,
    '--token-id',
    live.tokenA,
    '--seller',
    live.sellerAddress,
    '--chain',
    live.chain,
  ]);
}

async function readOfferStatus(): Promise<OfferStatus> {
  return jsonCommand<OfferStatus>(live.buyerHome, [
    'offer',
    'erc1155',
    'status',
    '--contract',
    live.contract,
    '--token-id',
    live.tokenA,
    '--buyer',
    live.buyerAddress,
    '--chain',
    live.chain,
  ]);
}
