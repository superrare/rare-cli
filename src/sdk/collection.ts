import { type Address, type Hash, type PublicClient, parseEventLogs } from 'viem';
import { sovereignFactoryAbi } from '../contracts/abis/sovereign-factory.js';
import { lazySovereignFactoryAbi } from '../contracts/abis/lazy-sovereign-factory.js';
import { collectionMintAbi } from '../contracts/abis/collection-mint.js';
import { collectionOwnerAbi } from '../contracts/abis/collection-owner.js';
import { requireContractAddress, type SupportedChain } from '../contracts/addresses.js';
import type { RareClientConfig, RareClient } from './types.js';
import { requireWallet } from './helpers.js';
import {
  buildCollectionMintBatchWrite,
  buildCollectionPrepareLazyMintWrite,
  buildCreateLazySovereignCollectionWrite,
  buildCreateSovereignCollectionWrite,
  planCollectionBaseUri,
  planCollectionContract,
  planCollectionMintBatch,
  planCollectionPrepareLazyMint,
  planCollectionReceiver,
  planCollectionRoyaltyInfo,
  planCollectionToken,
  planCollectionTokenReceiver,
  planCollectionTokenUri,
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

    async createSovereign(params): ReturnType<RareClient['collection']['createSovereign']> {
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

    async createLazySovereign(params): ReturnType<RareClient['collection']['createLazySovereign']> {
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
        nextStep: 'Configure lazy-sale mint settings for this collection before collector minting.',
      };
    },

    async mintBatch(params): ReturnType<RareClient['collection']['mintBatch']> {
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

    async prepareLazyMint(params): ReturnType<RareClient['collection']['prepareLazyMint']> {
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

    async getTokenCreator(params): ReturnType<RareClient['collection']['getTokenCreator']> {
      const plan = planCollectionToken(params);
      const creator = await readTokenCreator(publicClient, plan.contract, plan.tokenId);
      return {
        contract: plan.contract,
        tokenId: plan.tokenId,
        creator,
      };
    },

    async getRoyaltyInfo(params): ReturnType<RareClient['collection']['getRoyaltyInfo']> {
      const plan = planCollectionRoyaltyInfo(params);
      const [receiver, royaltyAmount] = await readRoyaltyInfo(
        publicClient,
        plan.contract,
        plan.tokenId,
        plan.salePrice,
      );
      const defaultRoyalty = await readDefaultRoyalty(publicClient, plan.contract);

      return {
        contract: plan.contract,
        tokenId: plan.tokenId,
        salePrice: plan.salePrice,
        receiver,
        royaltyAmount,
        ...defaultRoyalty,
      };
    },

    async setDefaultRoyaltyReceiver(params): ReturnType<RareClient['collection']['setDefaultRoyaltyReceiver']> {
      const plan = planCollectionReceiver(params);
      const { walletClient, account } = requireWallet(config);
      const txHash = await writeSetDefaultRoyaltyReceiver({
        publicClient,
        walletClient,
        account,
        plan,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      return {
        txHash,
        receipt,
        contract: plan.contract,
        receiver: plan.receiver,
      };
    },

    async setTokenRoyaltyReceiver(params): ReturnType<RareClient['collection']['setTokenRoyaltyReceiver']> {
      const plan = planCollectionTokenReceiver(params);
      const { walletClient, account } = requireWallet(config);
      const txHash = await writeSetTokenRoyaltyReceiver({
        publicClient,
        walletClient,
        account,
        plan,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      return {
        txHash,
        receipt,
        contract: plan.contract,
        tokenId: plan.tokenId,
        receiver: plan.receiver,
      };
    },

    async getMintConfig(params): ReturnType<RareClient['collection']['getMintConfig']> {
      const plan = planCollectionContract(params);
      const mintConfig = await readMintConfig(publicClient, plan.contract);
      return {
        contract: plan.contract,
        tokenCount: mintConfig.numberOfTokens,
        baseUri: mintConfig.baseURI,
        lockedMetadata: mintConfig.lockedMetadata,
      };
    },

    async updateBaseUri(params): ReturnType<RareClient['collection']['updateBaseUri']> {
      const plan = planCollectionBaseUri(params);
      const { walletClient, account } = requireWallet(config);
      const txHash = await writeUpdateBaseUri({
        publicClient,
        walletClient,
        account,
        plan,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: collectionOwnerAbi,
        logs: receipt.logs,
        eventName: 'MetadataUpdated',
      });
      const [metadataLog] = logs;

      return {
        txHash,
        receipt,
        contract: plan.contract,
        baseUri: metadataLog?.args.baseURI ?? plan.baseUri,
      };
    },

    async updateTokenUri(params): ReturnType<RareClient['collection']['updateTokenUri']> {
      const plan = planCollectionTokenUri(params);
      const { walletClient, account } = requireWallet(config);
      const txHash = await writeUpdateTokenUri({
        publicClient,
        walletClient,
        account,
        plan,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: collectionOwnerAbi,
        logs: receipt.logs,
        eventName: 'TokenURIUpdated',
      });
      const [metadataLog] = logs;

      return {
        txHash,
        receipt,
        contract: plan.contract,
        tokenId: metadataLog?.args.tokenId ?? plan.tokenId,
        tokenUri: metadataLog?.args.metadataUri ?? plan.tokenUri,
      };
    },

    async lockBaseUri(params): ReturnType<RareClient['collection']['lockBaseUri']> {
      const plan = planCollectionContract(params);
      const { walletClient, account } = requireWallet(config);
      const txHash = await writeLockBaseUri({
        publicClient,
        walletClient,
        account,
        plan,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: collectionOwnerAbi,
        logs: receipt.logs,
        eventName: 'MetadataLocked',
      });
      const [metadataLog] = logs;

      return {
        txHash,
        receipt,
        contract: plan.contract,
        baseUri: metadataLog?.args.baseURI ?? '',
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

async function readTokenCreator(
  publicClient: PublicClient,
  contract: Address,
  tokenId: bigint,
): Promise<Address> {
  try {
    return await publicClient.readContract({
      address: contract,
      abi: collectionOwnerAbi,
      functionName: 'tokenCreator',
      args: [tokenId],
    });
  } catch (error) {
    throw contractSupportError('tokenCreator', contract, error);
  }
}

async function readRoyaltyInfo(
  publicClient: PublicClient,
  contract: Address,
  tokenId: bigint,
  salePrice: bigint,
): Promise<readonly [Address, bigint]> {
  try {
    return await publicClient.readContract({
      address: contract,
      abi: collectionOwnerAbi,
      functionName: 'royaltyInfo',
      args: [tokenId, salePrice],
    });
  } catch (error) {
    throw contractSupportError('royaltyInfo', contract, error);
  }
}

async function readDefaultRoyalty(
  publicClient: PublicClient,
  contract: Address,
): Promise<{ defaultReceiver?: Address; defaultPercentage?: bigint }> {
  const defaultReceiver = await readOptionalDefaultRoyaltyReceiver(publicClient, contract);
  const defaultPercentage = await readOptionalDefaultRoyaltyPercentage(publicClient, contract);

  return {
    ...(defaultReceiver === undefined ? {} : { defaultReceiver }),
    ...(defaultPercentage === undefined ? {} : { defaultPercentage }),
  };
}

async function readOptionalDefaultRoyaltyReceiver(
  publicClient: PublicClient,
  contract: Address,
): Promise<Address | undefined> {
  try {
    return await publicClient.readContract({
      address: contract,
      abi: collectionOwnerAbi,
      functionName: 'getDefaultRoyaltyReceiver',
    });
  } catch {
    return undefined;
  }
}

async function readOptionalDefaultRoyaltyPercentage(
  publicClient: PublicClient,
  contract: Address,
): Promise<bigint | undefined> {
  try {
    return await publicClient.readContract({
      address: contract,
      abi: collectionOwnerAbi,
      functionName: 'getDefaultRoyaltyPercentage',
    });
  } catch {
    return undefined;
  }
}

async function readMintConfig(
  publicClient: PublicClient,
  contract: Address,
): Promise<{ numberOfTokens: bigint; baseURI: string; lockedMetadata: boolean }> {
  try {
    return await publicClient.readContract({
      address: contract,
      abi: collectionOwnerAbi,
      functionName: 'getMintConfig',
    });
  } catch (error) {
    throw contractSupportError('getMintConfig', contract, error);
  }
}

async function writeSetDefaultRoyaltyReceiver(
  opts: {
    publicClient: PublicClient;
    walletClient: NonNullable<RareClientConfig['walletClient']>;
    account: ReturnType<typeof requireWallet>['account'];
    plan: ReturnType<typeof planCollectionReceiver>;
  },
): Promise<Hash> {
  try {
    await opts.publicClient.simulateContract({
      address: opts.plan.contract,
      abi: collectionOwnerAbi,
      functionName: 'setDefaultRoyaltyReceiver',
      args: [opts.plan.receiver],
      account: opts.account,
    });
  } catch (error) {
    throw contractSupportError('setDefaultRoyaltyReceiver', opts.plan.contract, error);
  }

  return opts.walletClient.writeContract({
    address: opts.plan.contract,
    abi: collectionOwnerAbi,
    functionName: 'setDefaultRoyaltyReceiver',
    args: [opts.plan.receiver],
    account: opts.account,
    chain: undefined,
  });
}

async function writeSetTokenRoyaltyReceiver(
  opts: {
    publicClient: PublicClient;
    walletClient: NonNullable<RareClientConfig['walletClient']>;
    account: ReturnType<typeof requireWallet>['account'];
    plan: ReturnType<typeof planCollectionTokenReceiver>;
  },
): Promise<Hash> {
  try {
    await opts.publicClient.simulateContract({
      address: opts.plan.contract,
      abi: collectionOwnerAbi,
      functionName: 'setRoyaltyReceiverForToken',
      args: [opts.plan.receiver, opts.plan.tokenId],
      account: opts.account,
    });
  } catch (error) {
    throw contractSupportError('setRoyaltyReceiverForToken', opts.plan.contract, error);
  }

  return opts.walletClient.writeContract({
    address: opts.plan.contract,
    abi: collectionOwnerAbi,
    functionName: 'setRoyaltyReceiverForToken',
    args: [opts.plan.receiver, opts.plan.tokenId],
    account: opts.account,
    chain: undefined,
  });
}

async function writeUpdateBaseUri(
  opts: {
    publicClient: PublicClient;
    walletClient: NonNullable<RareClientConfig['walletClient']>;
    account: ReturnType<typeof requireWallet>['account'];
    plan: ReturnType<typeof planCollectionBaseUri>;
  },
): Promise<Hash> {
  try {
    await opts.publicClient.simulateContract({
      address: opts.plan.contract,
      abi: collectionOwnerAbi,
      functionName: 'updateBaseURI',
      args: [opts.plan.baseUri],
      account: opts.account,
    });
  } catch (error) {
    throw contractSupportError('updateBaseURI', opts.plan.contract, error);
  }

  return opts.walletClient.writeContract({
    address: opts.plan.contract,
    abi: collectionOwnerAbi,
    functionName: 'updateBaseURI',
    args: [opts.plan.baseUri],
    account: opts.account,
    chain: undefined,
  });
}

async function writeUpdateTokenUri(
  opts: {
    publicClient: PublicClient;
    walletClient: NonNullable<RareClientConfig['walletClient']>;
    account: ReturnType<typeof requireWallet>['account'];
    plan: ReturnType<typeof planCollectionTokenUri>;
  },
): Promise<Hash> {
  try {
    await opts.publicClient.simulateContract({
      address: opts.plan.contract,
      abi: collectionOwnerAbi,
      functionName: 'updateTokenURI',
      args: [opts.plan.tokenId, opts.plan.tokenUri],
      account: opts.account,
    });
  } catch (error) {
    throw contractSupportError('updateTokenURI', opts.plan.contract, error);
  }

  return opts.walletClient.writeContract({
    address: opts.plan.contract,
    abi: collectionOwnerAbi,
    functionName: 'updateTokenURI',
    args: [opts.plan.tokenId, opts.plan.tokenUri],
    account: opts.account,
    chain: undefined,
  });
}

async function writeLockBaseUri(
  opts: {
    publicClient: PublicClient;
    walletClient: NonNullable<RareClientConfig['walletClient']>;
    account: ReturnType<typeof requireWallet>['account'];
    plan: ReturnType<typeof planCollectionContract>;
  },
): Promise<Hash> {
  try {
    await opts.publicClient.simulateContract({
      address: opts.plan.contract,
      abi: collectionOwnerAbi,
      functionName: 'lockBaseURI',
      account: opts.account,
    });
  } catch (error) {
    throw contractSupportError('lockBaseURI', opts.plan.contract, error);
  }

  return opts.walletClient.writeContract({
    address: opts.plan.contract,
    abi: collectionOwnerAbi,
    functionName: 'lockBaseURI',
    account: opts.account,
    chain: undefined,
  });
}

function contractSupportError(operation: string, contract: Address, cause: unknown): Error {
  return new Error(
    `Collection ${contract} does not support ${operation}, or the ${operation} preflight failed.`,
    { cause },
  );
}
