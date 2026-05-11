import {
  parseEventLogs,
  type Address,
  type PublicClient,
} from 'viem';
import { collectionMarketAbi } from '../contracts/abis/collection-market.js';
import { tokenAbi } from '../contracts/abis/token.js';
import { requireContractAddress, type SupportedChain } from '../contracts/addresses.js';
import {
  approvalAbi,
  calculateMarketplacePaymentAmountFromSettings,
  marketplaceSettingsAbi,
  preparePaymentAmountForSpender,
  requireWallet,
  waitForApproval,
} from './helpers.js';
import type { RareClient, RareClientConfig } from './types.js';
import {
  calculateCollectionOfferTopUp,
  type CollectionMarketOfferRead,
  planCollectionMarketOfferAccept,
  planCollectionMarketOfferCancel,
  planCollectionMarketOfferCreate,
  planCollectionMarketOfferStatus,
  shapeCollectionMarketOfferRead,
  shapeCollectionMarketOfferStatus,
} from './collection-market-core.js';

export function createCollectionMarketNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  chain: SupportedChain,
): RareClient['collectionMarket'] {
  return {
    offer: {
      async create(params) {
        const collectionMarket = requireContractAddress(chain, 'collectionMarket');
        const { walletClient, account, accountAddress } = requireWallet(config);
        const plan = planCollectionMarketOfferCreate(params);
        const [marketplaceSettings, existingOffer] = await Promise.all([
          readMarketplaceSettings(publicClient, collectionMarket),
          readCollectionOffer(publicClient, collectionMarket, plan.originCollection, accountAddress),
        ]);
        const [requiredPayment, currentFeePercentage] = await Promise.all([
          calculateMarketplacePaymentAmountFromSettings(publicClient, marketplaceSettings, plan.amount),
          publicClient.readContract({
            address: marketplaceSettings,
            abi: marketplaceSettingsAbi,
            functionName: 'getMarketplaceFeePercentage',
          }),
        ]);
        const requiredTopUp = calculateCollectionOfferTopUp({
          amount: plan.amount,
          currency: plan.currency,
          requiredPayment,
          currentMarketplaceFeePercentage: BigInt(currentFeePercentage),
          existingOffer,
        });
        const payment = await preparePaymentAmountForSpender({
          publicClient,
          walletClient,
          account,
          accountAddress,
          spenderAddress: collectionMarket,
          currency: plan.currency,
          requiredAmount: requiredTopUp,
          autoApprove: plan.autoApprove,
        });

        const txHash = await walletClient.writeContract({
          address: collectionMarket,
          abi: collectionMarketAbi,
          functionName: 'makeCollectionOffer',
          args: [plan.originCollection, plan.currency, plan.amount],
          account,
          chain: undefined,
          value: payment.value,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        const logs = parseEventLogs({
          abi: collectionMarketAbi,
          logs: receipt.logs,
          eventName: 'CollectionOfferPlaced',
        });
        const [created] = logs;

        if (!created) {
          throw new Error('Collection market offer create transaction succeeded but CollectionOfferPlaced was not found in logs.');
        }

        return {
          txHash,
          receipt,
          collectionMarket,
          buyer: created.args._buyer,
          originCollection: created.args._originContract,
          currency: created.args._currencyAddress,
          amount: created.args._amount,
          requiredPayment: payment.requiredAmount,
          approvalTxHash: payment.approvalTxHash,
        };
      },

      async cancel(params) {
        const collectionMarket = requireContractAddress(chain, 'collectionMarket');
        const { walletClient, account, accountAddress } = requireWallet(config);
        const plan = planCollectionMarketOfferCancel(params);
        const existingOffer = await readCollectionOffer(
          publicClient,
          collectionMarket,
          plan.originCollection,
          accountAddress,
        );

        const txHash = await walletClient.writeContract({
          address: collectionMarket,
          abi: collectionMarketAbi,
          functionName: 'cancelCollectionOffer',
          args: [plan.originCollection],
          account,
          chain: undefined,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        const logs = parseEventLogs({
          abi: collectionMarketAbi,
          logs: receipt.logs,
          eventName: 'CollectionOfferCancelled',
        });
        const [cancelled] = logs;

        return {
          txHash,
          receipt,
          collectionMarket,
          buyer: cancelled?.args._buyer ?? accountAddress,
          originCollection: cancelled?.args._originContract ?? plan.originCollection,
          hadOffer: existingOffer.amount > 0n,
          currency: existingOffer.currencyAddress,
          amount: existingOffer.amount,
        };
      },

      async accept(params) {
        const collectionMarket = requireContractAddress(chain, 'collectionMarket');
        const { walletClient, account, accountAddress } = requireWallet(config);
        const plan = planCollectionMarketOfferAccept(params, accountAddress);
        const owner = await publicClient.readContract({
          address: plan.originCollection,
          abi: tokenAbi,
          functionName: 'ownerOf',
          args: [plan.tokenId],
        });

        if (owner.toLowerCase() !== accountAddress.toLowerCase()) {
          throw new Error(
            `Connected wallet ${accountAddress} does not own token ${plan.originCollection} #${plan.tokenId.toString()}.`,
          );
        }

        let approvalTxHash: `0x${string}` | undefined;
        if (plan.autoApprove) {
          const isApproved = await publicClient.readContract({
            address: plan.originCollection,
            abi: approvalAbi,
            functionName: 'isApprovedForAll',
            args: [accountAddress, collectionMarket],
          });

          if (!isApproved) {
            approvalTxHash = await walletClient.writeContract({
              address: plan.originCollection,
              abi: approvalAbi,
              functionName: 'setApprovalForAll',
              args: [collectionMarket, true],
              account,
              chain: undefined,
            });
            await publicClient.waitForTransactionReceipt({ hash: approvalTxHash });
            await waitForApproval(publicClient, plan.originCollection, accountAddress, collectionMarket);
          }
        }

        const txHash = await walletClient.writeContract({
          address: collectionMarket,
          abi: collectionMarketAbi,
          functionName: 'acceptCollectionOffer',
          args: [
            plan.buyer,
            plan.originCollection,
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
        const logs = parseEventLogs({
          abi: collectionMarketAbi,
          logs: receipt.logs,
          eventName: 'AcceptCollectionOffer',
        });
        const [accepted] = logs;

        if (!accepted) {
          throw new Error('Collection market offer accept transaction succeeded but AcceptCollectionOffer was not found in logs.');
        }

        return {
          txHash,
          receipt,
          collectionMarket,
          seller: accepted.args._seller,
          buyer: accepted.args._buyer,
          originCollection: accepted.args._originContract,
          tokenId: accepted.args._tokenId,
          currency: accepted.args._currencyAddress,
          amount: accepted.args._amount,
          approvalTxHash,
        };
      },

      async getStatus(params) {
        const collectionMarket = requireContractAddress(chain, 'collectionMarket');
        const account = params.account ?? config.account ?? config.walletClient?.account?.address;
        const plan = planCollectionMarketOfferStatus({ ...params, account });
        const [offer, tokenOwner] = await Promise.all([
          readCollectionOffer(publicClient, collectionMarket, plan.originCollection, plan.buyer),
          plan.tokenId === undefined
            ? Promise.resolve(undefined)
            : publicClient.readContract({
                address: plan.originCollection,
                abi: tokenAbi,
                functionName: 'ownerOf',
                args: [plan.tokenId],
              }),
        ]);

        return shapeCollectionMarketOfferStatus(offer, {
          buyer: plan.buyer,
          originCollection: plan.originCollection,
          tokenId: plan.tokenId,
          account: plan.account,
          tokenOwner,
        });
      },
    },
  };
}

async function readMarketplaceSettings(
  publicClient: PublicClient,
  collectionMarket: Address,
): Promise<Address> {
  const marketConfig = await publicClient.readContract({
    address: collectionMarket,
    abi: collectionMarketAbi,
    functionName: 'getMarketConfig',
  });

  if (Array.isArray(marketConfig)) {
    return marketConfig[1] as Address;
  }

  return marketConfig.marketplaceSettings;
}

async function readCollectionOffer(
  publicClient: PublicClient,
  collectionMarket: Address,
  originCollection: Address,
  buyer: Address,
): Promise<CollectionMarketOfferRead> {
  const offer = await publicClient.readContract({
    address: collectionMarket,
    abi: collectionMarketAbi,
    functionName: 'getCollectionOffer',
    args: [originCollection, buyer],
  });

  return shapeCollectionMarketOfferRead(offer);
}
