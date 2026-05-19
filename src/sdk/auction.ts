import {
  type Address,
  type PublicClient,
} from 'viem';
import { auctionAbi } from '../contracts/abis/auction.js';
import { ETH_ADDRESS, type SupportedChain } from '../contracts/addresses.js';
import type { RareClientConfig, RareClient } from './types.js';
import {
  approveNftContractIfNeeded,
  preparePaymentForSpender,
  requireWallet,
  requireInput,
  toCurrencyAmount,
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
  chain: SupportedChain,
  addresses: { auction: Address },
): Omit<RareClient['auction'], 'batch'> {
  return {
    async create(params): ReturnType<RareClient['auction']['create']> {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const currency = params.currency ?? ETH_ADDRESS;
      const price = requireInput(params.price, 'price');
      const startingPrice = await toCurrencyAmount(publicClient, chain, currency, price, 'price');
      const plan = planAuctionCreate({ ...params, price: startingPrice, currency }, accountAddress);
      const approvalTxHash = await approveNftContractIfNeeded({
        publicClient,
        walletClient,
        account,
        accountAddress,
        nftAddress: plan.nftAddress,
        operator: addresses.auction,
        autoApprove: params.autoApprove,
      });

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

    async bid(params): ReturnType<RareClient['auction']['bid']> {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const currency = params.currency ?? ETH_ADDRESS;
      const price = requireInput(params.price, 'price');
      const amount = await toCurrencyAmount(publicClient, chain, currency, price, 'price');
      const plan = planAuctionBid({ ...params, price: amount, currency });

      const payment = await preparePaymentForSpender({
        publicClient, walletClient, account, accountAddress,
        marketplaceSettingsSource: addresses.auction,
        spenderAddress: addresses.auction,
        currency: plan.currency,
        amount: plan.amount,
        autoApprove: params.autoApprove,
      });

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'bid',
        args: [params.contract, plan.tokenId, plan.currency, plan.amount],
        account,
        chain: undefined,
        value: payment.value,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt, approvalTxHash: payment.approvalTxHash };
    },

    async settle(params): ReturnType<RareClient['auction']['settle']> {
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

    async cancel(params): ReturnType<RareClient['auction']['cancel']> {
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

    async getStatus(params): ReturnType<RareClient['auction']['getStatus']> {
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
