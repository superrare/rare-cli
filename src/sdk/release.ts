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
  buildReleaseAllowlistArtifactFromInput,
  getReleaseAllowlistProof,
  planReleaseConfigure,
  planReleaseAllowlistConfig,
  planReleaseClearAllowlistConfig,
  planReleaseLimitConfig,
  planReleaseSellerStakingMinimum,
  parseReleaseAllowlistArtifactJson,
  requireRareMinterAddress,
  shapeReleaseStatus,
  ZERO_BYTES32,
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

async function assertCollectionOwnerForReleaseWrite(opts: {
  publicClient: PublicClient;
  contract: Address;
  accountAddress: Address;
}): Promise<void> {
  const { publicClient, contract, accountAddress } = opts;

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
  }) as Promise<RawAllowlistConfig>;
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
  }) as Promise<RawStakingMinimum>;
}

function shapeAllowlistConfig(opts: {
  rareMinter: Address;
  contract: Address;
  allowlist: RawAllowlistConfig;
  nowSeconds: bigint;
}) {
  return {
    rareMinter: opts.rareMinter,
    contract: opts.contract,
    root: opts.allowlist.root,
    endTimestamp: opts.allowlist.endTimestamp,
    active: opts.allowlist.root !== ZERO_BYTES32 && opts.allowlist.endTimestamp > opts.nowSeconds,
    now: opts.nowSeconds,
  };
}

function shapeLimitConfig(opts: {
  rareMinter: Address;
  contract: Address;
  limit: bigint;
}) {
  return {
    rareMinter: opts.rareMinter,
    contract: opts.contract,
    limit: opts.limit,
    enabled: opts.limit > 0n,
  };
}

function shapeSellerStakingMinimum(opts: {
  rareMinter: Address;
  contract: Address;
  stakingMinimum: RawStakingMinimum;
  nowSeconds: bigint;
}) {
  return {
    rareMinter: opts.rareMinter,
    contract: opts.contract,
    amount: opts.stakingMinimum.amount,
    endTimestamp: opts.stakingMinimum.endTimestamp,
    active: opts.stakingMinimum.amount > 0n && opts.stakingMinimum.endTimestamp > opts.nowSeconds,
    now: opts.nowSeconds,
  };
}

function assertAllowlistConfigMatches(expected: {
  root: `0x${string}`;
  endTimestamp: bigint;
}, actual: RawAllowlistConfig): void {
  if (
    actual.root.toLowerCase() !== expected.root.toLowerCase() ||
    actual.endTimestamp !== expected.endTimestamp
  ) {
    throw new Error(
      `RareMinter allowlist verification failed. Expected root ${expected.root} ending ${expected.endTimestamp}, ` +
        `read root ${actual.root} ending ${actual.endTimestamp}.`,
    );
  }
}

function assertLimitMatches(field: string, expected: bigint, actual: bigint): void {
  if (actual !== expected) {
    throw new Error(`RareMinter ${field} verification failed. Expected ${expected}, read ${actual}.`);
  }
}

function assertSellerStakingMinimumMatches(expected: {
  amount: bigint;
  endTimestamp: bigint;
}, actual: RawStakingMinimum): void {
  if (actual.amount !== expected.amount || actual.endTimestamp !== expected.endTimestamp) {
    throw new Error(
      `RareMinter seller staking minimum verification failed. Expected amount ${expected.amount} ending ${expected.endTimestamp}, ` +
        `read amount ${actual.amount} ending ${actual.endTimestamp}.`,
    );
  }
}

export function createReleaseNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  addresses: { rareMinter?: Address },
): RareClient['release'] {
  return {
    buildAllowlistArtifact(params) {
      return buildReleaseAllowlistArtifactFromInput(params.input, params.format);
    },

    parseAllowlistArtifact(params) {
      return parseReleaseAllowlistArtifactJson(params.input);
    },

    getAllowlistProof(params) {
      return getReleaseAllowlistProof(params);
    },

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

    async getAllowlistConfig(params) {
      const rareMinter = requireRareMinterAddress(addresses.rareMinter);
      const allowlist = await readAllowlistConfig({
        publicClient,
        rareMinter,
        contract: params.contract,
      });
      return shapeAllowlistConfig({
        rareMinter,
        contract: params.contract,
        allowlist,
        nowSeconds: currentUnixTimestamp(),
      });
    },

    async setAllowlistConfig(params) {
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
      assertAllowlistConfigMatches(plan, allowlist);

      return {
        txHash,
        receipt,
        config: shapeAllowlistConfig({
          rareMinter,
          contract: plan.contract,
          allowlist,
          nowSeconds: currentUnixTimestamp(),
        }),
      };
    },

    async clearAllowlistConfig(params) {
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
      assertAllowlistConfigMatches(plan, allowlist);

      return {
        txHash,
        receipt,
        config: shapeAllowlistConfig({
          rareMinter,
          contract: plan.contract,
          allowlist,
          nowSeconds: currentUnixTimestamp(),
        }),
      };
    },

    async getMintLimit(params) {
      const rareMinter = requireRareMinterAddress(addresses.rareMinter);
      const limit = await readMintLimit({
        publicClient,
        rareMinter,
        contract: params.contract,
      });
      return shapeLimitConfig({ rareMinter, contract: params.contract, limit });
    },

    async setMintLimit(params) {
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
      assertLimitMatches('mint limit', plan.limit, limit);

      return {
        txHash,
        receipt,
        config: shapeLimitConfig({ rareMinter, contract: plan.contract, limit }),
      };
    },

    async getTxLimit(params) {
      const rareMinter = requireRareMinterAddress(addresses.rareMinter);
      const limit = await readTxLimit({
        publicClient,
        rareMinter,
        contract: params.contract,
      });
      return shapeLimitConfig({ rareMinter, contract: params.contract, limit });
    },

    async setTxLimit(params) {
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
      assertLimitMatches('transaction limit', plan.limit, limit);

      return {
        txHash,
        receipt,
        config: shapeLimitConfig({ rareMinter, contract: plan.contract, limit }),
      };
    },

    async getSellerStakingMinimum(params) {
      const rareMinter = requireRareMinterAddress(addresses.rareMinter);
      const stakingMinimum = await readSellerStakingMinimum({
        publicClient,
        rareMinter,
        contract: params.contract,
      });
      return shapeSellerStakingMinimum({
        rareMinter,
        contract: params.contract,
        stakingMinimum,
        nowSeconds: currentUnixTimestamp(),
      });
    },

    async setSellerStakingMinimum(params) {
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
      assertSellerStakingMinimumMatches(plan, stakingMinimum);

      return {
        txHash,
        receipt,
        config: shapeSellerStakingMinimum({
          rareMinter,
          contract: plan.contract,
          stakingMinimum,
          nowSeconds: currentUnixTimestamp(),
        }),
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
        walletMints,
        walletTxs,
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
        params.wallet
          ? publicClient.readContract({
              address: rareMinter,
              abi: rareMinterAbi,
              functionName: 'getContractMintsPerAddress',
              args: [params.contract, params.wallet],
            })
          : Promise.resolve(null),
        params.wallet
          ? publicClient.readContract({
              address: rareMinter,
              abi: rareMinterAbi,
              functionName: 'getContractTxsPerAddress',
              args: [params.contract, params.wallet],
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
        wallet: params.wallet ?? null,
        walletMints,
        walletTxs,
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
