import { type Hash, type PublicClient, parseEventLogs } from 'viem';
import { tokenAbi } from '../contracts/abis/token.js';
import type { RareClientConfig, RareClient } from './types.js';
import { requireWallet } from './helpers.js';

export function createMintNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
): RareClient['mint'] {
  return {
    async mintTo(params) {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const useMintTo = Boolean(params.to || params.royaltyReceiver);

      let txHash: Hash;
      if (useMintTo) {
        const receiver = params.to ?? accountAddress;
        const royaltyReceiver = params.royaltyReceiver ?? accountAddress;
        txHash = await walletClient.writeContract({
          address: params.contract,
          abi: tokenAbi,
          functionName: 'mintTo',
          args: [params.tokenUri, receiver, royaltyReceiver],
          account,
          chain: undefined,
        });
      } else {
        txHash = await walletClient.writeContract({
          address: params.contract,
          abi: tokenAbi,
          functionName: 'addNewToken',
          args: [params.tokenUri],
          account,
          chain: undefined,
        });
      }

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: tokenAbi,
        logs: receipt.logs,
        eventName: 'Transfer',
      });

      if (!logs[0]) {
        throw new Error('Mint transaction succeeded but Transfer event was not found in logs.');
      }

      return {
        txHash,
        receipt,
        tokenId: logs[0].args.tokenId,
      };
    },
  };
}
