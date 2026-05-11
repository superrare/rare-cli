import { type Address, type Hash, type PublicClient, parseEventLogs } from 'viem';
import { sovereignFactoryAbi } from '../contracts/abis/sovereign-factory.js';
import { lazySovereignFactoryAbi } from '../contracts/abis/lazy-sovereign-factory.js';
import { collectionMintAbi } from '../contracts/abis/collection-mint.js';
import { requireContractAddress, type SupportedChain } from '../contracts/addresses.js';
import type { RareClientConfig, RareClient } from './types.js';
import { requireWallet } from './helpers.js';
import {
  buildCollectionMintBatchWrite,
  buildCollectionPrepareLazyMintWrite,
  buildCreateLazySovereignCollectionWrite,
  buildCreateSovereignCollectionWrite,
  planCollectionMintBatch,
  planCollectionPrepareLazyMint,
  planCreateLazySovereignCollection,
  planCreateSovereignCollection,
} from './collection-core.js';

export function createCollectionNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  chain: SupportedChain,
  baseCollection: Pick<RareClient['collection'], 'get' | 'events'>,
): RareClient['collection'] {
  return {
    ...baseCollection,

    async createSovereign(params) {
      const plan = planCreateSovereignCollection(params);
      const factoryAddress = requireContractAddress(chain, 'sovereignFactory');
      const { walletClient, account } = requireWallet(config);
      const txHash = await writeCreateSovereignCollection({
        publicClient,
        walletClient,
        account,
        factoryAddress,
        plan,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: sovereignFactoryAbi,
        logs: receipt.logs,
        eventName: 'SovereignNFTContractCreated',
      });
      const [createdLog] = logs;

      if (!createdLog) {
        throw new Error('Sovereign collection transaction succeeded but SovereignNFTContractCreated was not found in logs.');
      }

      return {
        txHash,
        receipt,
        contract: createdLog.args.contractAddress,
        factory: factoryAddress,
        contractType: plan.contractType,
      };
    },

    async createLazySovereign(params) {
      const plan = planCreateLazySovereignCollection(params);
      const factoryAddress = requireContractAddress(chain, 'lazySovereignFactory');
      const { walletClient, account } = requireWallet(config);
      const contractType = await publicClient.readContract({
        address: factoryAddress,
        abi: lazySovereignFactoryAbi,
        functionName: plan.contractTypeReadName,
      });
      const write = buildCreateLazySovereignCollectionWrite(plan, contractType);
      const txHash = await walletClient.writeContract({
        address: factoryAddress,
        abi: lazySovereignFactoryAbi,
        functionName: write.functionName,
        args: write.args,
        account,
        chain: undefined,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: lazySovereignFactoryAbi,
        logs: receipt.logs,
        eventName: 'SovereignNFTContractCreated',
      });
      const [createdLog] = logs;

      if (!createdLog) {
        throw new Error('Lazy Sovereign collection transaction succeeded but SovereignNFTContractCreated was not found in logs.');
      }

      return {
        txHash,
        receipt,
        contract: createdLog.args.contractAddress,
        factory: factoryAddress,
        contractType: plan.contractType,
        nextStep: 'Configure release sale and mint settings for this collection before collector minting.',
      };
    },

    async mintBatch(params) {
      const plan = planCollectionMintBatch(params);
      const { walletClient, account } = requireWallet(config);
      const txHash = await writeCollectionBatchMint({
        publicClient,
        walletClient,
        account,
        plan,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: collectionMintAbi,
        logs: receipt.logs,
        eventName: 'ConsecutiveTransfer',
      });
      const [mintLog] = logs;

      if (!mintLog) {
        throw new Error('Batch mint transaction succeeded but ConsecutiveTransfer was not found in logs.');
      }

      return {
        txHash,
        receipt,
        contract: plan.contract,
        baseUri: plan.baseUri,
        tokenCount: plan.tokenCount,
        fromTokenId: mintLog.args.fromTokenId,
        toTokenId: mintLog.args.toTokenId,
        owner: mintLog.args.toAddress,
      };
    },

    async prepareLazyMint(params) {
      const plan = planCollectionPrepareLazyMint(params);
      const { walletClient, account } = requireWallet(config);
      const txHash = await writeCollectionPrepareLazyMint({
        publicClient,
        walletClient,
        account,
        plan,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: collectionMintAbi,
        logs: receipt.logs,
        eventName: 'PrepareMint',
      });
      const [prepareLog] = logs;

      if (!prepareLog) {
        throw new Error('Lazy prepare mint transaction succeeded but PrepareMint was not found in logs.');
      }

      if (plan.minter === undefined) {
        return {
          txHash,
          receipt,
          contract: plan.contract,
          baseUri: prepareLog.args.baseURI,
          tokenCount: prepareLog.args.numberOfTokens,
        };
      }

      return {
        txHash,
        receipt,
        contract: plan.contract,
        baseUri: prepareLog.args.baseURI,
        tokenCount: prepareLog.args.numberOfTokens,
        minter: plan.minter,
      };
    },
  };
}

async function writeCreateSovereignCollection(
  opts: {
    publicClient: PublicClient;
    walletClient: NonNullable<RareClientConfig['walletClient']>;
    account: ReturnType<typeof requireWallet>['account'];
    factoryAddress: Address;
    plan: ReturnType<typeof planCreateSovereignCollection>;
  },
): Promise<Hash> {
  if (opts.plan.maxTokens === undefined) {
    const write = buildCreateSovereignCollectionWrite(opts.plan);
    return opts.walletClient.writeContract({
      address: opts.factoryAddress,
      abi: sovereignFactoryAbi,
      functionName: write.functionName,
      args: write.args,
      account: opts.account,
      chain: undefined,
    });
  }

  if (opts.plan.contractTypeReadName === undefined) {
    const write = buildCreateSovereignCollectionWrite(opts.plan);
    return opts.walletClient.writeContract({
      address: opts.factoryAddress,
      abi: sovereignFactoryAbi,
      functionName: write.functionName,
      args: write.args,
      account: opts.account,
      chain: undefined,
    });
  }

  const contractType = await opts.publicClient.readContract({
    address: opts.factoryAddress,
    abi: sovereignFactoryAbi,
    functionName: opts.plan.contractTypeReadName,
  });

  const write = buildCreateSovereignCollectionWrite(opts.plan, contractType);
  return opts.walletClient.writeContract({
    address: opts.factoryAddress,
    abi: sovereignFactoryAbi,
    functionName: write.functionName,
    args: write.args,
    account: opts.account,
    chain: undefined,
  });
}

async function writeCollectionBatchMint(
  opts: {
    publicClient: PublicClient;
    walletClient: NonNullable<RareClientConfig['walletClient']>;
    account: ReturnType<typeof requireWallet>['account'];
    plan: ReturnType<typeof planCollectionMintBatch>;
  },
): Promise<Hash> {
  const write = buildCollectionMintBatchWrite(opts.plan);
  await opts.publicClient.simulateContract({
    address: opts.plan.contract,
    abi: collectionMintAbi,
    functionName: write.functionName,
    args: write.args,
    account: opts.account,
  });

  return opts.walletClient.writeContract({
    address: opts.plan.contract,
    abi: collectionMintAbi,
    functionName: write.functionName,
    args: write.args,
    account: opts.account,
    chain: undefined,
  });
}

async function writeCollectionPrepareLazyMint(
  opts: {
    publicClient: PublicClient;
    walletClient: NonNullable<RareClientConfig['walletClient']>;
    account: ReturnType<typeof requireWallet>['account'];
    plan: ReturnType<typeof planCollectionPrepareLazyMint>;
  },
): Promise<Hash> {
  const write = buildCollectionPrepareLazyMintWrite(opts.plan);
  await opts.publicClient.simulateContract({
    address: opts.plan.contract,
    abi: collectionMintAbi,
    functionName: write.functionName,
    args: write.args,
    account: opts.account,
  });

  return opts.walletClient.writeContract({
    address: opts.plan.contract,
    abi: collectionMintAbi,
    functionName: write.functionName,
    args: write.args,
    account: opts.account,
    chain: undefined,
  });
}
