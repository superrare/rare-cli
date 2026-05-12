import {
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { auctionAbi } from '../contracts/abis/auction.js';
import type { RareClientConfig, RareClient, WalletAccount } from './types.js';
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
    async create(params): ReturnType<RareClient['auction']['create']> {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const plan = planAuctionCreate(params, accountAddress);
      const approvalTxHash = params.autoApprove === false
        ? undefined
        : await approveMarketplaceIfNeeded({
          publicClient,
          walletClient,
          account,
          accountAddress,
          nftAddress: plan.nftAddress,
          operator: addresses.auction,
        });

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

    async bid(params): ReturnType<RareClient['auction']['bid']> {
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

async function approveMarketplaceIfNeeded(opts: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Address | WalletAccount;
  accountAddress: Address;
  nftAddress: Address;
  operator: Address;
}): Promise<Hash | undefined> {
  const isApproved = await opts.publicClient.readContract({
    address: opts.nftAddress,
    abi: approvalAbi,
    functionName: 'isApprovedForAll',
    args: [opts.accountAddress, opts.operator],
  });

  if (isApproved) {
    return undefined;
  }

  const approvalTxHash = await opts.walletClient.writeContract({
    address: opts.nftAddress,
    abi: approvalAbi,
    functionName: 'setApprovalForAll',
    args: [opts.operator, true],
    account: opts.account,
    chain: undefined,
  });

  await opts.publicClient.waitForTransactionReceipt({ hash: approvalTxHash });
  await waitForApproval(opts.publicClient, opts.nftAddress, opts.accountAddress, opts.operator);

  return approvalTxHash;
}
