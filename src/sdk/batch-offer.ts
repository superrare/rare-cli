import {
  parseEventLogs,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { batchOfferAbi } from '../contracts/abis/batch-offer.js';
import { tokenAbi } from '../contracts/abis/token.js';
import { requireContractAddress, type SupportedChain } from '../contracts/addresses.js';
import {
  approvalAbi,
  preparePaymentForSpender,
  requireWallet,
  waitForApproval,
} from './helpers.js';
import type { RareClient, RareClientConfig } from './types.js';
import {
  planBatchOfferAccept,
  planBatchOfferCreate,
  planBatchOfferRoot,
  shapeBatchOfferStatus,
} from './batch-offer-core.js';

export function createBatchOfferNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  chain: SupportedChain,
): RareClient['batch']['offer'] {
  return {
    async create(params) {
      const batchOfferCreator = requireContractAddress(chain, 'batchOfferCreator');
      const marketplaceSettingsSource = requireContractAddress(chain, 'auction');
      const { walletClient, account, accountAddress } = requireWallet(config);
      const block = await publicClient.getBlock();
      const plan = planBatchOfferCreate(params, block.timestamp);
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

    async revoke(params) {
      const batchOfferCreator = requireContractAddress(chain, 'batchOfferCreator');
      const { walletClient, account, accountAddress } = requireWallet(config);
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
        creator: revoked.args.creator ?? accountAddress,
        root: revoked.args.rootHash,
        amount: revoked.args.amount,
        currency: revoked.args.currency,
      };
    },

    async accept(params) {
      const batchOfferCreator = requireContractAddress(chain, 'batchOfferCreator');
      const { walletClient, account, accountAddress } = requireWallet(config);
      const plan = planBatchOfferAccept(params, accountAddress);
      const owner = await publicClient.readContract({
        address: plan.contract,
        abi: tokenAbi,
        functionName: 'ownerOf',
        args: [plan.tokenId],
      });

      if (owner.toLowerCase() !== accountAddress.toLowerCase()) {
        throw new Error(`Connected wallet ${accountAddress} does not own token ${plan.contract} #${plan.tokenId.toString()}.`);
      }

      let approvalTxHash: `0x${string}` | undefined;
      if (plan.autoApprove) {
        const isApproved = await publicClient.readContract({
          address: plan.contract,
          abi: approvalAbi,
          functionName: 'isApprovedForAll',
          args: [accountAddress, batchOfferCreator],
        });

        if (!isApproved) {
          approvalTxHash = await walletClient.writeContract({
            address: plan.contract,
            abi: approvalAbi,
            functionName: 'setApprovalForAll',
            args: [batchOfferCreator, true],
            account,
            chain: undefined,
          });
          await publicClient.waitForTransactionReceipt({ hash: approvalTxHash });
          await waitForApproval(publicClient, plan.contract, accountAddress, batchOfferCreator);
        }
      }

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

    async getStatus(params) {
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

function shapeBatchOfferRead(value: unknown): {
  creator: Address;
  rootHash: Hex;
  amount: bigint;
  currency: Address;
  expiry: bigint;
  feePercentage?: bigint;
} {
  if (Array.isArray(value)) {
    return {
      creator: value[0] as Address,
      rootHash: value[1] as Hex,
      amount: value[2] as bigint,
      currency: value[3] as Address,
      expiry: value[4] as bigint,
      feePercentage: value[5] as bigint | undefined,
    };
  }

  const offer = value as {
    creator: Address;
    rootHash: Hex;
    amount: bigint;
    currency: Address;
    expiry: bigint;
    feePercentage?: bigint;
  };

  return offer;
}
