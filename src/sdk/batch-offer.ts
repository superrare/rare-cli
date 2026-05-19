import {
  isAddressEqual,
  parseUnits,
  parseEventLogs,
  type PublicClient,
} from 'viem';
import { batchOfferAbi } from '../contracts/abis/batch-offer.js';
import { tokenAbi } from '../contracts/abis/token.js';
import { ETH_ADDRESS, chainIds, requireContractAddress, type SupportedChain } from '../contracts/addresses.js';
import { approveNftContractIfNeeded } from './approvals-shell.js';
import {
  preparePaymentForSpender,
  resolveCurrencyDecimals,
} from './payments-shell.js';
import { requireInput } from './validation-core.js';
import { requireWallet } from './wallet-shell.js';
import { stringifyAmountInput } from './amounts-core.js';
import type { RareClientConfig } from './types/client.js';
import type { BatchOfferNamespace } from './types/batch-offer.js';
import {
  planBatchOfferAccept,
  planBatchOfferCreate,
  planBatchOfferRoot,
  shapeBatchOfferRead,
  shapeBatchOfferStatus,
} from './batch-offer-core.js';
import {
  generateApiNftMerkleRoot,
  resolveApiNftMerkleProof,
} from './merkle-api.js';
import { resolveCurrencyForSdk } from './currency.js';

export type * from './types/batch-offer.js';

export function createBatchOfferNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  chain: SupportedChain,
): BatchOfferNamespace {
  return {
    async create(params): ReturnType<BatchOfferNamespace['create']> {
      const batchOfferCreator = requireContractAddress(chain, 'batchOfferCreator');
      const marketplaceSettingsSource = requireContractAddress(chain, 'auction');
      const { walletClient, account, accountAddress } = requireWallet(config);
      const block = await publicClient.getBlock();
      const resolvedParams = await resolveBatchOfferCreateParams(config, params);
      const currency = resolvedParams.currency === undefined
        ? ETH_ADDRESS
        : resolveCurrencyForSdk(resolvedParams.currency, chain).address;
      const price = requireInput(resolvedParams.price, 'price');
      const amount = typeof price === 'bigint'
        ? price
        : parseUnits(stringifyAmountInput(price, 'price'), await resolveCurrencyDecimals(publicClient, chain, currency));
      const plan = planBatchOfferCreate({ ...resolvedParams, price: amount, currency }, block.timestamp);
      const payment = await preparePaymentForSpender({
        publicClient,
        walletClient,
        account,
        accountAddress,
        marketplaceSettingsSource,
        spenderAddress: batchOfferCreator,
        currency: plan.currency,
        amount: plan.amount,
        autoApprove: params.autoApprove,
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

    async revoke(params): ReturnType<BatchOfferNamespace['revoke']> {
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

    async accept(params): ReturnType<BatchOfferNamespace['accept']> {
      const batchOfferCreator = requireContractAddress(chain, 'batchOfferCreator');
      const { walletClient, account, accountAddress } = requireWallet(config);
      const resolvedParams = await resolveBatchOfferAcceptParams(config, chainIds[chain], params);
      const plan = planBatchOfferAccept(resolvedParams, accountAddress);
      const owner = await publicClient.readContract({
        address: plan.contract,
        abi: tokenAbi,
        functionName: 'ownerOf',
        args: [plan.tokenId],
      });

      if (!isAddressEqual(owner, accountAddress)) {
        throw new Error(`Connected wallet ${accountAddress} does not own token ${plan.contract} #${plan.tokenId.toString()}.`);
      }

      const approvalTxHash = await approveNftContractIfNeeded({
          publicClient,
          walletClient,
          account,
          accountAddress,
          nftAddress: plan.contract,
          operator: batchOfferCreator,
          autoApprove: plan.autoApprove,
        });

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

    async status(params): ReturnType<BatchOfferNamespace['status']> {
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

async function resolveBatchOfferCreateParams(
  config: RareClientConfig,
  params: Parameters<BatchOfferNamespace['create']>[0],
): Promise<Parameters<BatchOfferNamespace['create']>[0]> {
  if (params.root !== undefined || params.artifact === undefined) {
    return params;
  }

  const root = await generateApiNftMerkleRoot(config, params.artifact.tokens);
  return {
    ...params,
    root,
    artifact: undefined,
  };
}

async function resolveBatchOfferAcceptParams(
  config: RareClientConfig,
  chainId: number,
  params: Parameters<BatchOfferNamespace['accept']>[0],
): Promise<Parameters<BatchOfferNamespace['accept']>[0]> {
  if (
    params.proofArtifact !== undefined ||
    (params.root !== undefined && params.proof !== undefined)
  ) {
    return params;
  }

  const proof = await resolveApiNftMerkleProof(config, {
    chainId,
    contractAddress: params.contract,
    tokenId: params.tokenId,
    root: params.root,
    context: 'batch-offer',
    creator: params.creator,
  });

  return {
    ...params,
    root: proof.root,
    proof: proof.proof,
  };
}
