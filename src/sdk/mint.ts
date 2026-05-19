import { type PublicClient, parseEventLogs } from 'viem';
import { tokenAbi } from '../contracts/abis/token.js';
import type { RareClientConfig } from './types/client.js';
import type { CollectionNamespace } from './types/collection.js';
import { requireWallet } from './wallet-shell.js';

export function createCollectionMint(
  publicClient: PublicClient,
  config: RareClientConfig,
): CollectionNamespace['mint'] {
  return async function mint(params): ReturnType<CollectionNamespace['mint']> {
    const { walletClient, account, accountAddress } = requireWallet(config);
    const useMintTo = params.to !== undefined || params.royaltyReceiver !== undefined;

    const receiver = params.to ?? accountAddress;
    const royaltyReceiver = params.royaltyReceiver ?? accountAddress;
    const txHash = useMintTo
      ? await walletClient.writeContract({
          address: params.contract,
          abi: tokenAbi,
          functionName: 'mintTo',
          args: [params.tokenUri, receiver, royaltyReceiver],
          account,
          chain: undefined,
        })
      : await walletClient.writeContract({
          address: params.contract,
          abi: tokenAbi,
          functionName: 'addNewToken',
          args: [params.tokenUri],
          account,
          chain: undefined,
        });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const logs = parseEventLogs({
      abi: tokenAbi,
      logs: receipt.logs,
      eventName: 'Transfer',
    });

    const log = logs[0];
    if (log === undefined) {
      throw new Error('Mint transaction succeeded but Transfer event was not found in logs.');
    }

    return {
      txHash,
      receipt,
      tokenId: log.args.tokenId,
    };
  };
}
