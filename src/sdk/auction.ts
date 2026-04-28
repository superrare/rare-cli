import {
  type Address,
  type Hash,
  type PublicClient,
} from 'viem';
import { auctionAbi } from '../contracts/abis/auction.js';
import type { RareClientConfig, RareClient, AuctionStatus } from './types.js';
import {
  ETH_ADDRESS,
  approvalAbi,
  preparePayment,
  requireWallet,
  toInteger,
  toWei,
  waitForApproval,
} from './helpers.js';

export function createAuctionNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  addresses: { auction: Address },
): RareClient['auction'] {
  return {
    async create(params) {
      const { walletClient, account, accountAddress } = requireWallet(config);

      const nftAddress = params.contract;
      const currency = params.currency ?? ETH_ADDRESS;
      const tokenId = toInteger(params.tokenId, 'tokenId');
      const startingPrice = toWei(params.startingPrice);
      const duration = toInteger(params.duration, 'duration');
      const splitAddresses = params.splitAddresses ?? [accountAddress];
      const splitRatios = params.splitRatios ?? [100];

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
          nftAddress,
          tokenId,
          startingPrice,
          currency,
          duration,
          0n,
          splitAddresses,
          splitRatios,
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

      const currency = params.currency ?? ETH_ADDRESS;
      const amount = toWei(params.amount);

      const value = await preparePayment({
        publicClient, walletClient, account, accountAddress,
        auctionAddress: addresses.auction, currency, amount,
      });

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'bid',
        args: [params.contract, toInteger(params.tokenId, 'tokenId'), currency, amount],
        account,
        chain: undefined,
        value,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async settle(params) {
      const { walletClient, account } = requireWallet(config);

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'settleAuction',
        args: [params.contract, toInteger(params.tokenId, 'tokenId')],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async cancel(params) {
      const { walletClient, account } = requireWallet(config);

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'cancelAuction',
        args: [params.contract, toInteger(params.tokenId, 'tokenId')],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async getStatus(params) {
      const result = await publicClient.readContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'getAuctionDetails',
        args: [params.contract, toInteger(params.tokenId, 'tokenId')],
      });

      const [
        seller,
        creationBlock,
        startingTime,
        lengthOfAuction,
        currency,
        minimumBid,
        auctionType,
        splitAddresses,
        splitRatios,
      ] = result;

      const started = startingTime > 0n;
      const endTime = started ? startingTime + lengthOfAuction : null;
      const now = BigInt(Math.floor(Date.now() / 1000));
      let status: AuctionStatus['status'] = 'PENDING';
      if (started) {
        status = endTime !== null && now >= endTime ? 'ENDED' : 'RUNNING';
      }

      return {
        seller,
        creationBlock,
        startingTime,
        lengthOfAuction,
        currency,
        minimumBid,
        auctionType,
        splitAddresses: [...splitAddresses],
        splitRatios: [...splitRatios],
        isEth: currency === ETH_ADDRESS,
        started,
        endTime,
        status,
      };
    },
  };
}
