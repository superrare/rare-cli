import { encodeAbiParameters, type Address } from 'viem';
import {
  chainIds,
  getCcipChainSelector,
  getRareBridgeAddress,
  resolveCurrency,
  type SupportedChain,
} from '../contracts/addresses.js';

export type BridgeRoute = {
  sourceChain: SupportedChain;
  destinationChain: SupportedChain;
};

export type BridgeInfo = {
  chain: SupportedChain;
  chainId: number;
  rareBridgeAddress: Address;
  rareTokenAddress: Address;
  ccipChainSelector: bigint;
};

export type BridgeSendArgs = readonly [
  destinationChainSelector: bigint,
  destinationBridgeAddress: Address,
  distributionData: `0x${string}`,
  extraArgs: `0x${string}`,
  payFeesInLink: boolean,
];

export type BridgeRouteValidation =
  | { isValid: true }
  | {
      isValid: false;
      error: 'unsupported_bridge_route';
      errorMessage: string;
    };

const allowedBridgePairs: readonly BridgeRoute[] = [
  { sourceChain: 'mainnet', destinationChain: 'base' },
  { sourceChain: 'base', destinationChain: 'mainnet' },
  { sourceChain: 'sepolia', destinationChain: 'base-sepolia' },
  { sourceChain: 'base-sepolia', destinationChain: 'sepolia' },
];

export function validateBridgeRoute(route: BridgeRoute): BridgeRouteValidation {
  const supported = allowedBridgePairs.some((pair) =>
    pair.sourceChain === route.sourceChain && pair.destinationChain === route.destinationChain,
  );

  if (supported) {
    return { isValid: true };
  }

  return {
    isValid: false,
    error: 'unsupported_bridge_route',
    errorMessage:
      `Unsupported RARE bridge route "${route.sourceChain}" -> "${route.destinationChain}". ` +
      'Supported routes: mainnet <-> base, sepolia <-> base-sepolia.',
  };
}

export function getBridgeInfo(chain: SupportedChain): BridgeInfo {
  return {
    chain,
    chainId: chainIds[chain],
    rareBridgeAddress: getRareBridgeAddress(chain),
    rareTokenAddress: resolveCurrency('rare', chain),
    ccipChainSelector: getCcipChainSelector(chain),
  };
}

export function encodeBridgeDistribution(params: {
  recipient: Address;
  amount: bigint;
}): `0x${string}` {
  return encodeAbiParameters(
    [
      { name: 'recipients', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
    ],
    [[params.recipient], [params.amount]],
  );
}

export function buildBridgeSendArgs(params: {
  destinationBridgeInfo: BridgeInfo;
  distributionData: `0x${string}`;
}): BridgeSendArgs {
  return [
    params.destinationBridgeInfo.ccipChainSelector,
    params.destinationBridgeInfo.rareBridgeAddress,
    params.distributionData,
    '0x',
    false,
  ];
}

export function buildCcipExplorerUrl(txHash: `0x${string}`): string {
  return `https://ccip.chain.link/tx/${txHash}`;
}
