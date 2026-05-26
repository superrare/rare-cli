import { Command } from 'commander';
import { formatEther } from 'viem';
import { getActiveChain } from '../config.js';
import { getConfiguredAccountAddress, getPublicClient, getWalletClient } from '../client.js';
import { isSupportedChain, supportedChains, type SupportedChain } from '../contracts/addresses.js';
import { output, log } from '../output.js';
import { createRareClient } from '../sdk/client.js';
import { parseOptionalAddress } from '../sdk/validation.js';
import { runWithPaymentApprovalConsent } from './approval-consent.js';
import { addChainOptions, type ChainOptions } from './options.js';

type BridgeQuoteOptions = ChainOptions & {
  amount?: string;
  destinationChain?: string;
  recipient?: string;
};

type BridgeSendOptions = BridgeQuoteOptions & {
  yes?: boolean;
};

export function bridgeCommand(): Command {
  const cmd = new Command('bridge');
  cmd.description('Bridge RARE across supported CCIP routes');

  cmd.addCommand(bridgeQuoteCommand());
  cmd.addCommand(bridgeSendCommand());

  return cmd;
}

function bridgeQuoteCommand(): Command {
  const cmd = new Command('quote');
  cmd.description('Quote the native fee for bridging RARE');

  addBridgeRouteOptions(cmd)
    .action(async (opts: BridgeQuoteOptions): Promise<void> => {
      const plan = parseBridgeRouteOptions(opts, 'rare bridge quote');
      const publicClient = getPublicClient(plan.sourceChain);
      const rare = createRareClient({
        publicClient,
        account: getConfiguredAccountAddress(plan.sourceChain),
      });

      const quote = await rare.bridge.quote({
        amount: plan.amount,
        destinationChain: plan.destinationChain,
        recipient: plan.recipient,
      });

      output(
        {
          sourceChain: quote.sourceChain,
          sourceChainId: quote.sourceChainId,
          destinationChain: quote.destinationChain,
          destinationChainId: quote.destinationChainId,
          sourceBridgeAddress: quote.sourceBridgeAddress,
          destinationBridgeAddress: quote.destinationBridgeAddress,
          rareTokenAddress: quote.rareTokenAddress,
          destinationCcipChainSelector: quote.destinationCcipChainSelector,
          amount: quote.amount,
          recipient: quote.recipient,
          nativeFee: quote.nativeFee,
          estimatedGas: quote.estimatedGas ?? null,
          distributionData: quote.distributionData,
        },
        () => {
          printBridgeQuote(quote);
        },
      );
    });

  return cmd;
}

function bridgeSendCommand(): Command {
  const cmd = new Command('send');
  cmd.description('Bridge RARE to another supported chain');

  addBridgeRouteOptions(cmd)
    .option('--yes', 'yes to all prompts, including approval and transaction submission')
    .action(async (opts: BridgeSendOptions): Promise<void> => {
      const plan = parseBridgeRouteOptions(opts, 'rare bridge send');
      const publicClient = getPublicClient(plan.sourceChain);
      const { client } = getWalletClient(plan.sourceChain);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Bridging RARE from ${plan.sourceChain} to ${plan.destinationChain}...`);
      log(`  Source bridge: ${rare.contracts.rareBridge ?? 'unavailable'}`);
      log(`  Amount: ${plan.amount} RARE`);
      if (plan.recipient !== undefined) {
        log(`  Recipient: ${plan.recipient}`);
      }

      const sendParams = {
        amount: plan.amount,
        destinationChain: plan.destinationChain,
        recipient: plan.recipient,
      };
      const result = await runWithPaymentApprovalConsent({
        commandName: 'rare bridge send',
        approvalMessage: 'RARE approval is required before bridging.',
        runWithoutApproval: async () => rare.bridge.send({
          ...sendParams,
          autoApprove: opts.yes === true,
        }),
        runWithApproval: async () => rare.bridge.send({
          ...sendParams,
          autoApprove: true,
        }),
      });
      if (result === undefined) {
        return;
      }

      output(
        {
          txHash: result.txHash,
          blockNumber: result.receipt.blockNumber.toString(),
          approvalTxHash: result.approvalTxHash ?? null,
          ccipExplorerUrl: result.ccipExplorerUrl,
          sourceChain: result.sourceChain,
          sourceChainId: result.sourceChainId,
          destinationChain: result.destinationChain,
          destinationChainId: result.destinationChainId,
          sourceBridgeAddress: result.sourceBridgeAddress,
          destinationBridgeAddress: result.destinationBridgeAddress,
          rareTokenAddress: result.rareTokenAddress,
          destinationCcipChainSelector: result.destinationCcipChainSelector,
          amount: result.amount,
          recipient: result.recipient,
          nativeFee: result.nativeFee,
          estimatedGas: result.estimatedGas ?? null,
          distributionData: result.distributionData,
        },
        () => {
          if (result.approvalTxHash !== undefined) {
            console.log(`Approval tx sent: ${result.approvalTxHash}`);
          }
          console.log(`Transaction sent: ${result.txHash}`);
          console.log(`Confirmed in block ${result.receipt.blockNumber}`);
          console.log(`CCIP explorer: ${result.ccipExplorerUrl}`);
        },
      );
    });

  return cmd;
}

function addBridgeRouteOptions<T extends Command>(cmd: T): T {
  return addChainOptions(cmd)
    .requiredOption('--amount <amount>', 'RARE amount to bridge')
    .requiredOption('--destination-chain <chain>', 'destination chain (mainnet, base, sepolia, base-sepolia)')
    .option('--recipient <address>', 'destination recipient address');
}

function parseBridgeRouteOptions(
  opts: BridgeQuoteOptions,
  commandName: string,
): {
  sourceChain: SupportedChain;
  destinationChain: SupportedChain;
  amount: string;
  recipient?: `0x${string}`;
} {
  if (opts.amount === undefined) {
    throw new Error(`${commandName} requires --amount.`);
  }
  if (opts.destinationChain === undefined) {
    throw new Error(`${commandName} requires --destination-chain.`);
  }

  return {
    sourceChain: getActiveChain(opts.chain, opts.chainId),
    destinationChain: parseDestinationChain(opts.destinationChain),
    amount: opts.amount,
    recipient: parseOptionalAddress(opts.recipient, '--recipient'),
  };
}

function parseDestinationChain(value: string): SupportedChain {
  if (!isSupportedChain(value)) {
    throw new Error(`--destination-chain must be one of: ${supportedChains.join(', ')}`);
  }
  return value;
}

function printBridgeQuote(quote: Awaited<ReturnType<ReturnType<typeof createRareClient>['bridge']['quote']>>): void {
  console.log(`\nRARE bridge quote: ${quote.sourceChain} -> ${quote.destinationChain}`);
  console.log(`  Amount:             ${formatEther(quote.amount)} RARE`);
  console.log(`  Recipient:          ${quote.recipient}`);
  console.log(`  Native fee:         ${formatEther(quote.nativeFee)} ETH`);
  console.log(`  Estimated gas:      ${quote.estimatedGas?.toString() ?? 'unavailable'}`);
  console.log(`  Source bridge:      ${quote.sourceBridgeAddress}`);
  console.log(`  Destination bridge: ${quote.destinationBridgeAddress}`);
}
