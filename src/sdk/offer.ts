import {
  type Address,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { auctionAbi } from '../contracts/abis/auction.js';
import { tokenAbi } from '../contracts/abis/token.js';
import type { RareClientConfig, RareClient, WalletAccount } from './types.js';
import {
  ETH_ADDRESS,
  approvalAbi,
  preparePayment,
  requireWallet,
  waitForApproval,
} from './helpers.js';
import {
  planOfferAccept,
  planOfferCancel,
  planOfferCreate,
  planOfferStatus,
  shapeOfferStatus,
} from './marketplace-core.js';

async function ensureNftApproved(
  publicClient: PublicClient,
  walletClient: WalletClient,
  account: Address | WalletAccount,
  accountAddress: Address,
  nftAddress: Address,
  marketAddress: Address,
): Promise<void> {
  const isApproved = await publicClient.readContract({
    address: nftAddress,
    abi: approvalAbi,
    functionName: 'isApprovedForAll',
    args: [accountAddress, marketAddress],
  });
  if (isApproved) return;

  const approvalTxHash = await walletClient.writeContract({
    address: nftAddress,
    abi: approvalAbi,
    functionName: 'setApprovalForAll',
    args: [marketAddress, true],
    account,
    chain: undefined,
  });
  await publicClient.waitForTransactionReceipt({ hash: approvalTxHash });
  await waitForApproval(publicClient, nftAddress, accountAddress, marketAddress);
}

export function createOfferNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  addresses: { auction: Address },
): RareClient['offer'] {
  return {
    async create(params): ReturnType<RareClient['offer']['create']> {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const plan = planOfferCreate(params);

      const value = await preparePayment({
        publicClient, walletClient, account, accountAddress,
        auctionAddress: addresses.auction, currency: plan.currency, amount: plan.amount,
      });

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'offer',
        args: [params.contract, plan.tokenId, plan.currency, plan.amount, plan.convertible],
        account,
        chain: undefined,
        value,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async cancel(params): ReturnType<RareClient['offer']['cancel']> {
      const { walletClient, account } = requireWallet(config);
      const plan = planOfferCancel(params);

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'cancelOffer',
        args: [params.contract, plan.tokenId, plan.currency],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async accept(params): ReturnType<RareClient['offer']['accept']> {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const plan = planOfferAccept(params, accountAddress);

      await ensureNftApproved(
        publicClient, walletClient, account, accountAddress,
        params.contract, addresses.auction,
      );

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'acceptOffer',
        args: [
          params.contract,
          plan.tokenId,
          plan.currency,
          plan.amount,
          plan.splitAddresses,
          plan.splitRatios,
        ],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async getStatus(params): ReturnType<RareClient['offer']['getStatus']> {
      const plan = planOfferStatus(params);

      const [offerResult, ownerResult, delayResult] = await publicClient.multicall({
        contracts: [
          {
            address: addresses.auction,
            abi: auctionAbi,
            functionName: 'tokenCurrentOffers',
            args: [params.contract, plan.tokenId, plan.currency],
          },
          {
            address: params.contract,
            abi: tokenAbi,
            functionName: 'ownerOf',
            args: [plan.tokenId],
          },
          {
            address: addresses.auction,
            abi: auctionAbi,
            functionName: 'offerCancelationDelay',
          },
        ],
      });

      if (offerResult.status !== 'success') {
        throw offerResult.error;
      }

      const tokenOwner = ownerResult.status === 'success' ? ownerResult.result : null;
      const cancellationDelay = delayResult.status === 'success' ? delayResult.result : null;
      const wallet = config.account ?? config.walletClient?.account?.address ?? null;

      return shapeOfferStatus(offerResult.result, {
        currency: plan.currency,
        tokenOwner,
        cancellationDelay,
        wallet,
        nowSeconds: BigInt(Math.floor(Date.now() / 1000)),
      });
    },
  };
}
