import {
  erc20Abi,
  type Address,
  type PublicClient,
} from 'viem';
import { rareMinterAbi } from '../contracts/abis/rare-minter.js';
import { tokenAbi } from '../contracts/abis/token.js';
import type {
  RareClient,
  RareClientConfig,
} from './types.js';
import { ETH_ADDRESS, requireWallet } from './helpers.js';
import {
  assertReleaseContractOwner,
  planReleaseConfigure,
  requireRareMinterAddress,
  shapeReleaseStatus,
  type RawAllowlistConfig,
  type RawDirectSaleConfig,
  type RawStakingMinimum,
} from './release-core.js';

const releaseCollectionAbi = [
  {
    inputs: [
      { name: '_receiver', type: 'address' },
    ],
    name: 'mintTo',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

async function readCurrencyDecimals(
  publicClient: PublicClient,
  currency: Address,
  opts: { required: boolean },
): Promise<number | null> {
  if (currency === ETH_ADDRESS) {
    return 18;
  }

  try {
    return await publicClient.readContract({
      address: currency,
      abi: erc20Abi,
      functionName: 'decimals',
    });
  } catch (error) {
    if (!opts.required) {
      return null;
    }
    throw new Error(`Unable to read decimals for ERC20 currency ${currency}: ${(error as Error).message}`);
  }
}

async function assertConfigurableReleaseContract(opts: {
  publicClient: PublicClient;
  contract: Address;
  accountAddress: Address;
  rareMinter: Address;
}): Promise<void> {
  const { publicClient, contract, accountAddress, rareMinter } = opts;

  let owner: Address;
  try {
    owner = await publicClient.readContract({
      address: contract,
      abi: releaseCollectionAbi,
      functionName: 'owner',
    });
  } catch (error) {
    throw new Error(`Unable to read owner() from collection ${contract}: ${(error as Error).message}`);
  }

  assertReleaseContractOwner({ contract, accountAddress, owner });

  try {
    await publicClient.simulateContract({
      address: contract,
      abi: releaseCollectionAbi,
      functionName: 'mintTo',
      args: [accountAddress],
      account: rareMinter,
    });
  } catch (error) {
    throw new Error(
      `Collection ${contract} must expose mintTo(address) callable by RareMinter ${rareMinter}. ` +
        `Simulation failed: ${(error as Error).message}`,
    );
  }
}

async function optionalRead<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

export function createReleaseNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  addresses: { rareMinter?: Address },
): RareClient['release'] {
  return {
    async configure(params) {
      const rareMinter = requireRareMinterAddress(addresses.rareMinter);
      const { walletClient, account, accountAddress } = requireWallet(config);
      const currencyAddress = params.currency ?? ETH_ADDRESS;
      const currencyDecimals = currencyAddress === ETH_ADDRESS || typeof params.price === 'bigint'
        ? null
        : await readCurrencyDecimals(publicClient, currencyAddress, { required: true });
      const plan = planReleaseConfigure(params, {
        accountAddress,
        currencyDecimals,
        nowSeconds: currentUnixTimestamp(),
      });

      await assertConfigurableReleaseContract({
        publicClient,
        contract: plan.contract,
        accountAddress,
        rareMinter,
      });

      const txHash = await walletClient.writeContract({
        address: rareMinter,
        abi: rareMinterAbi,
        functionName: 'prepareMintDirectSale',
        args: [
          plan.contract,
          plan.currencyAddress,
          plan.price,
          plan.startTime,
          plan.maxMints,
          plan.splitRecipients,
          plan.splitRatios,
        ],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      return {
        txHash,
        receipt,
        rareMinter,
        contract: plan.contract,
        currencyAddress: plan.currencyAddress,
        price: plan.price,
        startTime: plan.startTime,
        maxMints: plan.maxMints,
        splitRecipients: plan.splitRecipients,
        splitRatios: plan.splitRatios,
      };
    },

    async getStatus(params) {
      const rareMinter = requireRareMinterAddress(addresses.rareMinter);

      const [
        directSale,
        allowlist,
        mintLimit,
        txLimit,
        stakingMinimum,
      ] = await Promise.all([
        publicClient.readContract({
          address: rareMinter,
          abi: rareMinterAbi,
          functionName: 'getDirectSaleConfig',
          args: [params.contract],
        }) as Promise<RawDirectSaleConfig>,
        publicClient.readContract({
          address: rareMinter,
          abi: rareMinterAbi,
          functionName: 'getContractAllowListConfig',
          args: [params.contract],
        }) as Promise<RawAllowlistConfig>,
        publicClient.readContract({
          address: rareMinter,
          abi: rareMinterAbi,
          functionName: 'getContractMintLimit',
          args: [params.contract],
        }),
        publicClient.readContract({
          address: rareMinter,
          abi: rareMinterAbi,
          functionName: 'getContractTxLimit',
          args: [params.contract],
        }),
        publicClient.readContract({
          address: rareMinter,
          abi: rareMinterAbi,
          functionName: 'getContractSellerStakingMinimum',
          args: [params.contract],
        }) as Promise<RawStakingMinimum>,
      ]);

      const [
        totalSupply,
        maxSupply,
        currencyDecimals,
        accountMints,
        accountTxs,
      ] = await Promise.all([
        optionalRead(() => publicClient.readContract({
          address: params.contract,
          abi: tokenAbi,
          functionName: 'totalSupply',
        })),
        optionalRead(() => publicClient.readContract({
          address: params.contract,
          abi: tokenAbi,
          functionName: 'maxTokens',
        })),
        readCurrencyDecimals(publicClient, directSale.currencyAddress, { required: false }),
        params.account
          ? publicClient.readContract({
              address: rareMinter,
              abi: rareMinterAbi,
              functionName: 'getContractMintsPerAddress',
              args: [params.contract, params.account],
            })
          : Promise.resolve(null),
        params.account
          ? publicClient.readContract({
              address: rareMinter,
              abi: rareMinterAbi,
              functionName: 'getContractTxsPerAddress',
              args: [params.contract, params.account],
            })
          : Promise.resolve(null),
      ]);

      return shapeReleaseStatus({
        rareMinter,
        contract: params.contract,
        directSale,
        allowlist,
        mintLimit,
        txLimit,
        account: params.account ?? null,
        accountMints,
        accountTxs,
        stakingMinimum,
        totalSupply,
        maxSupply,
        currencyDecimals,
        nowSeconds: currentUnixTimestamp(),
      });
    },
  };
}

function currentUnixTimestamp(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}
