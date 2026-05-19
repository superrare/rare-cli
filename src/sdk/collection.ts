import { type Address, type Hash, type PublicClient, parseEventLogs } from 'viem';
import { lazySovereignFactoryAbi } from '../contracts/abis/lazy-sovereign-factory.js';
import { collectionMintAbi } from '../contracts/abis/collection-mint.js';
import { collectionOwnerAbi } from '../contracts/abis/collection-owner.js';
import { royaltyRegistryAbi, royaltyRegistryResolverAbi } from '../contracts/abis/royalty-registry.js';
import { requireContractAddress, type SupportedChain } from '../contracts/addresses.js';
import type { RareClientConfig } from './types/client.js';
import type { CollectionNamespace } from './types/collection.js';
import { requireWallet } from './wallet-shell.js';
import {
  buildCollectionRoyaltyRegistryContractPercentageWrite,
  buildCollectionRoyaltyRegistryContractReceiverWrite,
  buildCollectionMintBatchWrite,
  buildCollectionPrepareLazyMintWrite,
  buildCollectionRoyaltyRegistryReceiverOverrideWrite,
  buildCollectionRoyaltyRegistryTokenReceiverWrite,
  buildCreateLazySovereignCollectionWrite,
  planCollectionBaseUri,
  planCollectionContract,
  planCollectionMintBatch,
  planCollectionPrepareLazyMint,
  planCollectionReceiver,
  planCollectionRoyaltyRegistryContractPercentage,
  planCollectionRoyaltyRegistryContractReceiver,
  planCollectionRoyaltyRegistryReceiverOverride,
  planCollectionRoyaltyRegistryStatus,
  planCollectionRoyaltyRegistryTokenReceiver,
  planCollectionRoyaltyInfo,
  planCollectionToken,
  planCollectionTokenReceiver,
  planCollectionTokenUri,
  planCreateLazySovereignCollection,
  shapeCollectionPrepareMintEvent,
  shapeCollectionRoyaltyRegistryStatus,
  type CollectionRoyaltyRegistryStatusRead,
} from './collection-core.js';

export type * from './types/collection.js';

export function createCollectionNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  chain: SupportedChain,
  baseCollection: Pick<CollectionNamespace, 'get'>,
  collectionDeploy: Pick<CollectionNamespace['deploy'], 'erc721' | 'lazyBatchMint'>,
  collectionMint: CollectionNamespace['mint'],
): CollectionNamespace {
  return {
    ...baseCollection,
    mint: collectionMint,

    deploy: {
      ...collectionDeploy,

      async lazyErc721(params): ReturnType<CollectionNamespace['deploy']['lazyErc721']> {
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
          throw new Error('Lazy ERC-721 collection transaction succeeded but SovereignNFTContractCreated was not found in logs.');
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
    },

    async mintBatch(params): ReturnType<CollectionNamespace['mintBatch']> {
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

    async prepareLazyMint(params): ReturnType<CollectionNamespace['prepareLazyMint']> {
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

      const prepared = shapeCollectionPrepareMintEvent(prepareLog.args);
      if (plan.minter === undefined) {
        return {
          txHash,
          receipt,
          contract: plan.contract,
          ...prepared,
        };
      }

      return {
        txHash,
        receipt,
        contract: plan.contract,
        ...prepared,
        minter: plan.minter,
      };
    },

    async getTokenCreator(params): ReturnType<CollectionNamespace['getTokenCreator']> {
      const plan = planCollectionToken(params);
      const creator = await readTokenCreator(publicClient, plan.contract, plan.tokenId);
      return {
        contract: plan.contract,
        tokenId: plan.tokenId,
        creator,
      };
    },

    royalty: {
      async status(params): ReturnType<CollectionNamespace['royalty']['status']> {
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

      registry: {
        async status(params): ReturnType<CollectionNamespace['royalty']['registry']['status']> {
          const plan = planCollectionRoyaltyRegistryStatus(params);
          const registry = await resolveRoyaltyRegistryAddress(publicClient, chain, plan.registry);
          const read = await readRoyaltyRegistryStatus(publicClient, registry, plan);

          return shapeCollectionRoyaltyRegistryStatus({ ...plan, registry }, read);
        },
      },
    },

    async setDefaultRoyaltyReceiver(params): ReturnType<CollectionNamespace['setDefaultRoyaltyReceiver']> {
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

    async setTokenRoyaltyReceiver(params): ReturnType<CollectionNamespace['setTokenRoyaltyReceiver']> {
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

    async setRoyaltyRegistryReceiverOverride(
      params,
    ): ReturnType<CollectionNamespace['setRoyaltyRegistryReceiverOverride']> {
      const plan = planCollectionRoyaltyRegistryReceiverOverride(params);
      const registry = await resolveRoyaltyRegistryAddress(publicClient, chain, plan.registry);
      const { walletClient, account } = requireWallet(config);
      const txHash = await writeRoyaltyRegistryReceiverOverride({
        publicClient,
        walletClient,
        account,
        registry,
        plan,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      return {
        txHash,
        receipt,
        registry,
        receiver: plan.receiver,
      };
    },

    async setRoyaltyRegistryContractReceiver(
      params,
    ): ReturnType<CollectionNamespace['setRoyaltyRegistryContractReceiver']> {
      const plan = planCollectionRoyaltyRegistryContractReceiver(params);
      const registry = await resolveRoyaltyRegistryAddress(publicClient, chain, plan.registry);
      const { walletClient, account } = requireWallet(config);
      const txHash = await writeRoyaltyRegistryContractReceiver({
        publicClient,
        walletClient,
        account,
        registry,
        plan,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      return {
        txHash,
        receipt,
        registry,
        contract: plan.contract,
        receiver: plan.receiver,
      };
    },

    async setRoyaltyRegistryTokenReceiver(
      params,
    ): ReturnType<CollectionNamespace['setRoyaltyRegistryTokenReceiver']> {
      const plan = planCollectionRoyaltyRegistryTokenReceiver(params);
      const registry = await resolveRoyaltyRegistryAddress(publicClient, chain, plan.registry);
      const { walletClient, account } = requireWallet(config);
      const txHash = await writeRoyaltyRegistryTokenReceiver({
        publicClient,
        walletClient,
        account,
        registry,
        plan,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      return {
        txHash,
        receipt,
        registry,
        contract: plan.contract,
        tokenId: plan.tokenId,
        receiver: plan.receiver,
      };
    },

    async setRoyaltyRegistryContractPercentage(
      params,
    ): ReturnType<CollectionNamespace['setRoyaltyRegistryContractPercentage']> {
      const plan = planCollectionRoyaltyRegistryContractPercentage(params);
      const registry = await resolveRoyaltyRegistryAddress(publicClient, chain, plan.registry);
      const { walletClient, account } = requireWallet(config);
      const txHash = await writeRoyaltyRegistryContractPercentage({
        publicClient,
        walletClient,
        account,
        registry,
        plan,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      return {
        txHash,
        receipt,
        registry,
        contract: plan.contract,
        percentage: plan.percentage,
      };
    },

    metadata: {
      async status(params): ReturnType<CollectionNamespace['metadata']['status']> {
        const plan = planCollectionContract(params);
        const mintConfig = await readMintConfig(publicClient, plan.contract);
        return {
          contract: plan.contract,
          tokenCount: mintConfig.numberOfTokens,
          baseUri: mintConfig.baseURI,
          lockedMetadata: mintConfig.lockedMetadata,
        };
      },
    },

    async updateBaseUri(params): ReturnType<CollectionNamespace['updateBaseUri']> {
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

    async updateTokenUri(params): ReturnType<CollectionNamespace['updateTokenUri']> {
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

    async lockBaseUri(params): ReturnType<CollectionNamespace['lockBaseUri']> {
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

async function resolveRoyaltyRegistryAddress(
  publicClient: PublicClient,
  chain: SupportedChain,
  registry: Address | undefined,
): Promise<Address> {
  if (registry !== undefined) {
    return registry;
  }

  const bazaar = requireContractAddress(chain, 'auction');
  try {
    return await publicClient.readContract({
      address: bazaar,
      abi: royaltyRegistryResolverAbi,
      functionName: 'royaltyRegistry',
    });
  } catch (error) {
    throw new Error(
      `Unable to resolve royalty registry from RARE Protocol marketplace ${bazaar} on "${chain}". Pass --registry to use a registry address directly.`,
      { cause: error },
    );
  }
}

async function readRoyaltyRegistryStatus(
  publicClient: PublicClient,
  registry: Address,
  plan: ReturnType<typeof planCollectionRoyaltyRegistryStatus>,
): Promise<CollectionRoyaltyRegistryStatusRead> {
  try {
    const [
      creatorRegistry,
      receiver,
      royaltyPercentage,
      royaltyAmount,
      contractPercentageSet,
      contractPercentage,
      contractReceiver,
      tokenReceiver,
    ] = await Promise.all([
      publicClient.readContract({
        address: registry,
        abi: royaltyRegistryAbi,
        functionName: 'iERC721TokenCreator',
      }),
      publicClient.readContract({
        address: registry,
        abi: royaltyRegistryAbi,
        functionName: 'tokenCreator',
        args: [plan.contract, plan.tokenId],
      }),
      publicClient.readContract({
        address: registry,
        abi: royaltyRegistryAbi,
        functionName: 'getERC721TokenRoyaltyPercentage',
        args: [plan.contract, plan.tokenId],
      }),
      publicClient.readContract({
        address: registry,
        abi: royaltyRegistryAbi,
        functionName: 'calculateRoyaltyFee',
        args: [plan.contract, plan.tokenId, plan.salePrice],
      }),
      publicClient.readContract({
        address: registry,
        abi: royaltyRegistryAbi,
        functionName: 'contractRoyaltyPercentageSet',
        args: [plan.contract],
      }),
      publicClient.readContract({
        address: registry,
        abi: royaltyRegistryAbi,
        functionName: 'contractRoyaltyPercentage',
        args: [plan.contract],
      }),
      publicClient.readContract({
        address: registry,
        abi: royaltyRegistryAbi,
        functionName: 'contractRoyaltyReceiver',
        args: [plan.contract],
      }),
      publicClient.readContract({
        address: registry,
        abi: royaltyRegistryAbi,
        functionName: 'tokenRoyaltyReceiver',
        args: [plan.contract, plan.tokenId],
      }),
    ]);

    return {
      creatorRegistry,
      receiver,
      royaltyPercentage,
      royaltyAmount,
      contractPercentageSet,
      contractPercentage,
      contractReceiver,
      tokenReceiver,
    };
  } catch (error) {
    throw royaltyRegistrySupportError('read status', registry, error);
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

async function writeRoyaltyRegistryReceiverOverride(
  opts: {
    publicClient: PublicClient;
    walletClient: NonNullable<RareClientConfig['walletClient']>;
    account: ReturnType<typeof requireWallet>['account'];
    registry: Address;
    plan: ReturnType<typeof planCollectionRoyaltyRegistryReceiverOverride>;
  },
): Promise<Hash> {
  const write = buildCollectionRoyaltyRegistryReceiverOverrideWrite(opts.plan);
  try {
    await opts.publicClient.simulateContract({
      address: opts.registry,
      abi: royaltyRegistryAbi,
      functionName: write.functionName,
      args: write.args,
      account: opts.account,
    });
  } catch (error) {
    throw royaltyRegistrySupportError(write.functionName, opts.registry, error);
  }

  return opts.walletClient.writeContract({
    address: opts.registry,
    abi: royaltyRegistryAbi,
    functionName: write.functionName,
    args: write.args,
    account: opts.account,
    chain: undefined,
  });
}

async function writeRoyaltyRegistryContractReceiver(
  opts: {
    publicClient: PublicClient;
    walletClient: NonNullable<RareClientConfig['walletClient']>;
    account: ReturnType<typeof requireWallet>['account'];
    registry: Address;
    plan: ReturnType<typeof planCollectionRoyaltyRegistryContractReceiver>;
  },
): Promise<Hash> {
  const write = buildCollectionRoyaltyRegistryContractReceiverWrite(opts.plan);
  try {
    await opts.publicClient.simulateContract({
      address: opts.registry,
      abi: royaltyRegistryAbi,
      functionName: write.functionName,
      args: write.args,
      account: opts.account,
    });
  } catch (error) {
    throw royaltyRegistrySupportError(write.functionName, opts.registry, error);
  }

  return opts.walletClient.writeContract({
    address: opts.registry,
    abi: royaltyRegistryAbi,
    functionName: write.functionName,
    args: write.args,
    account: opts.account,
    chain: undefined,
  });
}

async function writeRoyaltyRegistryTokenReceiver(
  opts: {
    publicClient: PublicClient;
    walletClient: NonNullable<RareClientConfig['walletClient']>;
    account: ReturnType<typeof requireWallet>['account'];
    registry: Address;
    plan: ReturnType<typeof planCollectionRoyaltyRegistryTokenReceiver>;
  },
): Promise<Hash> {
  const write = buildCollectionRoyaltyRegistryTokenReceiverWrite(opts.plan);
  try {
    await opts.publicClient.simulateContract({
      address: opts.registry,
      abi: royaltyRegistryAbi,
      functionName: write.functionName,
      args: write.args,
      account: opts.account,
    });
  } catch (error) {
    throw royaltyRegistrySupportError(write.functionName, opts.registry, error);
  }

  return opts.walletClient.writeContract({
    address: opts.registry,
    abi: royaltyRegistryAbi,
    functionName: write.functionName,
    args: write.args,
    account: opts.account,
    chain: undefined,
  });
}

async function writeRoyaltyRegistryContractPercentage(
  opts: {
    publicClient: PublicClient;
    walletClient: NonNullable<RareClientConfig['walletClient']>;
    account: ReturnType<typeof requireWallet>['account'];
    registry: Address;
    plan: ReturnType<typeof planCollectionRoyaltyRegistryContractPercentage>;
  },
): Promise<Hash> {
  const write = buildCollectionRoyaltyRegistryContractPercentageWrite(opts.plan);
  try {
    await opts.publicClient.simulateContract({
      address: opts.registry,
      abi: royaltyRegistryAbi,
      functionName: write.functionName,
      args: write.args,
      account: opts.account,
    });
  } catch (error) {
    throw royaltyRegistrySupportError(write.functionName, opts.registry, error);
  }

  return opts.walletClient.writeContract({
    address: opts.registry,
    abi: royaltyRegistryAbi,
    functionName: write.functionName,
    args: write.args,
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

function royaltyRegistrySupportError(operation: string, registry: Address, cause: unknown): Error {
  return new Error(
    `Royalty registry ${registry} does not support ${operation}, or the ${operation} preflight failed.`,
    { cause },
  );
}
