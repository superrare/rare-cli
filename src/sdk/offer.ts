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
  toInteger,
  toWei,
  waitForApproval,
} from './helpers.js';

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
    async create(params) {
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
        functionName: 'offer',
        args: [params.contract, toInteger(params.tokenId, 'tokenId'), currency, amount, false],
        account,
        chain: undefined,
        value,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async cancel(params) {
      const { walletClient, account } = requireWallet(config);

      const currency = params.currency ?? ETH_ADDRESS;

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'cancelOffer',
        args: [params.contract, toInteger(params.tokenId, 'tokenId'), currency],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async accept(params) {
      const { walletClient, account, accountAddress } = requireWallet(config);

      const currency = params.currency ?? ETH_ADDRESS;
      const amount = toWei(params.amount);
      const splitAddresses = params.splitAddresses ?? [accountAddress];
      const splitRatios = params.splitRatios ?? [100];

      await ensureNftApproved(
        publicClient, walletClient, account, accountAddress,
        params.contract, addresses.auction,
      );

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'acceptOffer',
        args: [params.contract, toInteger(params.tokenId, 'tokenId'), currency, amount, splitAddresses, splitRatios],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async getStatus(params) {
      const currency = params.currency ?? ETH_ADDRESS;
      const tokenId = toInteger(params.tokenId, 'tokenId');

      const [offerResult, ownerResult, delayResult] = await publicClient.multicall({
        contracts: [
          {
            address: addresses.auction,
            abi: auctionAbi,
            functionName: 'tokenCurrentOffers',
            args: [params.contract, tokenId, currency],
          },
          {
            address: params.contract,
            abi: tokenAbi,
            functionName: 'ownerOf',
            args: [tokenId],
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
      const [buyer, amount, timestamp, marketplaceFee] = offerResult.result;
      const hasOffer = amount > 0n;

      const tokenOwner = ownerResult.status === 'success' ? ownerResult.result : null;
      const cancellationDelay = delayResult.status === 'success' ? delayResult.result : null;
      const cancellableAfter =
        hasOffer && cancellationDelay !== null ? timestamp + cancellationDelay : null;

      const wallet = config.account ?? config.walletClient?.account?.address ?? null;
      let canAccept: boolean | null = null;
      let canCancel: boolean | null = null;
      if (wallet) {
        const w = wallet.toLowerCase();
        const owner = tokenOwner?.toLowerCase() ?? null;
        const buyerLower = buyer.toLowerCase();
        const now = BigInt(Math.floor(Date.now() / 1000));
        canAccept = hasOffer && owner !== null && w === owner;
        canCancel =
          hasOffer && w === buyerLower && (cancellableAfter === null || now >= cancellableAfter);
      }

      return {
        buyer,
        amount,
        timestamp,
        marketplaceFee,
        hasOffer,
        currency,
        tokenOwner,
        cancellableAfter,
        canAccept,
        canCancel,
      };
    },
  };
}
