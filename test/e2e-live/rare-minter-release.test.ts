import { afterAll, beforeAll, expect, it } from 'vitest';
import { createWalletClient, http, parseEther, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { getContractAddresses } from '../../src/contracts/addresses.js';
import {
  cleanupTempHome,
  configureLiveHome,
  createLivePublicClient,
  createTempHome,
  describeLive,
  expectTx,
  jsonCommand,
  livePrivateKey,
  retryNonceConflict,
  step,
  withLiveTransactionLock,
  type TxResult,
} from './live-helpers.js';

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
  releaseContract: Address;
};

let live: LiveRareMinterState;

describeLive('live Sepolia RareMinter release commands', () => {
  beforeAll(async () => {
    const sellerHome = await createTempHome();
    const sellerAddress = privateKeyToAccount(livePrivateKey('E2E_SELLER_PRIVATE_KEY')).address;

    try {
      await step('configure seller wallet for RareMinter release', () =>
        configureLiveHome(sellerHome, process.env.E2E_SELLER_PRIVATE_KEY!),
      );
      const releaseContract = await step('deploy RareMinter release fixture contract', () =>
        deployReleaseFixtureContract(livePrivateKey('E2E_SELLER_PRIVATE_KEY'), sellerAddress),
      );

      live = {
        sellerHome,
        sellerAddress,
        releaseContract,
      };
    } catch (error) {
      await cleanupTempHome(sellerHome);
      throw error;
    }
  });

  afterAll(async () => {
    await cleanupTempHome(live?.sellerHome);
  });

  it('configures and reads a direct sale release for a freshly deployed collection fixture', async () => {
    const contract = live.releaseContract;
    const rareMinter = getContractAddresses('sepolia').rareMinter!;
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
        'sepolia',
      ], 240_000),
    );

    expectTx(result);
    expect(result.rareMinter).toBe(rareMinter);
    expect(result.contract.toLowerCase()).toBe(contract.toLowerCase());
    expect(result.currencyAddress).toBe('0x0000000000000000000000000000000000000000');
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
      'sepolia',
    ]);

    expect(status.configured).toBe(true);
    expect(status.contract.toLowerCase()).toBe(contract.toLowerCase());
    expect(status.rareMinter).toBe(rareMinter);
    expect(status.seller.toLowerCase()).toBe(live.sellerAddress.toLowerCase());
    expect(status.price).toBe(parseEther(price).toString());
    expect(status.maxMints).toBe('2');
  });
});

async function deployReleaseFixtureContract(privateKey: `0x${string}`, owner: Address): Promise<Address> {
  const account = privateKeyToAccount(privateKey);
  const publicClient = createLivePublicClient();
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(process.env.TEST_RPC_URL!),
  });

  const txHash = await retryNonceConflict('deploy RareMinter release fixture contract', () =>
    withLiveTransactionLock(account.address, 'deploy RareMinter release fixture contract', () =>
      walletClient.sendTransaction({
        account,
        chain: sepolia,
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
