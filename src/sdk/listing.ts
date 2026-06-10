import {
  type Address,
  type PublicClient,
} from 'viem';
import { auctionAbi } from '../contracts/abis/auction.js';
import { ETH_ADDRESS, type SupportedChain } from '../contracts/addresses.js';
import type {
  ListingMarketplaceNamespace,
} from './types/listing.js';
import type { RareClientConfig } from './types/client.js';
import { approveNftContractIfNeeded, runWithApprovalSideEffectAlert } from './approvals-shell.js';
import {
  preparePaymentForSpender,
  toCurrencyAmount,
} from './payments-shell.js';
import { requireWallet } from './wallet-shell.js';
import { requireInput } from './validation-core.js';
import {
  planListingBuy,
  planListingCancel,
  planListingCreate,
  planListingStatus,
  shapeListingStatus,
} from './marketplace-core.js';
import { resolveCurrencyForSdk } from './currency.js';
import { waitForSuccessfulTransactionReceipt } from './transaction-receipt.js';

export type * from './types/listing.js';

export function createListingNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  chain: SupportedChain,
  addresses: { auction: Address },
): ListingMarketplaceNamespace {
  return {
    async create(params): ReturnType<ListingMarketplaceNamespace['create']> {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const currency = params.currency === undefined ? ETH_ADDRESS : resolveCurrencyForSdk(params.currency, chain).address;
      const price = await toCurrencyAmount(publicClient, chain, currency, params.price, 'price');
      const plan = planListingCreate({ ...params, currency, price }, accountAddress);
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
        operation: 'listing create',
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

          const targetReceipt = await waitForSuccessfulTransactionReceipt(publicClient, {
            txHash: targetTxHash,
            operation: 'listing create',
            marketplace: addresses.auction,
            contract: plan.nftAddress,
            tokenId: plan.tokenId,
          });
          return { txHash: targetTxHash, receipt: targetReceipt };
        },
      });
      return { txHash, receipt, approvalTxHash };
    },

    async cancel(params): ReturnType<ListingMarketplaceNamespace['cancel']> {
      const { walletClient, account } = requireWallet(config);
      const plan = planListingCancel(params);

      const targetTxHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'removeSalePrice',
        args: [params.contract, plan.tokenId, plan.target],
        account,
        chain: undefined,
      });

      const targetReceipt = await waitForSuccessfulTransactionReceipt(publicClient, {
        txHash: targetTxHash,
        operation: 'listing cancel',
        marketplace: addresses.auction,
        contract: params.contract,
        tokenId: plan.tokenId,
      });
      return { txHash: targetTxHash, receipt: targetReceipt };
    },

    async buy(params): ReturnType<ListingMarketplaceNamespace['buy']> {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const currency = params.currency === undefined ? ETH_ADDRESS : resolveCurrencyForSdk(params.currency, chain).address;
      const price = requireInput(params.price, 'price');
      const amount = await toCurrencyAmount(publicClient, chain, currency, price, 'price');
      const plan = planListingBuy({ ...params, price: amount, currency });

      const payment = await preparePaymentForSpender({
        publicClient, walletClient, account, accountAddress,
        marketplaceSettingsSource: addresses.auction,
        spenderAddress: addresses.auction,
        currency: plan.currency,
        amount: plan.amount,
        autoApprove: params.autoApprove,
      });

      const { txHash, receipt } = await runWithApprovalSideEffectAlert({
        operation: 'listing buy',
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
            functionName: 'buy',
            args: [params.contract, plan.tokenId, plan.currency, plan.amount],
            account,
            chain: undefined,
            value: payment.value,
          });

          const targetReceipt = await waitForSuccessfulTransactionReceipt(publicClient, {
            txHash: targetTxHash,
            operation: 'listing buy',
            marketplace: addresses.auction,
            contract: params.contract,
            tokenId: plan.tokenId,
          });
          return { txHash: targetTxHash, receipt: targetReceipt };
        },
      });
      return { txHash, receipt, approvalTxHash: payment.approvalTxHash };
    },

    async status(params): ReturnType<ListingMarketplaceNamespace['status']> {
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
