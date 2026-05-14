import {
  parseUnits,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { auctionAbi } from '../contracts/abis/auction.js';
import { ETH_ADDRESS, type SupportedChain } from '../contracts/addresses.js';
import type { RareClientConfig, RareClient, WalletAccount } from './types.js';
import {
  approvalAbi,
  preparePayment,
  requireWallet,
  resolveCurrencyDecimals,
  stringifyAmountInput,
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
  chain: SupportedChain,
  addresses: { auction: Address },
): RareClient['auction'] {
  return {
    async create(params): ReturnType<RareClient['auction']['create']> {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const currency = params.currency ?? ETH_ADDRESS;
      const startingPrice = typeof params.startingPrice === 'bigint'
        ? params.startingPrice
        : parseUnits(stringifyAmountInput(params.startingPrice, 'startingPrice'), await resolveCurrencyDecimals(publicClient, chain, currency));
      const plan = planAuctionCreate({ ...params, currency, startingPrice }, accountAddress);
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
      const amount = typeof params.amount === 'bigint'
        ? params.amount
        : parseUnits(stringifyAmountInput(params.amount, 'amount'), await resolveCurrencyDecimals(publicClient, chain, currency));
      const plan = planAuctionBid({ ...params, currency, amount });

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
