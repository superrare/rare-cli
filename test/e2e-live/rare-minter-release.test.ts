import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWalletClient, http, parseEther, zeroAddress, type Address } from 'viem';
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
  liveRpcUrl,
  retryNonceConflict,
  step,
  withLiveTransactionLock,
  type TxResult,
} from './live-helpers.js';
import { hasLiveWalletEnv } from './env.mjs';
import { releaseLiveWallets, reserveLiveWallet, type LiveWalletLease } from './helpers/live-wallet-pool.js';

const requiredEnv = [
  'TEST_RPC_URL',
] as const;

const missingEnv = [
  ...requiredEnv.filter((name) => !process.env[name]),
  ...(hasLiveWalletEnv('seller') ? [] : ['E2E_SELLER_PRIVATE_KEYS']),
];
const describeLive = missingEnv.length === 0 ? describe.sequential : describe.skip;

// Runtime dispatches owner() and mintTo(address). Creation code injects the seller as owner.
const releaseFixtureRuntimePrefix = '60003560e01c80638da5cb5b14601f578063755edd1714603d5760006000fd5b73';
const releaseFixtureRuntimeSuffix = '60005260206000f35b600160005260206000f3';

type ReleaseConfigureResult = TxResult & {
  rareMinter: Address;
  contract: Address;
  currencyAddress: Address;
  price: string;
  startTime: string;
  maxMints: string;
  splitRecipients: Address[];
  splitRatios: number[];
};

type LiveRareMinterState = {
  sellerHome: string;
  sellerAddress: Address;
  sellerWallet: LiveWalletLease;
  releaseContract: Address;
  chain: SupportedChain;
};

let live: LiveRareMinterState;

describeLive('live RareMinter release commands', () => {
  beforeAll(async () => {
    const sellerHome = await createTempHome();
    const chain = await detectLiveChain();
    const sellerWallet = await reserveLiveWallet('seller', chain);
    const sellerAddress = sellerWallet.address;

    try {
      await step('configure seller wallet for RareMinter release', () =>
        configureLiveHome(sellerHome, sellerWallet.privateKey, chain),
      );
      const releaseContract = await step('deploy RareMinter release fixture contract', () =>
        deployReleaseFixtureContract(chain, sellerWallet.privateKey, sellerAddress),
      );

      live = {
        sellerHome,
        sellerAddress,
        sellerWallet,
        releaseContract,
        chain,
      };
    } catch (error) {
      await cleanupTempHome(sellerHome);
      await releaseLiveWallets([sellerWallet]);
      throw error;
    }
  });

  afterAll(async () => {
    await cleanupTempHome(live?.sellerHome);
    await releaseLiveWallets([live?.sellerWallet]);
  });

  it('configures and reads a direct sale release for a freshly deployed collection fixture', async () => {
    const contract = live.releaseContract;
    const rareMinter = getContractAddresses(live.chain).rareMinter!;
    const price = '0.000001';

    const result = await step('configure direct sale release', () =>
      jsonCommand<ReleaseConfigureResult>(live.sellerHome, [
        'listing',
        'release',
        'configure',
        '--contract',
        contract,
        '--price',
        price,
        '--max-mints',
        '2',
        '--split',
        `${live.sellerAddress}=100`,
        '--chain',
        live.chain,
      ], 240_000),
    );

    expectTx(result);
    expect(result.rareMinter).toBe(rareMinter);
    expect(result.contract.toLowerCase()).toBe(contract.toLowerCase());
    expect(result.currencyAddress).toBe(zeroAddress);
    expect(result.price).toBe(parseEther(price).toString());
    expect(result.maxMints).toBe('2');
    expect(result.splitRecipients.map((address) => address.toLowerCase())).toEqual([
      live.sellerAddress.toLowerCase(),
    ]);
    expect(result.splitRatios).toEqual([100]);

    const status = await jsonCommand<{
      configured: boolean;
      contract: Address;
      rareMinter: Address;
      seller: Address;
      price: string;
      maxMints: string;
    }>(live.sellerHome, [
      'listing',
      'release',
      'status',
      '--contract',
      contract,
      '--chain',
      live.chain,
    ]);

    expect(status.configured).toBe(true);
    expect(status.contract.toLowerCase()).toBe(contract.toLowerCase());
    expect(status.rareMinter).toBe(rareMinter);
    expect(status.seller.toLowerCase()).toBe(live.sellerAddress.toLowerCase());
    expect(status.price).toBe(parseEther(price).toString());
    expect(status.maxMints).toBe('2');
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

  const txHash = await retryNonceConflict('deploy RareMinter release fixture contract', () =>
    withLiveTransactionLock(account.address, 'deploy RareMinter release fixture contract', () =>
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
