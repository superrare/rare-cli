import { expect } from 'vitest';
import type { Address, PublicClient } from 'viem';
import { royaltyRegistryAbi, royaltyRegistryResolverAbi } from '../../../src/contracts/abis/royalty-registry.js';
import { getContractAddresses, type SupportedChain } from '../../../src/contracts/addresses.js';
import {
  cleanupTempHome,
  configureLiveHome,
  createLivePublicClient,
  createTempHome,
  detectLiveChain,
  expectTx,
  jsonCommand,
  step,
  type TxResult,
} from '../live-helpers.js';
import { releaseLiveWallets, reserveLiveWalletPair, type LiveWalletLease } from './live-wallet-pool.js';

export const E2E_TOKEN_URI = 'ipfs://bafybeidznwopf6bnfakqbertnhohgh65usqlo7bhnehycurg4xmc5ebnm4/metadata.json';
export const E2E_BATCH_BASE_URI = 'ipfs://bafybeidznwopf6bnfakqbertnhohgh65usqlo7bhnehycurg4xmc5ebnm4/batch';
export const E2E_LAZY_BASE_URI = 'ipfs://bafybeidznwopf6bnfakqbertnhohgh65usqlo7bhnehycurg4xmc5ebnm4/lazy';
export const E2E_LAZY_UPDATED_BASE_URI = 'ipfs://bafybeidznwopf6bnfakqbertnhohgh65usqlo7bhnehycurg4xmc5ebnm4/lazy-updated';
export const E2E_LAZY_TOKEN_URI = 'ipfs://bafybeidznwopf6bnfakqbertnhohgh65usqlo7bhnehycurg4xmc5ebnm4/lazy-token-1.json';

export type DeployResult = {
  txHash: string;
  blockNumber: string;
  contract: Address;
};

export type CreateSovereignResult = {
  txHash: string;
  blockNumber: string;
  contract: Address;
  factory: Address;
  contractType: string;
  nextStep?: string;
};

export type CollectionMintBatchResult = {
  txHash: string;
  blockNumber: string;
  contract: Address;
  baseUri: string;
  tokenCount: string;
  fromTokenId: string;
  toTokenId: string;
  owner: Address;
};

export type CollectionPrepareLazyMintResult = {
  txHash: string;
  blockNumber: string;
  contract: Address;
  baseUri: string;
  tokenCount: string;
  fromTokenId?: string;
  toTokenId?: string;
  minter?: Address;
};

export type CollectionTokenCreatorResult = {
  chain: string;
  contract: Address;
  tokenId: string;
  creator: Address;
};

export type CollectionRoyaltyInfoResult = {
  chain: string;
  contract: Address;
  tokenId: string;
  salePrice: string;
  receiver: Address;
  royaltyAmount: string;
  defaultReceiver?: Address;
  defaultPercentage?: string;
};

export type CollectionRoyaltyRegistryStatusResult = {
  chain: string;
  registry: Address;
  contract: Address;
  tokenId: string;
  salePrice: string;
  creatorRegistry: Address;
  receiver: Address;
  royaltyPercentage: number;
  royaltyAmount: string;
  configuredContractPercentage?: number;
  contractReceiver?: Address;
  tokenReceiver?: Address;
};

export type CollectionRoyaltyRegistryReceiverOverrideResult = {
  registry: Address;
  receiver: Address;
} & TxResult

export type CollectionRoyaltyRegistryContractReceiverResult = {
  registry: Address;
  contract: Address;
  receiver: Address;
} & TxResult

export type CollectionMetadataStatusResult = {
  chain: string;
  contract: Address;
  baseUri: string;
  tokenCount: string;
  lockedMetadata: boolean;
};

export type CollectionMetadataWriteResult = {
  txHash: string;
  blockNumber: string;
  contract: Address;
  baseUri?: string;
  tokenId?: string;
  tokenUri?: string;
};

export type MintResult = {
  txHash: string;
  blockNumber: string;
  tokenId: string;
  contract: Address;
  tokenUri: string;
};

export type LiveCliFixture = {
  sellerHome: string;
  buyerHome: string;
  sellerAddress: Address;
  buyerAddress: Address;
  sellerWallet: LiveWalletLease;
  buyerWallet: LiveWalletLease;
  chain: SupportedChain;
  publicClient: PublicClient;
};

export class LiveCliFixtureRef<TFixture> {
  #value: TFixture | undefined;

  constructor(private readonly errorMessage: string) {}

  get value(): TFixture {
    if (!this.#value) {
      throw new Error(this.errorMessage);
    }

    return this.#value;
  }

  get optionalValue(): TFixture | undefined {
    return this.#value;
  }

  set(value: TFixture): void {
    this.#value = value;
  }
}

export async function createLiveCliFixture(): Promise<LiveCliFixture> {
  const sellerHome = await createTempHome();
  const buyerHome = await createTempHome();
  const chain = await detectLiveChain();
  let sellerWallet: LiveWalletLease | undefined;
  let buyerWallet: LiveWalletLease | undefined;

  try {
    ({ sellerWallet, buyerWallet } = await reserveLiveWalletPair(chain));
    await step(`configure seller wallet on ${chain}`, () =>
      configureLiveHome(sellerHome, sellerWallet.privateKey, chain),
    );
    await step(`configure buyer wallet on ${chain}`, () =>
      configureLiveHome(buyerHome, buyerWallet.privateKey, chain),
    );

    return {
      sellerHome,
      buyerHome,
      sellerAddress: sellerWallet.address,
      buyerAddress: buyerWallet.address,
      sellerWallet,
      buyerWallet,
      chain,
      publicClient: createLivePublicClient(chain),
    };
  } catch (error) {
    await cleanupLiveCliFixture({ sellerHome, buyerHome, sellerWallet, buyerWallet });
    throw error;
  }
}

export async function cleanupLiveCliFixture(
  fixture: Pick<LiveCliFixture, 'sellerHome' | 'buyerHome'> & Partial<Pick<LiveCliFixture, 'sellerWallet' | 'buyerWallet'>> | undefined,
): Promise<void> {
  await cleanupTempHome(fixture?.sellerHome);
  await cleanupTempHome(fixture?.buyerHome);
  await releaseLiveWallets([fixture?.sellerWallet, fixture?.buyerWallet]);
}

export async function deployErc721Collection(
  fixture: LiveCliFixture,
  maxTokens: string,
): Promise<DeployResult> {
  const suffix = Date.now().toString(36);
  const collection = await step(`deploy ERC-721 collection on ${fixture.chain}`, () =>
    jsonCommand<DeployResult>(fixture.sellerHome, [
      'collection',
      'deploy',
      'erc721',
      `Rare CLI E2E ${suffix}`,
      `RCE${suffix.slice(-4).toUpperCase()}`,
      '--max-tokens',
      maxTokens,
      '--chain',
      fixture.chain,
    ]),
  );

  expectTx(collection);
  expect(collection.contract).toMatch(/^0x[0-9a-fA-F]{40}$/);
  return collection;
}

export async function mintToken(
  fixture: LiveCliFixture,
  contract: Address,
  opts: { to?: Address } = {},
): Promise<MintResult> {
  const baseArgs = [
    'collection',
    'mint',
    '--contract',
    contract,
    '--token-uri',
    E2E_TOKEN_URI,
    '--chain',
    fixture.chain,
  ];
  const args = opts.to ? [...baseArgs, '--to', opts.to] : baseArgs;

  const result = await jsonCommand<MintResult>(fixture.sellerHome, args, 300_000);

  expectTx(result);
  expect(result.contract).toBe(contract);
  expect(result.tokenUri).toBe(E2E_TOKEN_URI);
  expect(result.tokenId).toMatch(/^\d+$/);
  return result;
}

export async function expectAuctionStatus(
  fixture: LiveCliFixture,
  home: string,
  contract: Address,
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
    fixture.chain,
  ]);
  expect(status.status).toBe(expectedStatus);
}

export async function readCollectionRoyalty(
  fixture: LiveCliFixture,
  home: string,
  contract: Address,
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
    fixture.chain,
  ]);
}

export async function readProtocolRoyaltyRegistry(fixture: LiveCliFixture): Promise<Address> {
  const auction = getContractAddresses(fixture.chain).auction;
  return fixture.publicClient.readContract({
    address: auction,
    abi: royaltyRegistryResolverAbi,
    functionName: 'royaltyRegistry',
  });
}

export async function readRoyaltyRegistryReceiverOverride(
  fixture: LiveCliFixture,
  registry: Address,
  wallet: Address,
): Promise<Address> {
  return fixture.publicClient.readContract({
    address: registry,
    abi: royaltyRegistryAbi,
    functionName: 'royaltyReceiverOverride',
    args: [wallet],
  });
}

export async function readRoyaltyRegistryContractReceiver(
  fixture: LiveCliFixture,
  registry: Address,
  contract: Address,
): Promise<Address> {
  return fixture.publicClient.readContract({
    address: registry,
    abi: royaltyRegistryAbi,
    functionName: 'contractRoyaltyReceiver',
    args: [contract],
  });
}

export async function readCollectionMetadata(
  fixture: LiveCliFixture,
  home: string,
  contract: Address,
): Promise<CollectionMetadataStatusResult> {
  return jsonCommand<CollectionMetadataStatusResult>(home, [
    'collection',
    'metadata',
    'status',
    '--contract',
    contract,
    '--chain',
    fixture.chain,
  ]);
}

export async function expectTokenOwner(
  fixture: LiveCliFixture,
  home: string,
  contract: Address,
  tokenId: string,
  owner: Address,
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
    fixture.chain,
  ]);

  const token = status.token;
  expect(token).not.toBeNull();
  if (!token) {
    throw new Error('Expected token status response to include token details.');
  }
  expect(token.owner.toLowerCase()).toBe(owner.toLowerCase());
  expect(token.tokenUri).toBe(E2E_TOKEN_URI);
}

export function liveAuctionDurationSeconds(): number {
  return Number.parseInt(process.env.E2E_AUCTION_DURATION_SECONDS ?? '60', 10);
}

export async function waitForAuctionToEnd(): Promise<void> {
  const duration = liveAuctionDurationSeconds();
  await new Promise((resolve) => setTimeout(resolve, (duration + 10) * 1000));
}
