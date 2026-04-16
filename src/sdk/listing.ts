import {
  type Address,
  type Hash,
  type PublicClient,
} from 'viem';
import { auctionAbi } from '../contracts/abis/auction.js';
import type { RareClientConfig, RareClient } from './types.js';
import {
  ETH_ADDRESS,
  approvalAbi,
  preparePayment,
  requireWallet,
  toInteger,
  toWei,
  waitForApproval,
} from './helpers.js';

export function createListingNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  addresses: { auction: Address },
): RareClient['listing'] {
  return {
    async create(params) {
      const { walletClient, account, accountAddress } = requireWallet(config);

      const currency = params.currency ?? ETH_ADDRESS;
      const price = toWei(params.price);
      const target = params.target ?? ETH_ADDRESS;
      const splitAddresses = params.splitAddresses ?? [accountAddress];
      const splitRatios = params.splitRatios ?? [100];
      const nftAddress = params.contract;

      let approvalTxHash: Hash | undefined;
      if (params.autoApprove !== false) {
        const isApproved = await publicClient.readContract({
          address: nftAddress,
          abi: approvalAbi,
          functionName: 'isApprovedForAll',
          args: [accountAddress, addresses.auction],
        });

        if (!isApproved) {
          approvalTxHash = await walletClient.writeContract({
            address: nftAddress,
            abi: approvalAbi,
            functionName: 'setApprovalForAll',
            args: [addresses.auction, true],
            account,
            chain: undefined,
          });

          await publicClient.waitForTransactionReceipt({ hash: approvalTxHash });
          await waitForApproval(publicClient, nftAddress, accountAddress, addresses.auction);
        }
      }

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'setSalePrice',
        args: [nftAddress, toInteger(params.tokenId, 'tokenId'), currency, price, target, splitAddresses, splitRatios],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt, approvalTxHash };
    },

    async cancel(params) {
      const { walletClient, account } = requireWallet(config);

      const target = params.target ?? ETH_ADDRESS;

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'removeSalePrice',
        args: [params.contract, toInteger(params.tokenId, 'tokenId'), target],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async buy(params) {
      const { walletClient, account, accountAddress } = requireWallet(config);

      const currency = params.currency ?? ETH_ADDRESS;
      const amount = toWei(params.amount);

      const value = await preparePayment({
        publicClient, walletClient, account, accountAddress,
        auctionAddress: addresses.auction, currency, amount,
      });

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'buy',
        args: [params.contract, toInteger(params.tokenId, 'tokenId'), currency, amount],
        account,
        chain: undefined,
        value,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async getStatus(params) {
      const target = params.target ?? ETH_ADDRESS;

      const [seller, currencyAddress, amount] = await publicClient.readContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'tokenSalePrices',
        args: [params.contract, toInteger(params.tokenId, 'tokenId'), target],
      });

      const hasListing = amount > 0n;
      const isEth = currencyAddress === ETH_ADDRESS;

      return { seller, currencyAddress, amount, hasListing, isEth };
    },
  };
}
