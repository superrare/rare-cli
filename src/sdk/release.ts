import { parseEventLogs, type Address, type Hash, type PublicClient } from 'viem';
import { collectionOwnerAbi } from '../contracts/abis/collection-owner.js';
import { rareMinterAbi } from '../contracts/abis/rare-minter.js';
import { tokenAbi } from '../contracts/abis/token.js';
import { requireContractAddress, type SupportedChain } from '../contracts/addresses.js';
import { preparePaymentForSpender, requireWallet } from './helpers.js';
import type { RareClient, RareClientConfig, ReleaseConfig } from './types.js';
import {
  assertReleaseAllowlistConfigWriteMatches,
  assertReleaseLimitWriteMatches,
  assertReleaseSellerStakingMinimumWriteMatches,
  buildReleaseAllowlistArtifact,
  getReleaseAllowlistProof,
  planReleaseAllowlistConfig,
  planReleaseDirectSaleMint,
  planReleaseMintLimit,
  planReleaseSellerStakingMinimum,
  planReleaseTxLimit,
  preflightReleaseDirectSaleMint,
  shapeReleaseCollectionSupply,
  shapeReleaseDirectSaleConfig,
  verifyReleaseAllowlistProof,
} from './release-core.js';

export function createReleaseNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  chain: SupportedChain,
): RareClient['release'] {
  return {
    buildAllowlist(params) {
      return buildReleaseAllowlistArtifact(params);
    },

    getAllowlistProof(params) {
      return getReleaseAllowlistProof(params.artifact, params.address);
    },

    verifyAllowlistProof(params) {
      return verifyReleaseAllowlistProof(params);
    },

    async getConfig(params) {
      const minterAddress = requireContractAddress(chain, 'rareMinter');
      return readReleaseConfig(publicClient, minterAddress, params.contract, params.account);
    },

    async mintDirectSale(params) {
      const plan = planReleaseDirectSaleMint(params);
      const minterAddress = requireContractAddress(chain, 'rareMinter');
      const auctionAddress = requireContractAddress(chain, 'auction');
      const { walletClient, account, accountAddress } = requireWallet(config);
      const status = await readReleaseConfig(publicClient, minterAddress, plan.contract, accountAddress);
      const block = await publicClient.getBlock();
      const mint = preflightReleaseDirectSaleMint({
        status,
        plan,
        buyer: accountAddress,
        nowSeconds: block.timestamp,
      });
      const payment = await preparePaymentForSpender({
        publicClient,
        walletClient,
        account,
        accountAddress,
        marketplaceSettingsSource: auctionAddress,
        spenderAddress: minterAddress,
        currency: mint.currency,
        amount: mint.totalPrice,
        autoApprove: plan.autoApprove,
      });
      const txHash = await writeMintDirectSale({
        publicClient,
        walletClient,
        account,
        minterAddress,
        mint,
        value: payment.value,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: rareMinterAbi,
        logs: receipt.logs,
        eventName: 'MintDirectSale',
      });
      const [mintLog] = logs;

      if (!mintLog) {
        throw new Error('RareMinter direct sale mint transaction succeeded but MintDirectSale was not found in logs.');
      }

      return {
        txHash,
        receipt,
        contract: mintLog.args._contractAddress,
        minter: minterAddress,
        buyer: mintLog.args._buyer,
        recipient: mint.recipient,
        quantity: mint.quantity,
        currency: mintLog.args._currency,
        price: mintLog.args._price,
        totalPrice: mint.totalPrice,
        requiredPayment: payment.requiredAmount,
        approvalTxHash: payment.approvalTxHash,
        allowlistRequired: mint.allowlistRequired,
        tokenIdStart: mintLog.args._tokenIdStart,
        tokenIdEnd: mintLog.args._tokenIdEnd,
        tokenIds: buildTokenIdRange(mintLog.args._tokenIdStart, mintLog.args._tokenIdEnd),
      };
    },

    async setAllowlistConfig(params) {
      const plan = planReleaseAllowlistConfig(params);
      const minterAddress = requireContractAddress(chain, 'rareMinter');
      const { walletClient, account } = requireWallet(config);
      const txHash = await writeSetAllowlistConfig({
        publicClient,
        walletClient,
        account,
        minterAddress,
        plan,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const updated = await readReleaseConfig(publicClient, minterAddress, plan.contract);

      assertReleaseAllowlistConfigWriteMatches(plan, updated);

      return {
        txHash,
        receipt,
        contract: plan.contract,
        minter: minterAddress,
        root: updated.allowlistRoot,
        endTimestamp: updated.allowlistEndTimestamp,
      };
    },

    async setMintLimit(params) {
      const plan = planReleaseMintLimit(params);
      const minterAddress = requireContractAddress(chain, 'rareMinter');
      const { walletClient, account } = requireWallet(config);
      const txHash = await writeSetMintLimit({
        publicClient,
        walletClient,
        account,
        minterAddress,
        contract: plan.contract,
        limit: plan.limit,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const updated = await readReleaseConfig(publicClient, minterAddress, plan.contract);

      assertReleaseLimitWriteMatches('mint limit', plan.limit, updated.mintLimit);

      return {
        txHash,
        receipt,
        contract: plan.contract,
        minter: minterAddress,
        limit: updated.mintLimit,
      };
    },

    async setTxLimit(params) {
      const plan = planReleaseTxLimit(params);
      const minterAddress = requireContractAddress(chain, 'rareMinter');
      const { walletClient, account } = requireWallet(config);
      const txHash = await writeSetTxLimit({
        publicClient,
        walletClient,
        account,
        minterAddress,
        contract: plan.contract,
        limit: plan.limit,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const updated = await readReleaseConfig(publicClient, minterAddress, plan.contract);

      assertReleaseLimitWriteMatches('transaction limit', plan.limit, updated.txLimit);

      return {
        txHash,
        receipt,
        contract: plan.contract,
        minter: minterAddress,
        limit: updated.txLimit,
      };
    },

    async setSellerStakingMinimum(params) {
      const plan = planReleaseSellerStakingMinimum(params);
      const minterAddress = requireContractAddress(chain, 'rareMinter');
      const { walletClient, account } = requireWallet(config);
      const txHash = await writeSetSellerStakingMinimum({
        publicClient,
        walletClient,
        account,
        minterAddress,
        plan,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const updated = await readReleaseConfig(publicClient, minterAddress, plan.contract);

      assertReleaseSellerStakingMinimumWriteMatches(plan, updated);

      return {
        txHash,
        receipt,
        contract: plan.contract,
        minter: minterAddress,
        minimum: updated.sellerStakingMinimum,
        endTimestamp: updated.sellerStakingMinimumEndTimestamp,
      };
    },
  };
}

async function readReleaseConfig(
  publicClient: PublicClient,
  minterAddress: Address,
  contract: Address,
  account?: Address,
): Promise<ReleaseConfig> {
  const [
    directSale,
    allowlist,
    mintLimit,
    txLimit,
    sellerStakingMinimum,
    supply,
  ] = await Promise.all([
    publicClient.readContract({
      address: minterAddress,
      abi: rareMinterAbi,
      functionName: 'getDirectSaleConfig',
      args: [contract],
    }),
    publicClient.readContract({
      address: minterAddress,
      abi: rareMinterAbi,
      functionName: 'getContractAllowListConfig',
      args: [contract],
    }),
    publicClient.readContract({
      address: minterAddress,
      abi: rareMinterAbi,
      functionName: 'getContractMintLimit',
      args: [contract],
    }),
    publicClient.readContract({
      address: minterAddress,
      abi: rareMinterAbi,
      functionName: 'getContractTxLimit',
      args: [contract],
    }),
    publicClient.readContract({
      address: minterAddress,
      abi: rareMinterAbi,
      functionName: 'getContractSellerStakingMinimum',
      args: [contract],
    }),
    readReleaseCollectionSupply(publicClient, contract),
  ]);

  const directSaleConfig = shapeReleaseDirectSaleConfig(directSale);
  const baseConfig = {
    contract,
    minter: minterAddress,
    allowlistRoot: allowlist.root,
    allowlistEndTimestamp: allowlist.endTimestamp,
    mintLimit,
    txLimit,
    sellerStakingMinimum: sellerStakingMinimum.amount,
    sellerStakingMinimumEndTimestamp: sellerStakingMinimum.endTimestamp,
    directSale: directSaleConfig,
    supply,
  };

  if (account === undefined) {
    return baseConfig;
  }

  const [accountMints, accountTxs] = await Promise.all([
    publicClient.readContract({
      address: minterAddress,
      abi: rareMinterAbi,
      functionName: 'getContractMintsPerAddress',
      args: [contract, account],
    }),
    publicClient.readContract({
      address: minterAddress,
      abi: rareMinterAbi,
      functionName: 'getContractTxsPerAddress',
      args: [contract, account],
    }),
  ]);

  return {
    ...baseConfig,
    account,
    accountMints,
    accountTxs,
  };
}

async function readReleaseCollectionSupply(
  publicClient: PublicClient,
  contract: Address,
): Promise<ReleaseConfig['supply']> {
  const [totalSupply, maxTokens, mintConfig] = await Promise.all([
    readOptionalContract(publicClient, {
      address: contract,
      abi: tokenAbi,
      functionName: 'totalSupply',
      args: [],
    }),
    readOptionalContract(publicClient, {
      address: contract,
      abi: tokenAbi,
      functionName: 'maxTokens',
      args: [],
    }),
    readOptionalContract(publicClient, {
      address: contract,
      abi: collectionOwnerAbi,
      functionName: 'getMintConfig',
      args: [],
    }),
  ]);

  if (totalSupply === undefined && maxTokens === undefined && mintConfig === undefined) {
    return undefined;
  }

  return shapeReleaseCollectionSupply({
    totalSupply,
    maxTokens,
    preparedTokenCount: mintConfig?.numberOfTokens,
  });
}

async function readOptionalContract<T>(
  _publicClient: PublicClient,
  read: () => Promise<T>,
): Promise<T | undefined>;
async function readOptionalContract<T>(
  publicClient: PublicClient,
  params: Parameters<PublicClient['readContract']>[0],
): Promise<T | undefined>;
async function readOptionalContract<T>(
  publicClient: PublicClient,
  input: Parameters<PublicClient['readContract']>[0] | (() => Promise<T>),
): Promise<T | undefined> {
  try {
    if (typeof input === 'function') {
      return await input();
    }
    return await publicClient.readContract(input) as T;
  } catch {
    return undefined;
  }
}

async function writeMintDirectSale(
  opts: {
    publicClient: PublicClient;
    walletClient: NonNullable<RareClientConfig['walletClient']>;
    account: ReturnType<typeof requireWallet>['account'];
    minterAddress: Address;
    mint: ReturnType<typeof preflightReleaseDirectSaleMint>;
    value: bigint;
  },
): Promise<Hash> {
  await opts.publicClient.simulateContract({
    address: opts.minterAddress,
    abi: rareMinterAbi,
    functionName: 'mintDirectSale',
    args: [
      opts.mint.contract,
      opts.mint.currency,
      opts.mint.price,
      opts.mint.quantity,
      opts.mint.proof,
    ],
    account: opts.account,
    value: opts.value,
  });

  return opts.walletClient.writeContract({
    address: opts.minterAddress,
    abi: rareMinterAbi,
    functionName: 'mintDirectSale',
    args: [
      opts.mint.contract,
      opts.mint.currency,
      opts.mint.price,
      opts.mint.quantity,
      opts.mint.proof,
    ],
    account: opts.account,
    chain: undefined,
    value: opts.value,
  });
}

function buildTokenIdRange(start: bigint, end: bigint): bigint[] {
  const tokenIds: bigint[] = [];
  for (let tokenId = start; tokenId <= end; tokenId += 1n) {
    tokenIds.push(tokenId);
  }
  return tokenIds;
}

async function writeSetAllowlistConfig(
  opts: {
    publicClient: PublicClient;
    walletClient: NonNullable<RareClientConfig['walletClient']>;
    account: ReturnType<typeof requireWallet>['account'];
    minterAddress: Address;
    plan: ReturnType<typeof planReleaseAllowlistConfig>;
  },
): Promise<Hash> {
  await opts.publicClient.simulateContract({
    address: opts.minterAddress,
    abi: rareMinterAbi,
    functionName: 'setContractAllowListConfig',
    args: [opts.plan.root, opts.plan.endTimestamp, opts.plan.contract],
    account: opts.account,
  });

  return opts.walletClient.writeContract({
    address: opts.minterAddress,
    abi: rareMinterAbi,
    functionName: 'setContractAllowListConfig',
    args: [opts.plan.root, opts.plan.endTimestamp, opts.plan.contract],
    account: opts.account,
    chain: undefined,
  });
}

async function writeSetMintLimit(
  opts: {
    publicClient: PublicClient;
    walletClient: NonNullable<RareClientConfig['walletClient']>;
    account: ReturnType<typeof requireWallet>['account'];
    minterAddress: Address;
    contract: Address;
    limit: bigint;
  },
): Promise<Hash> {
  await opts.publicClient.simulateContract({
    address: opts.minterAddress,
    abi: rareMinterAbi,
    functionName: 'setContractMintLimit',
    args: [opts.contract, opts.limit],
    account: opts.account,
  });

  return opts.walletClient.writeContract({
    address: opts.minterAddress,
    abi: rareMinterAbi,
    functionName: 'setContractMintLimit',
    args: [opts.contract, opts.limit],
    account: opts.account,
    chain: undefined,
  });
}

async function writeSetTxLimit(
  opts: {
    publicClient: PublicClient;
    walletClient: NonNullable<RareClientConfig['walletClient']>;
    account: ReturnType<typeof requireWallet>['account'];
    minterAddress: Address;
    contract: Address;
    limit: bigint;
  },
): Promise<Hash> {
  await opts.publicClient.simulateContract({
    address: opts.minterAddress,
    abi: rareMinterAbi,
    functionName: 'setContractTxLimit',
    args: [opts.contract, opts.limit],
    account: opts.account,
  });

  return opts.walletClient.writeContract({
    address: opts.minterAddress,
    abi: rareMinterAbi,
    functionName: 'setContractTxLimit',
    args: [opts.contract, opts.limit],
    account: opts.account,
    chain: undefined,
  });
}

async function writeSetSellerStakingMinimum(
  opts: {
    publicClient: PublicClient;
    walletClient: NonNullable<RareClientConfig['walletClient']>;
    account: ReturnType<typeof requireWallet>['account'];
    minterAddress: Address;
    plan: ReturnType<typeof planReleaseSellerStakingMinimum>;
  },
): Promise<Hash> {
  await opts.publicClient.simulateContract({
    address: opts.minterAddress,
    abi: rareMinterAbi,
    functionName: 'setContractSellerStakingMinimum',
    args: [opts.plan.contract, opts.plan.minimum, opts.plan.endTimestamp],
    account: opts.account,
  });

  return opts.walletClient.writeContract({
    address: opts.minterAddress,
    abi: rareMinterAbi,
    functionName: 'setContractSellerStakingMinimum',
    args: [opts.plan.contract, opts.plan.minimum, opts.plan.endTimestamp],
    account: opts.account,
    chain: undefined,
  });
}
