import type { Address } from 'viem';
import type { SupportedChain } from '../../contracts/addresses.js';
import type { AmountInput, TransactionResult } from './common.js';

export type BridgeParams = {
  amount: AmountInput;
  destinationChain: SupportedChain;
  recipient?: Address;
}

export type BridgeSendParams = BridgeParams & {
  autoApprove?: boolean;
}

export type BridgeQuote = {
  sourceChain: SupportedChain;
  sourceChainId: number;
  destinationChain: SupportedChain;
  destinationChainId: number;
  sourceBridgeAddress: Address;
  destinationBridgeAddress: Address;
  rareTokenAddress: Address;
  destinationCcipChainSelector: bigint;
  amount: bigint;
  recipient: Address;
  distributionData: `0x${string}`;
  nativeFee: bigint;
  estimatedGas?: bigint;
}

export type BridgeResult = BridgeQuote & TransactionResult & {
  approvalTxHash?: `0x${string}`;
  ccipExplorerUrl: string;
}

export type BridgeNamespace = {
  quote: (params: BridgeParams) => Promise<BridgeQuote>;
  send: (params: BridgeSendParams) => Promise<BridgeResult>;
}
