import { type Address, type Hash, type PublicClient } from 'viem';
import { rareMinterAbi } from '../contracts/abis/rare-minter.js';
import { requireContractAddress, type SupportedChain } from '../contracts/addresses.js';
import { requireWallet } from './helpers.js';
import type { RareClient, RareClientConfig, ReleaseConfig } from './types.js';
import {
  assertReleaseAllowlistConfigWriteMatches,
  assertReleaseLimitWriteMatches,
  assertReleaseSellerStakingMinimumWriteMatches,
  buildReleaseAllowlistArtifact,
  getReleaseAllowlistProof,
  planReleaseAllowlistConfig,
  planReleaseMintLimit,
  planReleaseSellerStakingMinimum,
  planReleaseTxLimit,
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
    allowlist,
    mintLimit,
    txLimit,
    sellerStakingMinimum,
  ] = await Promise.all([
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
  ]);

  if (account === undefined) {
    return {
      contract,
      minter: minterAddress,
      allowlistRoot: allowlist.root,
      allowlistEndTimestamp: allowlist.endTimestamp,
      mintLimit,
      txLimit,
      sellerStakingMinimum: sellerStakingMinimum.amount,
      sellerStakingMinimumEndTimestamp: sellerStakingMinimum.endTimestamp,
    };
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
    contract,
    minter: minterAddress,
    allowlistRoot: allowlist.root,
    allowlistEndTimestamp: allowlist.endTimestamp,
    mintLimit,
    txLimit,
    sellerStakingMinimum: sellerStakingMinimum.amount,
    sellerStakingMinimumEndTimestamp: sellerStakingMinimum.endTimestamp,
    account,
    accountMints,
    accountTxs,
  };
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
