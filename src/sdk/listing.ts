import {
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { auctionAbi } from '../contracts/abis/auction.js';
import type {
  ListingMarketplaceNamespace,
  RareClientConfig,
  WalletAccount,
} from './types.js';
import {
  approvalAbi,
  preparePayment,
  requireWallet,
  waitForApproval,
} from './helpers.js';
import {
  planListingBuy,
  planListingCancel,
  planListingCreate,
  planListingStatus,
  shapeListingStatus,
} from './marketplace-core.js';

export function createListingNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  addresses: { auction: Address },
): ListingMarketplaceNamespace {
  return {
    async create(params): ReturnType<ListingMarketplaceNamespace['create']> {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const plan = planListingCreate(params, accountAddress);
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

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'setSalePrice',
        args: [
          plan.nftAddress,
          plan.tokenId,
          plan.currency,
          plan.price,
          plan.target,
          plan.splitAddresses,
          plan.splitRatios,
        ],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt, approvalTxHash };
    },

    async cancel(params): ReturnType<ListingMarketplaceNamespace['cancel']> {
      const { walletClient, account } = requireWallet(config);
      const plan = planListingCancel(params);

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'removeSalePrice',
        args: [params.contract, plan.tokenId, plan.target],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async buy(params): ReturnType<ListingMarketplaceNamespace['buy']> {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const plan = planListingBuy(params);

      const value = await preparePayment({
        publicClient, walletClient, account, accountAddress,
        auctionAddress: addresses.auction, currency: plan.currency, amount: plan.amount,
      });

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'buy',
        args: [params.contract, plan.tokenId, plan.currency, plan.amount],
        account,
        chain: undefined,
        value,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async getStatus(params): ReturnType<ListingMarketplaceNamespace['getStatus']> {
      const plan = planListingStatus(params);

      const result = await publicClient.readContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'getSalePrice',
        args: [params.contract, plan.tokenId, plan.target],
      });

      const wallet = config.account ?? config.walletClient?.account?.address ?? null;
      return shapeListingStatus(result, { target: plan.target, wallet });
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
