import { type Address, type Hash, type PublicClient, parseEventLogs } from 'viem';
import { sovereignFactoryAbi } from '../contracts/abis/sovereign-factory.js';
import { requireContractAddress, type SupportedChain } from '../contracts/addresses.js';
import type { RareClientConfig, RareClient } from './types.js';
import { requireWallet } from './helpers.js';
import { planCreateSovereignCollection } from './collection-core.js';

export function createCollectionNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  chain: SupportedChain,
  baseCollection: Pick<RareClient['collection'], 'get' | 'events'>,
): RareClient['collection'] {
  return {
    ...baseCollection,

    async createSovereign(params) {
      const plan = planCreateSovereignCollection(params);
      const factoryAddress = requireContractAddress(chain, 'sovereignFactory');
      const { walletClient, account } = requireWallet(config);
      const txHash = await writeCreateSovereignCollection({
        publicClient,
        walletClient,
        account,
        factoryAddress,
        plan,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: sovereignFactoryAbi,
        logs: receipt.logs,
        eventName: 'SovereignNFTContractCreated',
      });
      const [createdLog] = logs;

      if (!createdLog) {
        throw new Error('Sovereign collection transaction succeeded but SovereignNFTContractCreated was not found in logs.');
      }

      return {
        txHash,
        receipt,
        contract: createdLog.args.contractAddress,
        factory: factoryAddress,
        contractType: plan.contractType,
      };
    },
  };
}

async function writeCreateSovereignCollection(
  opts: {
    publicClient: PublicClient;
    walletClient: NonNullable<RareClientConfig['walletClient']>;
    account: ReturnType<typeof requireWallet>['account'];
    factoryAddress: Address;
    plan: ReturnType<typeof planCreateSovereignCollection>;
  },
): Promise<Hash> {
  if (opts.plan.maxTokens === undefined) {
    return opts.walletClient.writeContract({
      address: opts.factoryAddress,
      abi: sovereignFactoryAbi,
      functionName: 'createSovereignNFTContract',
      args: [opts.plan.name, opts.plan.symbol],
      account: opts.account,
      chain: undefined,
    });
  }

  if (opts.plan.contractTypeReadName === undefined) {
    return opts.walletClient.writeContract({
      address: opts.factoryAddress,
      abi: sovereignFactoryAbi,
      functionName: 'createSovereignNFTContract',
      args: [opts.plan.name, opts.plan.symbol, opts.plan.maxTokens],
      account: opts.account,
      chain: undefined,
    });
  }

  const contractType = await opts.publicClient.readContract({
    address: opts.factoryAddress,
    abi: sovereignFactoryAbi,
    functionName: opts.plan.contractTypeReadName,
  });

  return opts.walletClient.writeContract({
    address: opts.factoryAddress,
    abi: sovereignFactoryAbi,
    functionName: 'createSovereignNFTContract',
    args: [opts.plan.name, opts.plan.symbol, opts.plan.maxTokens, contractType],
    account: opts.account,
    chain: undefined,
  });
}
