import {
  type Address,
  type PublicClient,
} from 'viem';
import { auctionAbi } from '../contracts/abis/auction.js';
import { ETH_ADDRESS, type SupportedChain } from '../contracts/addresses.js';
import type { RareClientConfig } from './types/client.js';
import type { AuctionMarketplaceNamespace } from './types/auction.js';
import { approveNftContractIfNeeded, runWithApprovalSideEffectAlert } from './approvals-shell.js';
import {
  preparePaymentForSpender,
  toCurrencyAmount,
} from './payments-shell.js';
import { requireWallet } from './wallet-shell.js';
import { requireInput } from './validation-core.js';
import {
  planAuctionBid,
  planAuctionCreate,
  planAuctionTokenAction,
  shapeAuctionBidRead,
  shapeAuctionStatus,
} from './marketplace-core.js';
import { resolveCurrencyForSdk } from './currency.js';
import { waitForSuccessfulTransactionReceipt } from './transaction-receipt.js';

export type * from './types/auction.js';

export function createAuctionNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  chain: SupportedChain,
  addresses: { auction: Address },
): AuctionMarketplaceNamespace {
  return {
    async create(params): ReturnType<AuctionMarketplaceNamespace['create']> {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const currency = params.currency === undefined ? ETH_ADDRESS : resolveCurrencyForSdk(params.currency, chain).address;
      const price = requireInput(params.price, 'price');
      const startingPrice = await toCurrencyAmount(publicClient, chain, currency, price, 'price');
      const plan = planAuctionCreate(
        { ...params, price: startingPrice, currency },
        accountAddress,
        currentUnixTimestamp(),
      );
      const auctionType = await publicClient.readContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: plan.auctionType === 'scheduled' ? 'SCHEDULED_AUCTION' : 'COLDIE_AUCTION',
      });
      const approvalTxHash = await approveNftContractIfNeeded({
        publicClient,
        walletClient,
        account,
        accountAddress,
        nftAddress: plan.nftAddress,
        operator: addresses.auction,
        autoApprove: params.autoApprove,
      });

      const { txHash, receipt } = await runWithApprovalSideEffectAlert({
        operation: 'auction create',
        approvals: [{
          type: 'nft',
          approvalTxHash,
          target: plan.nftAddress,
          operator: addresses.auction,
        }],
        run: async () => {
          const targetTxHash = await walletClient.writeContract({
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

          const targetReceipt = await waitForSuccessfulTransactionReceipt(publicClient, {
            txHash: targetTxHash,
            operation: 'auction create',
            marketplace: addresses.auction,
            contract: plan.nftAddress,
            tokenId: plan.tokenId,
          });
          return { txHash: targetTxHash, receipt: targetReceipt };
        },
      });

      return {
        txHash,
        receipt,
        approvalTxHash,
        auctionType: plan.auctionType,
        startTime: plan.startTime,
      };
    },

    async bid(params): ReturnType<AuctionMarketplaceNamespace['bid']> {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const currency = params.currency === undefined ? ETH_ADDRESS : resolveCurrencyForSdk(params.currency, chain).address;
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

      const { txHash, receipt } = await runWithApprovalSideEffectAlert({
        operation: 'auction bid',
        approvals: [{
          type: 'erc20',
          approvalTxHash: payment.approvalTxHash,
          target: plan.currency,
          spender: addresses.auction,
        }],
        run: async () => {
          const targetTxHash = await walletClient.writeContract({
            address: addresses.auction,
            abi: auctionAbi,
            functionName: 'bid',
            args: [params.contract, plan.tokenId, plan.currency, plan.amount],
            account,
            chain: undefined,
            value: payment.value,
          });

          const targetReceipt = await waitForSuccessfulTransactionReceipt(publicClient, {
            txHash: targetTxHash,
            operation: 'auction bid',
            marketplace: addresses.auction,
            contract: params.contract,
            tokenId: plan.tokenId,
          });
          return { txHash: targetTxHash, receipt: targetReceipt };
        },
      });
      return { txHash, receipt, approvalTxHash: payment.approvalTxHash };
    },

    async settle(params): ReturnType<AuctionMarketplaceNamespace['settle']> {
      const { walletClient, account } = requireWallet(config);
      const plan = planAuctionTokenAction(params);

      const targetTxHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'settleAuction',
        args: [params.contract, plan.tokenId],
        account,
        chain: undefined,
      });

      const targetReceipt = await waitForSuccessfulTransactionReceipt(publicClient, {
        txHash: targetTxHash,
        operation: 'auction settle',
        marketplace: addresses.auction,
        contract: params.contract,
        tokenId: plan.tokenId,
      });
      return { txHash: targetTxHash, receipt: targetReceipt };
    },

    async cancel(params): ReturnType<AuctionMarketplaceNamespace['cancel']> {
      const { walletClient, account } = requireWallet(config);
      const plan = planAuctionTokenAction(params);

      const targetTxHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'cancelAuction',
        args: [params.contract, plan.tokenId],
        account,
        chain: undefined,
      });

      const targetReceipt = await waitForSuccessfulTransactionReceipt(publicClient, {
        txHash: targetTxHash,
        operation: 'auction cancel',
        marketplace: addresses.auction,
        contract: params.contract,
        tokenId: plan.tokenId,
      });
      return { txHash: targetTxHash, receipt: targetReceipt };
    },

    async status(params): ReturnType<AuctionMarketplaceNamespace['status']> {
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

      return shapeAuctionStatus(result, currentUnixTimestamp(), {
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

function currentUnixTimestamp(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}
