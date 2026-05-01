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
      const convertible = params.convertible ?? false;

      const value = await preparePayment({
        publicClient, walletClient, account, accountAddress,
        auctionAddress: addresses.auction, currency, amount,
      });

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'offer',
        args: [params.contract, toInteger(params.tokenId, 'tokenId'), currency, amount, convertible],
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

    async convertToAuction(params) {
      const { walletClient, account, accountAddress } = requireWallet(config);

      const currency = params.currency ?? ETH_ADDRESS;
      const tokenId = toInteger(params.tokenId, 'tokenId');
      const amount = toWei(params.amount);
      const duration = toInteger(params.duration, 'duration');
      const splitAddresses = params.splitAddresses ?? [accountAddress];
      const splitRatios = params.splitRatios ?? [100];

      const [, currentAmount, , , convertible] = await publicClient.readContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'tokenCurrentOffers',
        args: [params.contract, tokenId, currency],
      });

      if (currentAmount === 0n) {
        throw new Error('No active offer for this token in the specified currency.');
      }
      if (!convertible) {
        throw new Error(
          'Offer is not convertible. Only offers created with --convertible can be converted to an auction.',
        );
      }
      if (currentAmount !== amount) {
        throw new Error(
          `Offer amount mismatch. On-chain offer is ${currentAmount} (wei) but --amount expects ${amount} (wei). ` +
            'Re-check with "rare offer status".',
        );
      }

      await ensureNftApproved(
        publicClient, walletClient, account, accountAddress,
        params.contract, addresses.auction,
      );

      const txHash = await walletClient.writeContract({
        address: addresses.auction,
        abi: auctionAbi,
        functionName: 'convertOfferToAuction',
        args: [params.contract, tokenId, currency, amount, duration, splitAddresses, splitRatios],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async getStatus(params) {
      const currency = params.currency ?? ETH_ADDRESS;
      const tokenId = toInteger(params.tokenId, 'tokenId');

      const [offerSettled, ownerSettled, delaySettled] = await Promise.allSettled([
        publicClient.readContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'tokenCurrentOffers',
          args: [params.contract, tokenId, currency],
        }),
        publicClient.readContract({
          address: params.contract,
          abi: tokenAbi,
          functionName: 'ownerOf',
          args: [tokenId],
        }),
        publicClient.readContract({
          address: addresses.auction,
          abi: auctionAbi,
          functionName: 'offerCancelationDelay',
        }),
      ]);

      if (offerSettled.status !== 'fulfilled') {
        throw offerSettled.reason;
      }
      const [buyer, amount, timestamp, marketplaceFee, convertible] = offerSettled.value;
      const hasOffer = amount > 0n;

      const tokenOwner = ownerSettled.status === 'fulfilled' ? ownerSettled.value : null;
      const cancellationDelay = delaySettled.status === 'fulfilled' ? delaySettled.value : null;
      const cancellableAfter =
        hasOffer && cancellationDelay !== null ? timestamp + cancellationDelay : null;

      const wallet = config.account ?? config.walletClient?.account?.address ?? null;
      let canAccept: boolean | null = null;
      let canCancel: boolean | null = null;
      let canConvertToAuction: boolean | null = null;
      if (wallet) {
        const w = wallet.toLowerCase();
        const owner = tokenOwner?.toLowerCase() ?? null;
        const buyerLower = buyer.toLowerCase();
        const now = BigInt(Math.floor(Date.now() / 1000));
        canAccept = hasOffer && owner !== null && w === owner;
        canCancel =
          hasOffer && w === buyerLower && (cancellableAfter === null || now >= cancellableAfter);
        canConvertToAuction = hasOffer && convertible && owner !== null && w === owner;
      }

      return {
        buyer,
        amount,
        timestamp,
        marketplaceFee,
        convertible,
        hasOffer,
        currency,
        tokenOwner,
        cancellableAfter,
        canAccept,
        canCancel,
        canConvertToAuction,
      };
    },
  };
}
