import {
  isAddressEqual,
  parseUnits,
  parseEventLogs,
  type Address,
  type Hash,
  type PublicClient,
} from 'viem';
import { batchOfferAbi } from '../contracts/abis/batch-offer.js';
import { tokenAbi } from '../contracts/abis/token.js';
import { ETH_ADDRESS, requireContractAddress, type SupportedChain } from '../contracts/addresses.js';
import {
  approvalAbi,
  preparePaymentForSpender,
  requireWallet,
  resolveCurrencyDecimals,
  stringifyAmountInput,
  waitForApproval,
} from './helpers.js';
import type { RareClient, RareClientConfig, WalletAccount } from './types.js';
import {
  planBatchOfferAccept,
  planBatchOfferCreate,
  planBatchOfferRoot,
  shapeBatchOfferRead,
  shapeBatchOfferStatus,
} from './batch-offer-core.js';

export function createBatchOfferNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  chain: SupportedChain,
): RareClient['batch']['offer'] {
  return {
    async create(params): ReturnType<RareClient['batch']['offer']['create']> {
      const batchOfferCreator = requireContractAddress(chain, 'batchOfferCreator');
      const marketplaceSettingsSource = requireContractAddress(chain, 'auction');
      const { walletClient, account, accountAddress } = requireWallet(config);
      const block = await publicClient.getBlock();
      const currency = params.currency ?? ETH_ADDRESS;
      const amount = typeof params.amount === 'bigint'
        ? params.amount
        : parseUnits(stringifyAmountInput(params.amount, 'amount'), await resolveCurrencyDecimals(publicClient, chain, currency));
      const plan = planBatchOfferCreate({ ...params, currency, amount }, block.timestamp);
      const payment = await preparePaymentForSpender({
        publicClient,
        walletClient,
        account,
        accountAddress,
        marketplaceSettingsSource,
        spenderAddress: batchOfferCreator,
        currency: plan.currency,
        amount: plan.amount,
      });

      const txHash = await walletClient.writeContract({
        address: batchOfferCreator,
        abi: batchOfferAbi,
        functionName: 'createBatchOffer',
        args: [plan.root, plan.amount, plan.currency, plan.expiry],
        account,
        chain: undefined,
        value: payment.value,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: batchOfferAbi,
        logs: receipt.logs,
        eventName: 'BatchOfferCreated',
      });
      const [created] = logs;

      if (!created) {
        throw new Error('Batch offer create transaction succeeded but BatchOfferCreated was not found in logs.');
      }

      return {
        txHash,
        receipt,
        batchOfferCreator,
        creator: created.args.creator,
        root: created.args.rootHash,
        amount: created.args.amount,
        currency: created.args.currency,
        expiry: created.args.expiry,
        requiredPayment: payment.requiredAmount,
        approvalTxHash: payment.approvalTxHash,
      };
    },

    async revoke(params): ReturnType<RareClient['batch']['offer']['revoke']> {
      const batchOfferCreator = requireContractAddress(chain, 'batchOfferCreator');
      const { walletClient, account } = requireWallet(config);
      const plan = planBatchOfferRoot(params);

      const txHash = await walletClient.writeContract({
        address: batchOfferCreator,
        abi: batchOfferAbi,
        functionName: 'revokeBatchOffer',
        args: [plan.root],
        account,
        chain: undefined,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: batchOfferAbi,
        logs: receipt.logs,
        eventName: 'BatchOfferRevoked',
      });
      const [revoked] = logs;

      if (!revoked) {
        throw new Error('Batch offer revoke transaction succeeded but BatchOfferRevoked was not found in logs.');
      }

      return {
        txHash,
        receipt,
        batchOfferCreator,
        creator: revoked.args.creator,
        root: revoked.args.rootHash,
        amount: revoked.args.amount,
        currency: revoked.args.currency,
      };
    },

    async accept(params): ReturnType<RareClient['batch']['offer']['accept']> {
      const batchOfferCreator = requireContractAddress(chain, 'batchOfferCreator');
      const { walletClient, account, accountAddress } = requireWallet(config);
      const plan = planBatchOfferAccept(params, accountAddress);
      const owner = await publicClient.readContract({
        address: plan.contract,
        abi: tokenAbi,
        functionName: 'ownerOf',
        args: [plan.tokenId],
      });

      if (!isAddressEqual(owner, accountAddress)) {
        throw new Error(`Connected wallet ${accountAddress} does not own token ${plan.contract} #${plan.tokenId.toString()}.`);
      }

      const approvalTxHash = plan.autoApprove
        ? await approveNftContractIfNeeded({
          publicClient,
          walletClient,
          account,
          accountAddress,
          nftAddress: plan.contract,
          operator: batchOfferCreator,
        })
        : undefined;

      const txHash = await walletClient.writeContract({
        address: batchOfferCreator,
        abi: batchOfferAbi,
        functionName: 'acceptBatchOffer',
        args: [
          plan.creator,
          plan.proof,
          plan.root,
          plan.contract,
          plan.tokenId,
          plan.splitAddresses,
          plan.splitRatios,
        ],
        account,
        chain: undefined,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: batchOfferAbi,
        logs: receipt.logs,
        eventName: 'BatchOfferAccepted',
      });
      const [accepted] = logs;

      if (!accepted) {
        throw new Error('Batch offer accept transaction succeeded but BatchOfferAccepted was not found in logs.');
      }

      return {
        txHash,
        receipt,
        batchOfferCreator,
        seller: accepted.args.seller,
        buyer: accepted.args.buyer,
        creator: plan.creator,
        contract: accepted.args.contractAddress,
        tokenId: accepted.args.tokenId,
        root: accepted.args.rootHash,
        currency: accepted.args.currency,
        amount: accepted.args.amount,
        approvalTxHash,
      };
    },

    async getStatus(params): ReturnType<RareClient['batch']['offer']['getStatus']> {
      const batchOfferCreator = requireContractAddress(chain, 'batchOfferCreator');
      const plan = planBatchOfferRoot(params);
      const [offer, block] = await Promise.all([
        publicClient.readContract({
          address: batchOfferCreator,
          abi: batchOfferAbi,
          functionName: 'getBatchOffer',
          args: [params.creator, plan.root],
        }),
        publicClient.getBlock(),
      ]);

      return shapeBatchOfferStatus(shapeBatchOfferRead(offer), {
        creator: params.creator,
        root: plan.root,
      }, block.timestamp);
    },
  };
}

async function approveNftContractIfNeeded(opts: {
  publicClient: PublicClient;
  walletClient: NonNullable<RareClientConfig['walletClient']>;
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
