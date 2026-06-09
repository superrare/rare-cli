import { type Address, type PublicClient, parseEventLogs } from 'viem';
import { factoryAbi } from '../contracts/abis/factory.js';
import { lazyBatchMintFactoryAbi } from '../contracts/abis/lazy-batch-mint-factory.js';
import type { RareClientConfig } from './types/client.js';
import type { CollectionDeployNamespace } from './types/collection.js';
import { requireWallet } from './wallet-shell.js';
import { toPositiveInteger } from './amounts-core.js';

export function createDeployNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  addresses: { factory: Address; lazyBatchMintFactory?: Address },
): Pick<CollectionDeployNamespace, 'erc721' | 'lazyBatchMint'> {
  return {
    async erc721(params): ReturnType<CollectionDeployNamespace['erc721']> {
      const maxTokens = params.maxTokens === undefined ? undefined : toPositiveInteger(params.maxTokens, 'maxTokens');
      const { walletClient, account } = requireWallet(config);
      const txHash = maxTokens !== undefined
        ? await walletClient.writeContract({
          address: addresses.factory,
          abi: factoryAbi,
          functionName: 'createSovereignBatchMint',
          args: [params.name, params.symbol, maxTokens],
          account,
          chain: undefined,
        })
        : await walletClient.writeContract({
          address: addresses.factory,
          abi: factoryAbi,
          functionName: 'createSovereignBatchMint',
          args: [params.name, params.symbol],
          account,
          chain: undefined,
        });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: factoryAbi,
        logs: receipt.logs,
        eventName: 'SovereignBatchMintCreated',
      });

      const log = logs[0];
      if (log === undefined) {
        throw new Error('Deploy transaction succeeded but SovereignBatchMintCreated event was not found in logs.');
      }

      return {
        txHash,
        receipt,
        contract: log.args.contractAddress,
      };
    },

    async lazyBatchMint(params): ReturnType<CollectionDeployNamespace['lazyBatchMint']> {
      const maxTokens = params.maxTokens === undefined ? undefined : toPositiveInteger(params.maxTokens, 'maxTokens');
      if (!addresses.lazyBatchMintFactory) {
        throw new Error(
          'Lazy batch mint factory is not deployed on this chain. Supported chains: mainnet, sepolia, base, base-sepolia.',
        );
      }
      const factoryAddress = addresses.lazyBatchMintFactory;
      const { walletClient, account } = requireWallet(config);

      const txHash = maxTokens !== undefined
        ? await walletClient.writeContract({
          address: factoryAddress,
          abi: lazyBatchMintFactoryAbi,
          functionName: 'createLazySovereignBatchMint',
          args: [params.name, params.symbol, maxTokens],
          account,
          chain: undefined,
        })
        : await walletClient.writeContract({
          address: factoryAddress,
          abi: lazyBatchMintFactoryAbi,
          functionName: 'createLazySovereignBatchMint',
          args: [params.name, params.symbol],
          account,
          chain: undefined,
        });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: lazyBatchMintFactoryAbi,
        logs: receipt.logs,
        eventName: 'LazySovereignBatchMintCreated',
      });

      if (!logs[0]) {
        throw new Error(
          'Deploy transaction succeeded but LazySovereignBatchMintCreated event was not found in logs.',
        );
      }

      return {
        txHash,
        receipt,
        contract: logs[0].args.contractAddress,
      };
    },
  };
}
