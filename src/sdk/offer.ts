import {
  type Address,
  type PublicClient,
} from 'viem';
import { auctionAbi } from '../contracts/abis/auction.js';
import type { RareClientConfig, RareClient } from './types.js';
import {
  ETH_ADDRESS,
  preparePayment,
  requireWallet,
  toInteger,
  toWei,
} from './helpers.js';

export function createOfferNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  addresses: { auction: Address },
): RareClient['offer'] {
  return {
    async create(params) {
      const { walletClient, account, accountAddress } = requireWallet(config);

      const currency = params.currency ?? ETH_ADDRESS;
      const amount = toWei(params.amount);
      const convertible = params.convertible ?? false;

      const value = await preparePayment({
        publicClient, walletClient, account, accountAddress,
        auctionAddress: addresses.auction, currency, amount,
      });

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'offer',
        args: [params.contract, toInteger(params.tokenId, 'tokenId'), currency, amount, convertible],
        account,
        chain: undefined,
        value,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async cancel(params) {
      const { walletClient, account } = requireWallet(config);

      const currency = params.currency ?? ETH_ADDRESS;

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'cancelOffer',
        args: [params.contract, toInteger(params.tokenId, 'tokenId'), currency],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async accept(params) {
      const { walletClient, account, accountAddress } = requireWallet(config);

      const currency = params.currency ?? ETH_ADDRESS;
      const amount = toWei(params.amount);
      const splitAddresses = params.splitAddresses ?? [accountAddress];
      const splitRatios = params.splitRatios ?? [100];

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'acceptOffer',
        args: [params.contract, toInteger(params.tokenId, 'tokenId'), currency, amount, splitAddresses, splitRatios],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async getStatus(params) {
      const currency = params.currency ?? ETH_ADDRESS;

      const [buyer, amount, timestamp, marketplaceFee, convertible] = await publicClient.readContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'tokenCurrentOffers',
        args: [params.contract, toInteger(params.tokenId, 'tokenId'), currency],
      });

      const hasOffer = amount > 0n;

      return { buyer, amount, timestamp, marketplaceFee, convertible, hasOffer };
    },
  };
}
