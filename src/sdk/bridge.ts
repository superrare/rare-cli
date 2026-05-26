import { encodeFunctionData, type Address, type PublicClient } from 'viem';
import { rareBridgeAbi } from '../contracts/abis/rare-bridge.js';
import type { SupportedChain } from '../contracts/addresses.js';
import {
  buildBridgeSendArgs,
  buildCcipExplorerUrl,
  encodeBridgeDistribution,
  getBridgeInfo,
  validateBridgeRoute,
} from './bridge-core.js';
import { toPositiveWei } from './amounts-core.js';
import { preparePaymentAmountForSpender } from './payments-shell.js';
import { runWithApprovalSideEffectAlert } from './approvals-shell.js';
import { getConfiguredAccountAddress, requireWallet } from './wallet-shell.js';
import type { RareClientConfig } from './types/client.js';
import type {
  BridgeNamespace,
  BridgeParams,
  BridgeQuote,
  BridgeResult,
  BridgeSendParams,
} from './types/bridge.js';

export type * from './types/bridge.js';

export function createBridgeNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  sourceChain: SupportedChain,
): BridgeNamespace {
  return {
    async quote(params): ReturnType<BridgeNamespace['quote']> {
      return buildBridgeQuote(publicClient, config, sourceChain, params);
    },

    async send(params): ReturnType<BridgeNamespace['send']> {
      return executeBridge(publicClient, config, sourceChain, params);
    },
  };
}

async function executeBridge(
  publicClient: PublicClient,
  config: RareClientConfig,
  sourceChain: SupportedChain,
  params: BridgeSendParams,
): Promise<BridgeResult> {
  const { walletClient, account, accountAddress } = requireWallet(config);
  const quote = await buildBridgeQuote(publicClient, config, sourceChain, {
    ...params,
    recipient: params.recipient ?? accountAddress,
  }, {
    estimateGas: false,
  });

  const approval = await preparePaymentAmountForSpender({
    publicClient,
    walletClient,
    account,
    accountAddress,
    spenderAddress: quote.sourceBridgeAddress,
    currency: quote.rareTokenAddress,
    requiredAmount: quote.amount,
    autoApprove: params.autoApprove,
  });

  const sendArgs = buildBridgeSendArgs({
    destinationBridgeInfo: getBridgeInfo(quote.destinationChain),
    distributionData: quote.distributionData,
  });
  const { txHash, receipt, estimatedGas } = await runWithApprovalSideEffectAlert({
    operation: 'bridge send',
    approvals: [{
      type: 'erc20',
      approvalTxHash: approval.approvalTxHash,
      target: quote.rareTokenAddress,
      spender: quote.sourceBridgeAddress,
    }],
    run: async () => {
      const gas = await estimateBridgeGas(publicClient, {
        account: accountAddress,
        sourceBridgeAddress: quote.sourceBridgeAddress,
        args: sendArgs,
        nativeFee: quote.nativeFee,
      });
      const targetTxHash = await walletClient.writeContract({
        address: quote.sourceBridgeAddress,
        abi: rareBridgeAbi,
        functionName: 'send',
        args: sendArgs,
        value: quote.nativeFee,
        account,
        chain: undefined,
      });
      const targetReceipt = await publicClient.waitForTransactionReceipt({ hash: targetTxHash });

      return { txHash: targetTxHash, receipt: targetReceipt, estimatedGas: gas };
    },
  });

  return {
    ...quote,
    estimatedGas,
    txHash,
    receipt,
    approvalTxHash: approval.approvalTxHash,
    ccipExplorerUrl: buildCcipExplorerUrl(txHash),
  };
}

async function buildBridgeQuote(
  publicClient: PublicClient,
  config: RareClientConfig,
  sourceChain: SupportedChain,
  params: BridgeParams,
  options: { estimateGas?: boolean } = {},
): Promise<BridgeQuote> {
  const routeValidation = validateBridgeRoute({
    sourceChain,
    destinationChain: params.destinationChain,
  });
  if (!routeValidation.isValid) {
    throw new Error(routeValidation.errorMessage);
  }

  const sourceBridgeInfo = getBridgeInfo(sourceChain);
  const destinationBridgeInfo = getBridgeInfo(params.destinationChain);
  const recipient = resolveRecipient(params.recipient, config);
  const amount = toPositiveWei(params.amount, 'amount');
  const distributionData = encodeBridgeDistribution({ recipient, amount });
  const args = buildBridgeSendArgs({
    destinationBridgeInfo,
    distributionData,
  });
  const nativeFee = await publicClient.readContract({
    address: sourceBridgeInfo.rareBridgeAddress,
    abi: rareBridgeAbi,
    functionName: 'getFee',
    args,
  });
  const estimatedGas = options.estimateGas === false
    ? undefined
    : await estimateBridgeGas(publicClient, {
        account: getConfiguredAccountAddress(config),
        sourceBridgeAddress: sourceBridgeInfo.rareBridgeAddress,
        args,
        nativeFee,
      });

  return {
    sourceChain,
    sourceChainId: sourceBridgeInfo.chainId,
    destinationChain: params.destinationChain,
    destinationChainId: destinationBridgeInfo.chainId,
    sourceBridgeAddress: sourceBridgeInfo.rareBridgeAddress,
    destinationBridgeAddress: destinationBridgeInfo.rareBridgeAddress,
    rareTokenAddress: sourceBridgeInfo.rareTokenAddress,
    destinationCcipChainSelector: destinationBridgeInfo.ccipChainSelector,
    amount,
    recipient,
    distributionData,
    nativeFee,
    estimatedGas,
  };
}

function resolveRecipient(recipient: Address | undefined, config: RareClientConfig): Address {
  const resolved = recipient ?? getConfiguredAccountAddress(config);
  if (resolved === undefined) {
    throw new Error('No recipient available for bridge quote. Pass params.recipient or provide config.account/walletClient with an account.');
  }
  return resolved;
}

async function estimateBridgeGas(
  publicClient: PublicClient,
  params: {
    account?: Address;
    sourceBridgeAddress: Address;
    args: ReturnType<typeof buildBridgeSendArgs>;
    nativeFee: bigint;
  },
): Promise<bigint | undefined> {
  if (params.account === undefined) {
    return undefined;
  }

  return publicClient.estimateGas({
    account: params.account,
    to: params.sourceBridgeAddress,
    data: encodeFunctionData({
      abi: rareBridgeAbi,
      functionName: 'send',
      args: params.args,
    }),
    value: params.nativeFee,
  });
}
