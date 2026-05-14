import { afterAll, beforeAll, expect, it } from 'vitest';
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
  readProtocolRoyaltyRegistry,
  readRoyaltyRegistryContractReceiver,
  type CollectionMetadataWriteResult,
  type CollectionMintBatchResult,
  type CollectionPrepareLazyMintResult,
  type CollectionRoyaltyRegistryContractReceiverResult,
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

  it('creates a standard Sovereign collection through the newer factory', async () => {
    const fixture = live.value;
    const suffix = Date.now().toString(36);
    const created = await step('create standard Sovereign collection', () =>
      jsonCommand<CreateSovereignResult>(fixture.sellerHome, [
        'collection',
        'create',
        'sovereign',
        `Rare CLI Sovereign E2E ${suffix}`,
        `RCS${suffix.slice(-4).toUpperCase()}`,
        '--max-tokens',
        '3',
        '--chain',
        fixture.chain,
      ]),
    );

    expectTx(created);
    expect(created.contract).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(created.factory).toBe(getContractAddresses(fixture.chain).sovereignFactory);
    expect(created.contractType).toBe('standard');

    const minted = await step('batch mint standard Sovereign collection', () =>
      jsonCommand<CollectionMintBatchResult>(fixture.sellerHome, [
        'collection',
        'mint-batch',
        '--contract',
        created.contract,
        '--base-uri',
        E2E_BATCH_BASE_URI,
        '--token-count',
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

    const creator = await step('read Sovereign token creator', () =>
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

    const registry = await readProtocolRoyaltyRegistry(fixture);
    const registryReceiver = await step('set royalty registry contract receiver', () =>
      jsonCommand<CollectionRoyaltyRegistryContractReceiverResult>(fixture.sellerHome, [
        'collection',
        'royalty',
        'registry',
        'set-contract-receiver',
        '--contract',
        created.contract,
        '--receiver',
        fixture.buyerAddress,
        '--chain',
        fixture.chain,
      ]),
    );

    expectTx(registryReceiver);
    expect(registryReceiver.registry.toLowerCase()).toBe(registry.toLowerCase());
    expect(registryReceiver.contract.toLowerCase()).toBe(created.contract.toLowerCase());
    expect(registryReceiver.receiver.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());

    const contractReceiver = await readRoyaltyRegistryContractReceiver(fixture, registry, created.contract);
    expect(contractReceiver.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());
  });

  it('creates a Lazy Sovereign release collection through the lazy factory', async () => {
    const fixture = live.value;
    const suffix = Date.now().toString(36);
    const created = await step('create Lazy Sovereign collection', () =>
      jsonCommand<CreateSovereignResult>(fixture.sellerHome, [
        'collection',
        'create',
        'lazy-sovereign',
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
        '--token-count',
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
