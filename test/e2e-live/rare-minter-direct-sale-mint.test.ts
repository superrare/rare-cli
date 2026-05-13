import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWalletClient, http, zeroAddress, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getContractAddresses, viemChains, type SupportedChain } from '../../src/contracts/addresses.js';
import {
  cleanupTempHome,
  configureLiveHome,
  createLivePublicClient,
  createTempHome,
  detectLiveChain,
  expectTx,
  jsonCommand,
  livePrivateKey,
  liveRpcUrl,
  retryNonceConflict,
  step,
  withLiveTransactionLock,
  type TxResult,
} from './live-helpers.js';

const requiredEnv = [
  'TEST_RPC_URL',
  'E2E_SELLER_PRIVATE_KEY',
  'E2E_BUYER_PRIVATE_KEY',
] as const;

const missingEnv = requiredEnv.filter((name) => !process.env[name]);
const describeLive = missingEnv.length === 0 ? describe.sequential : describe.skip;

// Runtime dispatches owner() and mintTo(address). Creation code injects the seller as owner.
const releaseFixtureRuntimePrefix = '60003560e01c80638da5cb5b14601f578063755edd1714603d5760006000fd5b73';
const releaseFixtureRuntimeSuffix = '60005260206000f35b600160005260206000f3';

type ReleaseConfigureResult = TxResult & {
  rareMinter: Address;
  contract: Address;
  currencyAddress: Address;
  price: string;
  maxMints: string;
};

type ReleaseMintDirectSaleResult = TxResult & {
  rareMinter: Address;
  contract: Address;
  buyer: Address;
  recipient: Address;
  quantity: number;
  currencyAddress: Address;
  price: string;
  totalPrice: string;
  requiredPayment: string;
  allowlistRequired: boolean;
  tokenIdStart: string;
  tokenIdEnd: string;
  tokenIds: string[];
};

type LiveState = {
  sellerHome: string;
  buyerHome: string;
  sellerAddress: Address;
  buyerAddress: Address;
  releaseContract: Address;
  chain: SupportedChain;
};

let live: LiveState;

describeLive('live RareMinter direct sale release mint', () => {
  beforeAll(async () => {
    const sellerHome = await createTempHome();
    const buyerHome = await createTempHome();
    const chain = await detectLiveChain();
    const sellerAddress = privateKeyToAccount(livePrivateKey('E2E_SELLER_PRIVATE_KEY')).address;
    const buyerAddress = privateKeyToAccount(livePrivateKey('E2E_BUYER_PRIVATE_KEY')).address;

    try {
      await step('configure seller wallet for direct sale release', () =>
        configureLiveHome(sellerHome, livePrivateKey('E2E_SELLER_PRIVATE_KEY'), chain),
      );
      await step('configure buyer wallet for direct sale release', () =>
        configureLiveHome(buyerHome, livePrivateKey('E2E_BUYER_PRIVATE_KEY'), chain),
      );
      const releaseContract = await step('deploy RareMinter direct sale fixture contract', () =>
        deployReleaseFixtureContract(chain, livePrivateKey('E2E_SELLER_PRIVATE_KEY'), sellerAddress),
      );

      live = {
        sellerHome,
        buyerHome,
        sellerAddress,
        buyerAddress,
        releaseContract,
        chain,
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

  it('mints a configured zero-price direct sale release', async () => {
    const contract = live.releaseContract;
    const rareMinter = getContractAddresses(live.chain).rareMinter!;

    const configured = await step('configure zero-price direct sale release', () =>
      jsonCommand<ReleaseConfigureResult>(live.sellerHome, [
        'listing',
        'release',
        'configure',
        '--contract',
        contract,
        '--price',
        '0',
        '--max-mints',
        '2',
        '--split',
        `${live.sellerAddress}=100`,
        '--chain',
        live.chain,
      ], 240_000),
    );

    expectTx(configured);
    expect(configured.rareMinter).toBe(rareMinter);
    expect(configured.contract.toLowerCase()).toBe(contract.toLowerCase());
    expect(configured.currencyAddress).toBe(zeroAddress);
    expect(configured.price).toBe('0');
    expect(configured.maxMints).toBe('2');

    const minted = await step('mint direct sale release as buyer', () =>
      jsonCommand<ReleaseMintDirectSaleResult>(live.buyerHome, [
        'listing',
        'release',
        'mint',
        '--contract',
        contract,
        '--quantity',
        '2',
        '--chain',
        live.chain,
      ], 240_000),
    );

    expectTx(minted);
    expect(minted.rareMinter).toBe(rareMinter);
    expect(minted.contract.toLowerCase()).toBe(contract.toLowerCase());
    expect(minted.buyer.toLowerCase()).toBe(live.buyerAddress.toLowerCase());
    expect(minted.recipient.toLowerCase()).toBe(live.buyerAddress.toLowerCase());
    expect(minted.quantity).toBe(2);
    expect(minted.currencyAddress).toBe(zeroAddress);
    expect(minted.price).toBe('0');
    expect(minted.totalPrice).toBe('0');
    expect(minted.requiredPayment).toBe('0');
    expect(minted.allowlistRequired).toBe(false);
    expect(minted.tokenIdStart).toBe('1');
    expect(minted.tokenIdEnd).toBe('2');
    expect(minted.tokenIds).toEqual(['1', '2']);
  });
});

async function deployReleaseFixtureContract(chain: SupportedChain, privateKey: `0x${string}`, owner: Address): Promise<Address> {
  const account = privateKeyToAccount(privateKey);
  const publicClient = createLivePublicClient(chain);
  const viemChain = viemChains[chain];
  const walletClient = createWalletClient({
    account,
    chain: viemChain,
    transport: http(liveRpcUrl()),
  });

  const txHash = await retryNonceConflict('deploy RareMinter direct sale fixture contract', () =>
    withLiveTransactionLock(account.address, 'deploy RareMinter direct sale fixture contract', () =>
      walletClient.sendTransaction({
        account,
        chain: viemChain,
        data: releaseFixtureBytecode(owner),
      }),
    ),
  );
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (!receipt.contractAddress) {
    throw new Error('Release fixture deployment did not return a contract address.');
  }
  return receipt.contractAddress;
}

function releaseFixtureBytecode(owner: Address): `0x${string}` {
  const ownerBytes = owner.slice(2).toLowerCase();
  return `0x6048600c60003960486000f3${releaseFixtureRuntimePrefix}${ownerBytes}${releaseFixtureRuntimeSuffix}`;
}
