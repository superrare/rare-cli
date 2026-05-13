import {
  erc20Abi,
  type Address,
  type PublicClient,
} from 'viem';
import { rareMinterAbi } from '../contracts/abis/rare-minter.js';
import { tokenAbi } from '../contracts/abis/token.js';
import type {
  ReleaseNamespace,
  RareClientConfig,
} from './types.js';
import { ETH_ADDRESS } from '../contracts/addresses.js';
import { requireWallet } from './helpers.js';
import {
  assertReleaseContractOwner,
  assertReleaseAllowlistConfigMatches,
  assertReleaseLimitMatches,
  assertReleaseSellerStakingMinimumMatches,
  buildReleaseAllowlistArtifactFromInput,
  getReleaseAllowlistProof,
  planReleaseConfigure,
  planReleaseAllowlistConfig,
  planReleaseClearAllowlistConfig,
  planReleaseLimitConfig,
  planReleaseSellerStakingMinimum,
  parseReleaseAllowlistArtifactJson,
  requireRareMinterAddress,
  shapeReleaseAllowlistConfig,
  shapeReleaseLimitConfig,
  shapeReleaseSellerStakingMinimum,
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
    throw new Error(`Unable to read decimals for ERC20 currency ${currency}: ${errorMessage(error)}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readReleaseCollectionOwner(
  publicClient: PublicClient,
  contract: Address,
): Promise<Address> {
  try {
    return await publicClient.readContract({
      address: contract,
      abi: releaseCollectionAbi,
      functionName: 'owner',
    });
  } catch (error) {
    throw new Error(`Unable to read owner() from collection ${contract}: ${errorMessage(error)}`);
  }
}

async function assertConfigurableReleaseContract(opts: {
  publicClient: PublicClient;
  contract: Address;
  accountAddress: Address;
  rareMinter: Address;
}): Promise<void> {
  const { publicClient, contract, accountAddress, rareMinter } = opts;

  const owner = await readReleaseCollectionOwner(publicClient, contract);
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
        `Simulation failed: ${errorMessage(error)}`,
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

async function assertCollectionOwnerForReleaseWrite(opts: {
  publicClient: PublicClient;
  contract: Address;
  accountAddress: Address;
}): Promise<void> {
  const { publicClient, contract, accountAddress } = opts;

  const owner = await readReleaseCollectionOwner(publicClient, contract);
  assertReleaseContractOwner({ contract, accountAddress, owner });
}

async function readDirectSaleConfig(opts: {
  publicClient: PublicClient;
  rareMinter: Address;
  contract: Address;
}): Promise<RawDirectSaleConfig> {
  return opts.publicClient.readContract({
    address: opts.rareMinter,
    abi: rareMinterAbi,
    functionName: 'getDirectSaleConfig',
    args: [opts.contract],
  });
}

async function readAllowlistConfig(opts: {
  publicClient: PublicClient;
  rareMinter: Address;
  contract: Address;
}): Promise<RawAllowlistConfig> {
  return opts.publicClient.readContract({
    address: opts.rareMinter,
    abi: rareMinterAbi,
    functionName: 'getContractAllowListConfig',
    args: [opts.contract],
  });
}

async function readMintLimit(opts: {
  publicClient: PublicClient;
  rareMinter: Address;
  contract: Address;
}): Promise<bigint> {
  return opts.publicClient.readContract({
    address: opts.rareMinter,
    abi: rareMinterAbi,
    functionName: 'getContractMintLimit',
    args: [opts.contract],
  });
}

async function readTxLimit(opts: {
  publicClient: PublicClient;
  rareMinter: Address;
  contract: Address;
}): Promise<bigint> {
  return opts.publicClient.readContract({
    address: opts.rareMinter,
    abi: rareMinterAbi,
    functionName: 'getContractTxLimit',
    args: [opts.contract],
  });
}

async function readSellerStakingMinimum(opts: {
  publicClient: PublicClient;
  rareMinter: Address;
  contract: Address;
}): Promise<RawStakingMinimum> {
  return opts.publicClient.readContract({
    address: opts.rareMinter,
    abi: rareMinterAbi,
    functionName: 'getContractSellerStakingMinimum',
    args: [opts.contract],
  });
}

export function createReleaseNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  addresses: { rareMinter?: Address },
): ReleaseNamespace {
  return {
    buildAllowlistArtifact(params): ReturnType<ReleaseNamespace['buildAllowlistArtifact']> {
      return buildReleaseAllowlistArtifactFromInput(params.input, params.format);
    },

    parseAllowlistArtifact(params): ReturnType<ReleaseNamespace['parseAllowlistArtifact']> {
      return parseReleaseAllowlistArtifactJson(params.input);
    },

    getAllowlistProof(params): ReturnType<ReleaseNamespace['getAllowlistProof']> {
      return getReleaseAllowlistProof(params);
    },

    async configure(params): ReturnType<ReleaseNamespace['configure']> {
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

    async getAllowlistConfig(params): ReturnType<ReleaseNamespace['getAllowlistConfig']> {
      const rareMinter = requireRareMinterAddress(addresses.rareMinter);
      const allowlist = await readAllowlistConfig({
        publicClient,
        rareMinter,
        contract: params.contract,
      });
      return shapeReleaseAllowlistConfig({
        rareMinter,
        contract: params.contract,
        allowlist,
        nowSeconds: currentUnixTimestamp(),
      });
    },

    async setAllowlistConfig(params): ReturnType<ReleaseNamespace['setAllowlistConfig']> {
      const rareMinter = requireRareMinterAddress(addresses.rareMinter);
      const { walletClient, account, accountAddress } = requireWallet(config);
      const plan = planReleaseAllowlistConfig(params);

      await assertCollectionOwnerForReleaseWrite({
        publicClient,
        contract: plan.contract,
        accountAddress,
      });

      const txHash = await walletClient.writeContract({
        address: rareMinter,
        abi: rareMinterAbi,
        functionName: 'setContractAllowListConfig',
        args: [plan.root, plan.endTimestamp, plan.contract],
        account,
        chain: undefined,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const allowlist = await readAllowlistConfig({
        publicClient,
        rareMinter,
        contract: plan.contract,
      });
      assertReleaseAllowlistConfigMatches(plan, allowlist);

      return {
        txHash,
        receipt,
        config: shapeReleaseAllowlistConfig({
          rareMinter,
          contract: plan.contract,
          allowlist,
          nowSeconds: currentUnixTimestamp(),
        }),
      };
    },

    async clearAllowlistConfig(params): ReturnType<ReleaseNamespace['clearAllowlistConfig']> {
      const rareMinter = requireRareMinterAddress(addresses.rareMinter);
      const { walletClient, account, accountAddress } = requireWallet(config);
      const plan = planReleaseClearAllowlistConfig(params);

      await assertCollectionOwnerForReleaseWrite({
        publicClient,
        contract: plan.contract,
        accountAddress,
      });

      const txHash = await walletClient.writeContract({
        address: rareMinter,
        abi: rareMinterAbi,
        functionName: 'setContractAllowListConfig',
        args: [plan.root, plan.endTimestamp, plan.contract],
        account,
        chain: undefined,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const allowlist = await readAllowlistConfig({
        publicClient,
        rareMinter,
        contract: plan.contract,
      });
      assertReleaseAllowlistConfigMatches(plan, allowlist);

      return {
        txHash,
        receipt,
        config: shapeReleaseAllowlistConfig({
          rareMinter,
          contract: plan.contract,
          allowlist,
          nowSeconds: currentUnixTimestamp(),
        }),
      };
    },

    async getMintLimit(params): ReturnType<ReleaseNamespace['getMintLimit']> {
      const rareMinter = requireRareMinterAddress(addresses.rareMinter);
      const limit = await readMintLimit({
        publicClient,
        rareMinter,
        contract: params.contract,
      });
      return shapeReleaseLimitConfig({ rareMinter, contract: params.contract, limit });
    },

    async setMintLimit(params): ReturnType<ReleaseNamespace['setMintLimit']> {
      const rareMinter = requireRareMinterAddress(addresses.rareMinter);
      const { walletClient, account, accountAddress } = requireWallet(config);
      const plan = planReleaseLimitConfig(params);

      await assertCollectionOwnerForReleaseWrite({
        publicClient,
        contract: plan.contract,
        accountAddress,
      });

      const txHash = await walletClient.writeContract({
        address: rareMinter,
        abi: rareMinterAbi,
        functionName: 'setContractMintLimit',
        args: [plan.contract, plan.limit],
        account,
        chain: undefined,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const limit = await readMintLimit({ publicClient, rareMinter, contract: plan.contract });
      assertReleaseLimitMatches('mint limit', plan.limit, limit);

      return {
        txHash,
        receipt,
        config: shapeReleaseLimitConfig({ rareMinter, contract: plan.contract, limit }),
      };
    },

    async getTxLimit(params): ReturnType<ReleaseNamespace['getTxLimit']> {
      const rareMinter = requireRareMinterAddress(addresses.rareMinter);
      const limit = await readTxLimit({
        publicClient,
        rareMinter,
        contract: params.contract,
      });
      return shapeReleaseLimitConfig({ rareMinter, contract: params.contract, limit });
    },

    async setTxLimit(params): ReturnType<ReleaseNamespace['setTxLimit']> {
      const rareMinter = requireRareMinterAddress(addresses.rareMinter);
      const { walletClient, account, accountAddress } = requireWallet(config);
      const plan = planReleaseLimitConfig(params);

      await assertCollectionOwnerForReleaseWrite({
        publicClient,
        contract: plan.contract,
        accountAddress,
      });

      const txHash = await walletClient.writeContract({
        address: rareMinter,
        abi: rareMinterAbi,
        functionName: 'setContractTxLimit',
        args: [plan.contract, plan.limit],
        account,
        chain: undefined,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const limit = await readTxLimit({ publicClient, rareMinter, contract: plan.contract });
      assertReleaseLimitMatches('transaction limit', plan.limit, limit);

      return {
        txHash,
        receipt,
        config: shapeReleaseLimitConfig({ rareMinter, contract: plan.contract, limit }),
      };
    },

    async getSellerStakingMinimum(params): ReturnType<ReleaseNamespace['getSellerStakingMinimum']> {
      const rareMinter = requireRareMinterAddress(addresses.rareMinter);
      const stakingMinimum = await readSellerStakingMinimum({
        publicClient,
        rareMinter,
        contract: params.contract,
      });
      return shapeReleaseSellerStakingMinimum({
        rareMinter,
        contract: params.contract,
        stakingMinimum,
        nowSeconds: currentUnixTimestamp(),
      });
    },

    async setSellerStakingMinimum(params): ReturnType<ReleaseNamespace['setSellerStakingMinimum']> {
      const rareMinter = requireRareMinterAddress(addresses.rareMinter);
      const { walletClient, account, accountAddress } = requireWallet(config);
      const plan = planReleaseSellerStakingMinimum(params);

      await assertCollectionOwnerForReleaseWrite({
        publicClient,
        contract: plan.contract,
        accountAddress,
      });

      const txHash = await walletClient.writeContract({
        address: rareMinter,
        abi: rareMinterAbi,
        functionName: 'setContractSellerStakingMinimum',
        args: [plan.contract, plan.amount, plan.endTimestamp],
        account,
        chain: undefined,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const stakingMinimum = await readSellerStakingMinimum({
        publicClient,
        rareMinter,
        contract: plan.contract,
      });
      assertReleaseSellerStakingMinimumMatches(plan, stakingMinimum);

      return {
        txHash,
        receipt,
        config: shapeReleaseSellerStakingMinimum({
          rareMinter,
          contract: plan.contract,
          stakingMinimum,
          nowSeconds: currentUnixTimestamp(),
        }),
      };
    },

    async getStatus(params): ReturnType<ReleaseNamespace['getStatus']> {
      const rareMinter = requireRareMinterAddress(addresses.rareMinter);

      const [
        directSale,
        allowlist,
        mintLimit,
        txLimit,
        stakingMinimum,
      ] = await Promise.all([
        readDirectSaleConfig({ publicClient, rareMinter, contract: params.contract }),
        readAllowlistConfig({ publicClient, rareMinter, contract: params.contract }),
        readMintLimit({ publicClient, rareMinter, contract: params.contract }),
        readTxLimit({ publicClient, rareMinter, contract: params.contract }),
        readSellerStakingMinimum({ publicClient, rareMinter, contract: params.contract }),
      ]);

      const [
        totalSupply,
        maxSupply,
        currencyDecimals,
        accountMints,
        accountTxs,
      ] = await Promise.all([
        optionalRead(async () => publicClient.readContract({
          address: params.contract,
          abi: tokenAbi,
          functionName: 'totalSupply',
        })),
        optionalRead(async () => publicClient.readContract({
          address: params.contract,
          abi: tokenAbi,
          functionName: 'maxTokens',
        })),
        readCurrencyDecimals(publicClient, directSale.currencyAddress, { required: false }),
        params.account === undefined
          ? Promise.resolve(null)
          : publicClient.readContract({
              address: rareMinter,
              abi: rareMinterAbi,
              functionName: 'getContractMintsPerAddress',
              args: [params.contract, params.account],
            }),
        params.account === undefined
          ? Promise.resolve(null)
          : publicClient.readContract({
              address: rareMinter,
              abi: rareMinterAbi,
              functionName: 'getContractTxsPerAddress',
              args: [params.contract, params.account],
            }),
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
