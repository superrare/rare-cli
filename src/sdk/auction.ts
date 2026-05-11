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
  shapeAuctionBidRead,
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
        functionName: plan.auctionType === 'scheduled' ? 'SCHEDULED_AUCTION' : 'COLDIE_AUCTION',
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
          plan.startTime,
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
        auctionType: plan.auctionType,
        startTime: plan.startTime,
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
      const [
        result,
        currentBid,
        minimumBidIncreasePercentage,
        reserveType,
        scheduledType,
      ] = await Promise.all([
        publicClient.readContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'getAuctionDetails',
          args: [params.contract, plan.tokenId],
        }),
        publicClient.readContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'auctionBids',
          args: [params.contract, plan.tokenId],
        }),
        publicClient.readContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'minimumBidIncreasePercentage',
        }),
        publicClient.readContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'COLDIE_AUCTION',
        }),
        publicClient.readContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'SCHEDULED_AUCTION',
        }),
      ]);

      return shapeAuctionStatus(result, BigInt(Math.floor(Date.now() / 1000)), {
        currentBid: shapeAuctionBidRead(currentBid),
        minimumBidIncreasePercentage,
        auctionTypeIds: {
          reserve: reserveType,
          scheduled: scheduledType,
        },
      });
    },
  };
}
