import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Address } from 'viem';
import { getContractAddresses } from '../../src/contracts/addresses.js';
import { describeLive, expectTx, jsonCommand, step, type TxResult } from './live-helpers.js';
import {
  cleanupLiveCliFixture,
  createLiveCliFixture,
  deployErc721Collection,
  E2E_BATCH_BASE_URI,
  E2E_LAZY_BASE_URI,
  E2E_LAZY_TOKEN_URI,
  E2E_LAZY_UPDATED_BASE_URI,
  expectTokenOwner,
  mintToken,
  readCollectionMetadata,
  readCollectionRoyalty,
  type CollectionMetadataWriteResult,
  type CollectionMintBatchResult,
  type CollectionPrepareLazyMintResult,
  type CollectionTokenCreatorResult,
  type CreateSovereignResult,
  type DeployResult,
  type MintResult,
  type LiveCliFixture,
  LiveCliFixtureRef,
} from './helpers/live-cli-fixture.js';

type CollectionFixture = LiveCliFixture & {
  collection: DeployResult;
  buyerMintToken: MintResult;
};

const live = new LiveCliFixtureRef<CollectionFixture>('Live collection CLI fixture has not been initialized.');
const statusFixtures = [
  {
    label: 'ERC-721 collection',
    contract: '0x3BBbEB163aD57c29BBA356B3d3456EacbD38DD0E',
    expectedName: 'Rare CLI User Test 1779449555',
    expectedSymbol: 'RCU9555',
    expectedMaxTokens: '80',
    expectsMintConfig: false,
    expectsBatchCount: true,
    expectsTokenOwner: true,
  },
  {
    label: 'Lazy ERC-721 collection',
    contract: '0xBFE00EDfAd8A8BcE2CBCaaE4B26D65FfBD411c27',
    expectedName: 'Rare CLI Lazy User Test 1779449555',
    expectedSymbol: 'RCL9555',
    expectedMaxTokens: '5',
    expectsMintConfig: true,
    expectsBatchCount: false,
    expectsTokenOwner: false,
  },
  {
    label: 'Lazy batch mint collection',
    contract: '0x408410b7cf8315e0e9705b4A744A1D4471b09449',
    expectedName: 'Rare CLI Lazy Batch User Test 1779449555',
    expectedSymbol: 'RLB9555',
    expectedMaxTokens: '5',
    expectsMintConfig: false,
    expectsBatchCount: true,
    expectsTokenOwner: false,
  },
] as const satisfies readonly CollectionStatusFixture[];

type CollectionStatusFixture = {
  label: string;
  contract: Address;
  expectedName: string;
  expectedSymbol: string;
  expectedMaxTokens: string;
  expectsMintConfig: boolean;
  expectsBatchCount: boolean;
  expectsTokenOwner: boolean;
};

type CollectionStatusResult = {
  chain: string;
  contract: Address;
  name?: string;
  symbol?: string;
  owner?: Address;
  totalSupply?: string;
  maxTokens?: string;
  disabled?: boolean;
  tokenUrisLocked?: boolean;
  batchCount?: string;
  defaultReceiver?: Address;
  defaultPercentage?: string;
  interfaces?: {
    erc165?: boolean;
    erc721?: boolean;
    erc721Metadata?: boolean;
    erc2981?: boolean;
  };
  mintConfig?: {
    tokenCount: string;
    baseUri: string;
    lockedMetadata: boolean;
  };
  token?: {
    tokenId: string;
    owner?: Address;
    tokenUri?: string;
    creator?: Address;
    royalty?: {
      salePrice: string;
      receiver: Address;
      amount: string;
    };
  };
};

describeLive('live collection CLI writes', () => {
  beforeAll(async () => {
    const fixture = await createLiveCliFixture();
    try {
      const collection = await deployErc721Collection(fixture, '6');
      live.set({
        ...fixture,
        collection,
        buyerMintToken: await step('mint token directly to buyer', () =>
          mintToken(fixture, collection.contract, { to: fixture.buyerAddress }),
        ),
      });
    } catch (error) {
      await cleanupLiveCliFixture(fixture);
      throw error;
    }
  });

  afterAll(async () => {
    await cleanupLiveCliFixture(live.optionalValue);
  });

  it('deploys collection and mints token fixtures on the TEST_RPC_URL chain', () => {
    const fixture = live.value;
    expectTx(fixture.collection);
    expect(fixture.collection.contract).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expectTx(fixture.buyerMintToken);
    expect(fixture.buyerMintToken.contract).toBe(fixture.collection.contract);
    expect(fixture.buyerMintToken.tokenId).toMatch(/^\d+$/);
  });

  it.each(statusFixtures)('reads best-effort status for a fixed Sepolia $label', async (statusFixture) => {
    const fixture = live.value;
    if (fixture.chain !== 'sepolia') {
      return;
    }

    const status = await step(`read fixed ${statusFixture.label} status`, () =>
      jsonCommand<CollectionStatusResult>(fixture.sellerHome, [
        'collection',
        'status',
        '--contract',
        statusFixture.contract,
        '--token-id',
        '1',
        '--chain',
        fixture.chain,
      ]),
    );

    expect(status.chain).toBe('sepolia');
    expect(status.contract.toLowerCase()).toBe(statusFixture.contract.toLowerCase());
    expect(status.name).toBe(statusFixture.expectedName);
    expect(status.symbol).toBe(statusFixture.expectedSymbol);
    expect(status.owner).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(status.totalSupply).toMatch(/^\d+$/);
    expect(status.maxTokens).toBe(statusFixture.expectedMaxTokens);
    expect(status.disabled).toBe(false);
    expect(status.defaultReceiver).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(status.defaultPercentage).toMatch(/^\d+$/);
    expect(status.interfaces).toMatchObject({
      erc165: true,
      erc721: true,
      erc721Metadata: true,
      erc2981: true,
    });
    expect(status.token).toMatchObject({
      tokenId: '1',
      creator: expect.stringMatching(/^0x[0-9a-fA-F]{40}$/),
      royalty: {
        salePrice: '10000',
        receiver: expect.stringMatching(/^0x[0-9a-fA-F]{40}$/),
        amount: expect.stringMatching(/^\d+$/),
      },
    });

    if (statusFixture.expectsMintConfig) {
      expect(status.mintConfig).toMatchObject({
        tokenCount: '2',
        baseUri: expect.stringContaining('ipfs://'),
        lockedMetadata: true,
      });
    } else {
      expect(status).not.toHaveProperty('mintConfig');
    }

    if (statusFixture.expectsBatchCount) {
      expect(status.batchCount).toMatch(/^\d+$/);
    } else {
      expect(status).not.toHaveProperty('batchCount');
    }

    if (statusFixture.expectsTokenOwner) {
      expect(status.token?.owner).toMatch(/^0x[0-9a-fA-F]{40}$/);
    } else {
      expect(status.token).not.toHaveProperty('owner');
    }
  });

  it('mints with a custom royalty receiver', async () => {
    const fixture = live.value;
    const minted = await step('mint token with custom royalty receiver', () =>
      mintToken(fixture, fixture.collection.contract, { royaltyReceiver: fixture.buyerAddress }),
    );

    const royalty = await readCollectionRoyalty(fixture, fixture.sellerHome, fixture.collection.contract, minted.tokenId);
    expect(royalty.receiver.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());
  });

  it('deploys an ERC-721 collection and batch mints through the active factory', async () => {
    const fixture = live.value;
    const suffix = Date.now().toString(36);
    const created = await step('deploy ERC-721 collection', () =>
      jsonCommand<DeployResult>(fixture.sellerHome, [
        'collection',
        'deploy',
        'erc721',
        `Rare CLI ERC721 E2E ${suffix}`,
        `RCS${suffix.slice(-4).toUpperCase()}`,
        '--max-tokens',
        '3',
        '--chain',
        fixture.chain,
      ]),
    );

    expectTx(created);
    expect(created.contract).toMatch(/^0x[0-9a-fA-F]{40}$/);

    const minted = await step('batch mint ERC-721 collection', () =>
      jsonCommand<CollectionMintBatchResult>(fixture.sellerHome, [
        'collection',
        'mint-batch',
        '--contract',
        created.contract,
        '--base-uri',
        E2E_BATCH_BASE_URI,
        '--amount',
        '2',
        '--chain',
        fixture.chain,
      ]),
    );

    expectTx(minted);
    expect(minted.contract).toBe(created.contract);
    expect(minted.baseUri).toBe(E2E_BATCH_BASE_URI);
    expect(minted.tokenCount).toBe('2');
    expect(minted.fromTokenId).toBe('1');
    expect(minted.toTokenId).toBe('2');
    expect(minted.owner.toLowerCase()).toBe(fixture.sellerAddress.toLowerCase());

    const creator = await step('read token creator', () =>
      jsonCommand<CollectionTokenCreatorResult>(fixture.sellerHome, [
        'collection',
        'creator',
        '--contract',
        created.contract,
        '--token-id',
        '1',
        '--chain',
        fixture.chain,
      ]),
    );
    expect(creator.contract.toLowerCase()).toBe(created.contract.toLowerCase());
    expect(creator.tokenId).toBe('1');
    expect(creator.creator.toLowerCase()).toBe(fixture.sellerAddress.toLowerCase());

    const initialRoyalty = await readCollectionRoyalty(fixture, fixture.sellerHome, created.contract, '1');
    expect(initialRoyalty.receiver.toLowerCase()).toBe(fixture.sellerAddress.toLowerCase());
    expect(initialRoyalty.defaultReceiver?.toLowerCase()).toBe(fixture.sellerAddress.toLowerCase());
    expect(initialRoyalty.defaultPercentage).toBe('10');
    expect(initialRoyalty.royaltyAmount).toBe('1000');

    expectTx(await step('set default royalty receiver', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'collection',
        'royalty',
        'set-default-receiver',
        '--contract',
        created.contract,
        '--receiver',
        fixture.buyerAddress,
        '--chain',
        fixture.chain,
      ]),
    ));

    const defaultReceiverRoyalty = await readCollectionRoyalty(fixture, fixture.sellerHome, created.contract, '1');
    expect(defaultReceiverRoyalty.receiver.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());
    expect(defaultReceiverRoyalty.defaultReceiver?.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());

    expectTx(await step('set token royalty receiver', () =>
      jsonCommand<TxResult>(fixture.sellerHome, [
        'collection',
        'royalty',
        'set-token-receiver',
        '--contract',
        created.contract,
        '--token-id',
        '1',
        '--receiver',
        fixture.sellerAddress,
        '--chain',
        fixture.chain,
      ]),
    ));

    const tokenReceiverRoyalty = await readCollectionRoyalty(fixture, fixture.sellerHome, created.contract, '1');
    expect(tokenReceiverRoyalty.receiver.toLowerCase()).toBe(fixture.sellerAddress.toLowerCase());
    expect(tokenReceiverRoyalty.defaultReceiver?.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());

    const percentageResult = await step('set default royalty percentage', () =>
      jsonCommand<TxResult & { contract: string; percentage: number }>(fixture.sellerHome, [
        'collection',
        'royalty',
        'set-default-percentage',
        '--contract',
        created.contract,
        '--percentage',
        '15',
        '--chain',
        fixture.chain,
      ]),
    );
    expectTx(percentageResult);
    expect(percentageResult.contract.toLowerCase()).toBe(created.contract.toLowerCase());
    expect(percentageResult.percentage).toBe(15);

    const percentageRoyalty = await readCollectionRoyalty(fixture, fixture.sellerHome, created.contract, '1');
    expect(percentageRoyalty.defaultPercentage).toBe('15');
    expect(percentageRoyalty.royaltyAmount).toBe('1500');
  });

  it('deploys a Lazy ERC-721 release collection through the lazy factory', async () => {
    const fixture = live.value;
    const suffix = Date.now().toString(36);
    const created = await step('deploy Lazy ERC-721 collection', () =>
      jsonCommand<CreateSovereignResult>(fixture.sellerHome, [
        'collection',
        'deploy',
        'lazy-erc721',
        `Rare CLI Lazy E2E ${suffix}`,
        `RCL${suffix.slice(-4).toUpperCase()}`,
        '--max-tokens',
        '3',
        '--chain',
        fixture.chain,
      ]),
    );

    expectTx(created);
    expect(created.contract).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(created.factory).toBe(getContractAddresses(fixture.chain).lazySovereignFactory);
    expect(created.contractType).toBe('lazy');
    expect(created.nextStep).toContain('Configure release sale and mint settings');

    const prepared = await step('prepare lazy mint batch', () =>
      jsonCommand<CollectionPrepareLazyMintResult>(fixture.sellerHome, [
        'collection',
        'prepare-lazy-mint',
        '--contract',
        created.contract,
        '--base-uri',
        E2E_LAZY_BASE_URI,
        '--amount',
        '2',
        '--minter',
        fixture.buyerAddress,
        '--chain',
        fixture.chain,
      ]),
    );

    expectTx(prepared);
    expect(prepared.contract).toBe(created.contract);
    expect(prepared.baseUri).toBe(E2E_LAZY_BASE_URI);
    expect(prepared.tokenCount).toBe('2');
    expect(prepared.minter?.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());

    const initialMetadata = await readCollectionMetadata(fixture, fixture.sellerHome, created.contract);
    expect(initialMetadata.baseUri).toBe(E2E_LAZY_BASE_URI);
    expect(initialMetadata.tokenCount).toBe('2');
    expect(initialMetadata.lockedMetadata).toBe(false);

    const updatedBase = await step('update lazy base URI', () =>
      jsonCommand<CollectionMetadataWriteResult>(fixture.sellerHome, [
        'collection',
        'metadata',
        'update-base-uri',
        '--contract',
        created.contract,
        '--base-uri',
        E2E_LAZY_UPDATED_BASE_URI,
        '--chain',
        fixture.chain,
      ]),
    );
    expectTx(updatedBase);
    expect(updatedBase.baseUri).toBe(E2E_LAZY_UPDATED_BASE_URI);

    const updatedToken = await step('update lazy token URI', () =>
      jsonCommand<CollectionMetadataWriteResult>(fixture.sellerHome, [
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
        fixture.chain,
      ]),
    );
    expectTx(updatedToken);
    expect(updatedToken.tokenId).toBe('1');
    expect(updatedToken.tokenUri).toBe(E2E_LAZY_TOKEN_URI);

    const locked = await step('lock lazy base URI', () =>
      jsonCommand<CollectionMetadataWriteResult>(fixture.sellerHome, [
        'collection',
        'metadata',
        'lock-base-uri',
        '--contract',
        created.contract,
        '--chain',
        fixture.chain,
      ]),
    );
    expectTx(locked);
    expect(locked.baseUri).toBe(E2E_LAZY_UPDATED_BASE_URI);

    const lockedMetadata = await readCollectionMetadata(fixture, fixture.sellerHome, created.contract);
    expect(lockedMetadata.baseUri).toBe(E2E_LAZY_UPDATED_BASE_URI);
    expect(lockedMetadata.lockedMetadata).toBe(true);
  });

  it('deploys a Lazy ERC-721 royalty-guard collection type', async () => {
    const fixture = live.value;
    const suffix = Date.now().toString(36);
    const created = await step('deploy Lazy ERC-721 royalty-guard collection', () =>
      jsonCommand<CreateSovereignResult>(fixture.sellerHome, [
        'collection',
        'deploy',
        'lazy-erc721',
        `Rare CLI Lazy Guard E2E ${suffix}`,
        `RCG${suffix.slice(-4).toUpperCase()}`,
        '--max-tokens',
        '2',
        '--contract-type',
        'lazy-royalty-guard',
        '--chain',
        fixture.chain,
      ]),
    );

    expectTx(created);
    expect(created.contract).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(created.factory).toBe(getContractAddresses(fixture.chain).lazySovereignFactory);
    expect(created.contractType).toBe('lazy-royalty-guard');
  });

  it('mints directly to another recipient', async () => {
    const fixture = live.value;
    await expectTokenOwner(
      fixture,
      fixture.sellerHome,
      fixture.collection.contract,
      fixture.buyerMintToken.tokenId,
      fixture.buyerAddress,
    );
  });
});
