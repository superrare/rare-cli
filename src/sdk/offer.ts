import {
  type Address,
  type PublicClient,
} from 'viem';
import { auctionAbi } from '../contracts/abis/auction.js';
import type { RareClientConfig, RareClient } from './types.js';
import {
  preparePayment,
  requireWallet,
} from './helpers.js';
import {
  planOfferAccept,
  planOfferCancel,
  planOfferCreate,
  planOfferStatus,
  shapeOfferStatus,
} from './marketplace-core.js';

export function createOfferNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  addresses: { auction: Address },
): RareClient['offer'] {
  return {
    async create(params) {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const plan = planOfferCreate(params);

      const value = await preparePayment({
        publicClient, walletClient, account, accountAddress,
        auctionAddress: addresses.auction, currency: plan.currency, amount: plan.amount,
      });

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'offer',
        args: [params.contract, plan.tokenId, plan.currency, plan.amount, plan.convertible],
        account,
        chain: undefined,
        value,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async cancel(params) {
      const { walletClient, account } = requireWallet(config);
      const plan = planOfferCancel(params);

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'cancelOffer',
        args: [params.contract, plan.tokenId, plan.currency],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async accept(params) {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const plan = planOfferAccept(params, accountAddress);

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'acceptOffer',
        args: [
          params.contract,
          plan.tokenId,
          plan.currency,
          plan.amount,
          plan.splitAddresses,
          plan.splitRatios,
        ],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async getStatus(params) {
      const plan = planOfferStatus(params);

      const result = await publicClient.readContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'tokenCurrentOffers',
        args: [params.contract, plan.tokenId, plan.currency],
      });

      return shapeOfferStatus(result);
    },
  };
}
