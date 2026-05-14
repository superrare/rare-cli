import {
  erc20Abi,
  isAddressEqual,
  parseEventLogs,
  type Address,
  type PublicClient,
  type TransactionReceipt,
} from 'viem';
import { rareMinterAbi } from '../contracts/abis/rare-minter.js';
import { tokenAbi } from '../contracts/abis/token.js';
import type {
  ReleaseNamespace,
  RareClientConfig,
} from './types.js';
import { ETH_ADDRESS } from '../contracts/addresses.js';
import { preparePaymentForSpender, requireWallet } from './helpers.js';
import {
  assertReleaseContractOwner,
  assertReleaseAllowlistConfigMatches,
  assertReleaseLimitMatches,
  buildReleaseAllowlistArtifactFromInput,
  getReleaseAllowlistProof,
  planReleaseConfigure,
  planReleaseAllowlistConfig,
  planReleaseClearAllowlistConfig,
  planReleaseLimitConfig,
  planReleaseDirectSaleMint,
  preflightReleaseDirectSaleMint,
  parseReleaseAllowlistArtifactJson,
  requireRareMinterAddress,
  shapeReleaseAllowlistConfig,
  shapeReleaseLimitConfig,
  shapeReleaseMintTokenRange,
  shapeReleaseStatus,
  type RawAllowlistConfig,
  type RawDirectSaleConfig,
  type ReleaseMintTokenRange,
  ZERO_BYTES32,
} from './release-core.js';
import {
  generateApiAddressMerkleRoot,
  resolveApiAddressMerkleProof,
} from './merkle-api.js';

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

async function readReleaseStatus(opts: {
  publicClient: PublicClient;
  rareMinter: Address;
  contract: Address;
  account?: Address;
}): ReturnType<ReleaseNamespace['getStatus']> {
  const [
    directSale,
    allowlist,
    mintLimit,
    txLimit,
  ] = await Promise.all([
    readDirectSaleConfig(opts),
    readAllowlistConfig(opts),
    readMintLimit(opts),
    readTxLimit(opts),
  ]);

  const [
    totalSupply,
    maxSupply,
    currencyDecimals,
    accountMints,
    accountTxs,
  ] = await Promise.all([
    optionalRead(async () => opts.publicClient.readContract({
      address: opts.contract,
      abi: tokenAbi,
      functionName: 'totalSupply',
    })),
    optionalRead(async () => opts.publicClient.readContract({
      address: opts.contract,
      abi: tokenAbi,
      functionName: 'maxTokens',
    })),
    readCurrencyDecimals(opts.publicClient, directSale.currencyAddress, { required: false }),
    opts.account === undefined
      ? Promise.resolve(null)
      : opts.publicClient.readContract({
          address: opts.rareMinter,
          abi: rareMinterAbi,
          functionName: 'getContractMintsPerAddress',
          args: [opts.contract, opts.account],
        }),
    opts.account === undefined
      ? Promise.resolve(null)
      : opts.publicClient.readContract({
          address: opts.rareMinter,
          abi: rareMinterAbi,
          functionName: 'getContractTxsPerAddress',
          args: [opts.contract, opts.account],
        }),
  ]);

  return shapeReleaseStatus({
    rareMinter: opts.rareMinter,
    contract: opts.contract,
    directSale,
    allowlist,
    mintLimit,
    txLimit,
    account: opts.account ?? null,
    accountMints,
    accountTxs,
    totalSupply,
    maxSupply,
    currencyDecimals,
    nowSeconds: currentUnixTimestamp(),
  });
}

function readMintDirectSaleTokenRange(opts: {
  receipt: TransactionReceipt;
  contract: Address;
  buyer: Address;
}): ReleaseMintTokenRange {
  const [event] = parseEventLogs({
    abi: rareMinterAbi,
    eventName: 'MintDirectSale',
    logs: opts.receipt.logs,
  }).filter((log) =>
    isAddressEqual(log.args._contractAddress, opts.contract) &&
    isAddressEqual(log.args._buyer, opts.buyer),
  );

  if (event === undefined) {
    throw new Error(`MintDirectSale event was not found for ${opts.contract} and buyer ${opts.buyer}.`);
  }

  return shapeReleaseMintTokenRange(event.args._tokenIdStart, event.args._tokenIdEnd);
}

export function createReleaseNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  addresses: { rareMinter?: Address; auction: Address },
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
      const resolvedParams = await resolveReleaseAllowlistConfigParams(config, params);
      const plan = planReleaseAllowlistConfig(resolvedParams);

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

    async mintDirectSale(params): ReturnType<ReleaseNamespace['mintDirectSale']> {
      const rareMinter = requireRareMinterAddress(addresses.rareMinter);
      const { walletClient, account, accountAddress } = requireWallet(config);
      const plan = planReleaseDirectSaleMint(params);
      const status = await readReleaseStatus({
        publicClient,
        rareMinter,
        contract: plan.contract,
        account: accountAddress,
      });
      const block = await publicClient.getBlock();
      const proof = plan.proof.length > 0 || status.allowlistRoot === ZERO_BYTES32 || status.allowlistEndTimestamp <= BigInt(block.timestamp)
        ? plan.proof
        : (await resolveApiAddressMerkleProof(config, {
            root: status.allowlistRoot,
            address: accountAddress,
            storageTarget: 'collection-allowlist',
          })).proof;
      const mint = preflightReleaseDirectSaleMint({
        status,
        plan: { ...plan, proof },
        buyer: accountAddress,
        nowSeconds: BigInt(block.timestamp),
      });
      const payment = await preparePaymentForSpender({
        publicClient,
        walletClient,
        account,
        accountAddress,
        marketplaceSettingsSource: addresses.auction,
        spenderAddress: rareMinter,
        currency: mint.currency,
        amount: mint.totalPrice,
        autoApprove: plan.autoApprove,
      });

      const txHash = await walletClient.writeContract({
        address: rareMinter,
        abi: rareMinterAbi,
        functionName: 'mintDirectSale',
        args: [
          mint.contract,
          mint.currency,
          mint.price,
          mint.quantity,
          mint.proof,
        ],
        account,
        chain: undefined,
        value: payment.value,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const tokenRange = readMintDirectSaleTokenRange({
        receipt,
        contract: mint.contract,
        buyer: accountAddress,
      });

      return {
        txHash,
        receipt,
        approvalTxHash: payment.approvalTxHash,
        rareMinter,
        contract: mint.contract,
        buyer: accountAddress,
        recipient: mint.recipient,
        quantity: mint.quantity,
        currencyAddress: mint.currency,
        price: mint.price,
        totalPrice: mint.totalPrice,
        requiredPayment: payment.requiredAmount,
        allowlistRequired: mint.allowlistRequired,
        ...tokenRange,
      };
    },

    async getStatus(params): ReturnType<ReleaseNamespace['getStatus']> {
      const rareMinter = requireRareMinterAddress(addresses.rareMinter);
      return readReleaseStatus({
        publicClient,
        rareMinter,
        contract: params.contract,
        account: params.account,
      });
    },
  };
}

function currentUnixTimestamp(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

async function resolveReleaseAllowlistConfigParams(
  config: RareClientConfig,
  params: Parameters<ReleaseNamespace['setAllowlistConfig']>[0],
): Promise<Parameters<ReleaseNamespace['setAllowlistConfig']>[0]> {
  if (params.root !== undefined || params.artifact === undefined) {
    return params;
  }

  const root = await generateApiAddressMerkleRoot(config, {
    addresses: params.artifact.wallets.map((wallet) => wallet.address),
    storageTarget: 'collection-allowlist',
  });

  return {
    ...params,
    root,
    artifact: undefined,
  };
}
