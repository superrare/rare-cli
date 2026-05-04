import { type Address, type Hash, type PublicClient, parseEventLogs } from 'viem';
import { factoryAbi } from '../contracts/abis/factory.js';
import { lazyBatchMintFactoryAbi } from '../contracts/abis/lazy-batch-mint-factory.js';
import type { RareClientConfig, RareClient } from './types.js';
import { requireWallet, toInteger } from './helpers.js';

export function createDeployNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  addresses: { factory: Address; lazyBatchMintFactory?: Address },
): RareClient['deploy'] {
  return {
    async erc721(params) {
      const { walletClient, account } = requireWallet(config);
      let txHash: Hash;
      if (params.maxTokens !== undefined) {
        txHash = await walletClient.writeContract({
          address: addresses.factory,
          abi: factoryAbi,
          functionName: 'createSovereignBatchMint',
          args: [params.name, params.symbol, toInteger(params.maxTokens, 'maxTokens')],
          account,
          chain: undefined,
        });
      } else {
        txHash = await walletClient.writeContract({
          address: addresses.factory,
          abi: factoryAbi,
          functionName: 'createSovereignBatchMint',
          args: [params.name, params.symbol],
          account,
          chain: undefined,
        });
      }

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: factoryAbi,
        logs: receipt.logs,
        eventName: 'SovereignBatchMintCreated',
      });

      if (!logs[0]) {
        throw new Error('Deploy transaction succeeded but SovereignBatchMintCreated event was not found in logs.');
      }

      return {
        txHash,
        receipt,
        contract: logs[0].args.contractAddress,
      };
    },

    async lazyBatchMint(params) {
      if (!addresses.lazyBatchMintFactory) {
        throw new Error(
          'Lazy batch mint factory is not deployed on this chain. Supported chains: mainnet, sepolia.',
        );
      }
      const factoryAddress = addresses.lazyBatchMintFactory;
      const { walletClient, account } = requireWallet(config);

      let txHash: Hash;
      if (params.maxTokens !== undefined) {
        txHash = await walletClient.writeContract({
          address: factoryAddress,
          abi: lazyBatchMintFactoryAbi,
          functionName: 'createLazySovereignBatchMint',
          args: [params.name, params.symbol, toInteger(params.maxTokens, 'maxTokens')],
          account,
          chain: undefined,
        });
      } else {
        txHash = await walletClient.writeContract({
          address: factoryAddress,
          abi: lazyBatchMintFactoryAbi,
          functionName: 'createLazySovereignBatchMint',
          args: [params.name, params.symbol],
          account,
          chain: undefined,
        });
      }

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
