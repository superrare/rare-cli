import {
  type Address,
  type Hash,
  type PublicClient,
} from 'viem';
import { auctionAbi } from '../contracts/abis/auction.js';
import type { RareClientConfig, RareClient } from './types.js';
import {
  approvalAbi,
  preparePayment,
  requireWallet,
  waitForApproval,
} from './helpers.js';
import {
  planAuctionBid,
  planAuctionCreate,
  planAuctionTokenAction,
  shapeAuctionStatus,
} from './marketplace-core.js';

export function createAuctionNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  addresses: { auction: Address },
): RareClient['auction'] {
  return {
    async create(params) {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const plan = planAuctionCreate(params, accountAddress);

      let approvalTxHash: Hash | undefined;
      if (params.autoApprove !== false) {
        const isApproved = await publicClient.readContract({
          address: plan.nftAddress,
          abi: approvalAbi,
          functionName: 'isApprovedForAll',
          args: [accountAddress, addresses.auction],
        });

        if (!isApproved) {
          approvalTxHash = await walletClient.writeContract({
            address: plan.nftAddress,
            abi: approvalAbi,
            functionName: 'setApprovalForAll',
            args: [addresses.auction, true],
            account,
            chain: undefined,
          });

          await publicClient.waitForTransactionReceipt({ hash: approvalTxHash });
          await waitForApproval(publicClient, plan.nftAddress, accountAddress, addresses.auction);
        }
      }

      const auctionType = await publicClient.readContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'COLDIE_AUCTION',
      });

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'configureAuction',
        args: [
          auctionType,
          plan.nftAddress,
          plan.tokenId,
          plan.startingPrice,
          plan.currency,
          plan.duration,
          0n,
          plan.splitAddresses,
          plan.splitRatios,
        ],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      return {
        txHash,
        receipt,
        approvalTxHash,
      };
    },

    async bid(params) {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const plan = planAuctionBid(params);

      const value = await preparePayment({
        publicClient, walletClient, account, accountAddress,
        auctionAddress: addresses.auction, currency: plan.currency, amount: plan.amount,
      });

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'bid',
        args: [params.contract, plan.tokenId, plan.currency, plan.amount],
        account,
        chain: undefined,
        value,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async settle(params) {
      const { walletClient, account } = requireWallet(config);
      const plan = planAuctionTokenAction(params);

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'settleAuction',
        args: [params.contract, plan.tokenId],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async cancel(params) {
      const { walletClient, account } = requireWallet(config);
      const plan = planAuctionTokenAction(params);

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'cancelAuction',
        args: [params.contract, plan.tokenId],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async getStatus(params) {
      const plan = planAuctionTokenAction(params);
      const result = await publicClient.readContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'getAuctionDetails',
        args: [params.contract, plan.tokenId],
      });

      return shapeAuctionStatus(result, BigInt(Math.floor(Date.now() / 1000)));
    },
  };
}
