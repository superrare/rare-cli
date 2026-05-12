import { type Address, type PublicClient, parseEventLogs } from 'viem';
import { factoryAbi } from '../contracts/abis/factory.js';
import type { RareClientConfig, RareClient } from './types.js';
import { requireWallet, toInteger } from './helpers.js';

export function createDeployNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  addresses: { factory: Address },
): RareClient['deploy'] {
  return {
    async erc721(params): ReturnType<RareClient['deploy']['erc721']> {
      const { walletClient, account } = requireWallet(config);
      const txHash = params.maxTokens !== undefined
        ? await walletClient.writeContract({
          address: addresses.factory,
          abi: factoryAbi,
          functionName: 'createSovereignBatchMint',
          args: [params.name, params.symbol, toInteger(params.maxTokens, 'maxTokens')],
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
  };
}
