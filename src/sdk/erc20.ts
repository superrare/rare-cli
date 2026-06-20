import {
  erc20Abi,
  formatUnits,
  getAddress,
  isAddressEqual,
  parseEventLogs,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from 'viem';
import { erc20HolderRewardsAbi } from '../contracts/abis/erc20-holder-rewards.js';
import { liquidFactoryAbi } from '../contracts/abis/liquid-factory.js';
import { sovereignErc20MarketAbi } from '../contracts/abis/sovereign-erc20-market.js';
import { sovereignErc20Abi } from '../contracts/abis/sovereign-erc20.js';
import { resolveCurrency, type ContractAddresses, type SupportedChain } from '../contracts/addresses.js';
import { validateCurves } from '../liquid/curve-config.js';
import { runWithApprovalSideEffectAlert } from './approvals-shell.js';
import {
  buildCreateSovereignErc20MarketRewardsWrite,
  buildCreateSovereignErc20MarketWrite,
  buildCreateSovereignErc20Write,
  ERC1046_INTERFACE_ID,
  ERC165_INTERFACE_ID,
  ERC20_HOLDER_REWARDS_INTERFACE_ID,
  ERC20_INTERFACE_ID,
  ERC20_METADATA_INTERFACE_ID,
  ERC20_PERMIT_INTERFACE_ID,
  ERC5313_INTERFACE_ID,
  normalizeSovereignErc20Address,
  planDeploySovereignErc20,
  planDeploySovereignErc20Market,
  planDeploySovereignErc20MarketRewards,
  planSovereignErc20Burn,
  planSovereignErc20BurnFrom,
  planSovereignErc20Delegate,
  planSovereignErc20IsDelegate,
  planSovereignErc20Mint,
  planSovereignErc20RewardsAccount,
  planSovereignErc20RewardsClaim,
  planSovereignErc20RewardsNotify,
  planSovereignErc20RewardsStatus,
  planSovereignErc20RewardsSync,
  planSovereignErc20UpdateTokenUri,
  SOVEREIGN_ERC20_INTERFACE_ID,
  SOVEREIGN_ERC20_KIND_HASHES,
  SOVEREIGN_ERC20_MARKET_INTERFACE_ID,
  sovereignErc20KindReadNames,
  SovereignErc20UnavailableError,
  type PlannedSovereignErc20DeployAny,
} from './erc20-core.js';
import { ensureTokenAllowance } from './payments-shell.js';
import type { RareClientConfig } from './types/client.js';
import type { WalletAccount } from './types/common.js';
import type {
  Erc20Namespace,
  SovereignErc20BurnFromResult,
  SovereignErc20BurnResult,
  SovereignErc20Capabilities,
  SovereignErc20DelegateResult,
  SovereignErc20DeployResult,
  SovereignErc20FactoryConfig,
  SovereignErc20FactoryStatus,
  SovereignErc20ImplementationStatus,
  SovereignErc20Kind,
  SovereignErc20MarketDeployResult,
  SovereignErc20MarketRewardsDeployResult,
  SovereignErc20MarketStatus,
  SovereignErc20MintResult,
  SovereignErc20PoolKey,
  SovereignErc20RewardToken,
  SovereignErc20RewardTokenName,
  SovereignErc20RewardTokenStatus,
  SovereignErc20RewardsAccountStatus,
  SovereignErc20RewardsClaimResult,
  SovereignErc20RewardsExcludeResult,
  SovereignErc20RewardsNotifyResult,
  SovereignErc20RewardsStatus,
  SovereignErc20RewardsSyncResult,
  SovereignErc20Status,
  SovereignErc20UpdateTokenUriResult,
} from './types/erc20.js';
import { requireWallet } from './wallet-shell.js';

export type * from './types/erc20.js';
export { SovereignErc20UnavailableError } from './erc20-core.js';

type WalletWriteAccount = Address | WalletAccount;

type FactoryAvailability = {
  kindHash: Hex;
  implementation: Address;
}

type SovereignFactoryWrite =
  | ReturnType<typeof buildCreateSovereignErc20Write>
  | ReturnType<typeof buildCreateSovereignErc20MarketWrite>
  | ReturnType<typeof buildCreateSovereignErc20MarketRewardsWrite>
  | {
      functionName: 'delegateTokenCreation' | 'revokeTokenCreationDelegate';
      args: readonly [Address];
    };

type SovereignTokenWrite =
  | {
      functionName: 'mint';
      args: readonly [Address, bigint];
    }
  | {
      functionName: 'burn';
      args: readonly [bigint];
    }
  | {
      functionName: 'burnFrom';
      args: readonly [Address, bigint];
    }
  | {
      functionName: 'setTokenURI';
      args: readonly [string];
    };

type HolderRewardsWrite =
  | {
      functionName: 'notifyHolderRewards';
      args: readonly [bigint];
    }
  | {
      functionName: 'syncRewards';
      args: readonly [];
    }
  | {
      functionName: 'claimRewards';
      args: readonly [Address];
    }
  | {
      functionName: 'addRewardsExcluded' | 'removeRewardsExcluded';
      args: readonly [Address];
    };

const ZERO_REWARD_AMOUNT = 0n;

export function createErc20Namespace(
  config: RareClientConfig,
  chain: SupportedChain,
  chainId: number,
  addresses: Pick<ContractAddresses, 'liquidFactory'>,
): Erc20Namespace {
  const { publicClient } = config;

  return {
    async getFactoryConfig(): Promise<SovereignErc20FactoryConfig> {
      const factory = requireErc20Factory(addresses.liquidFactory, chain, chainId);
      return readFactoryConfig(publicClient, factory);
    },

    async factoryStatus(): Promise<SovereignErc20FactoryStatus> {
      const factory = requireErc20Factory(addresses.liquidFactory, chain, chainId);
      const configStatus = await readFactoryConfig(publicClient, factory);
      const [sovereign, sovereignMarket, sovereignMarketRewards] = await Promise.all([
        readImplementationStatus(publicClient, factory, chain, chainId, 'sovereign'),
        readImplementationStatus(publicClient, factory, chain, chainId, 'sovereign-market'),
        readImplementationStatus(publicClient, factory, chain, chainId, 'sovereign-market-rewards'),
      ]);
      const [self, rare, usdc] = await Promise.all([
        readRewardTokenStatus(publicClient, factory, chain, 'self'),
        readRewardTokenStatus(publicClient, factory, chain, 'rare'),
        readRewardTokenStatus(publicClient, factory, chain, 'usdc'),
      ]);
      return {
        ...configStatus,
        implementations: {
          sovereign,
          'sovereign-market': sovereignMarket,
          'sovereign-market-rewards': sovereignMarketRewards,
        },
        rewardTokens: { self, rare, usdc },
      };
    },

    async status(params): Promise<SovereignErc20Status> {
      const contract = normalizeSovereignErc20Address(params.contract, 'contract');
      return readSovereignStatus(
        publicClient,
        contract,
        params.account === undefined ? undefined : normalizeSovereignErc20Address(params.account, 'account'),
        params.spender === undefined ? undefined : normalizeSovereignErc20Address(params.spender, 'spender'),
      );
    },

    async getTokenUri(params): Promise<string> {
      return publicClient.readContract({
        address: normalizeSovereignErc20Address(params.contract, 'contract'),
        abi: sovereignErc20Abi,
        functionName: 'tokenURI',
      });
    },

    async getOwner(params): Promise<Address> {
      return publicClient.readContract({
        address: normalizeSovereignErc20Address(params.contract, 'contract'),
        abi: sovereignErc20Abi,
        functionName: 'owner',
      });
    },

    async getMaxSupply(params): Promise<bigint> {
      return publicClient.readContract({
        address: normalizeSovereignErc20Address(params.contract, 'contract'),
        abi: sovereignErc20Abi,
        functionName: 'maxSupply',
      });
    },

    async supportsInterface(params): Promise<boolean> {
      return supportsInterface(
        publicClient,
        normalizeSovereignErc20Address(params.contract, 'contract'),
        params.interfaceId,
      );
    },

    deploy: {
      async sovereign(params): Promise<SovereignErc20DeployResult> {
        const wallet = requireWallet(config);
        const plan = planDeploySovereignErc20(params, { accountAddress: wallet.accountAddress });
        const factory = requireErc20Factory(addresses.liquidFactory, chain, chainId, plan.kind);
        const availability = await preflightFactoryAvailability(publicClient, factory, chain, chainId, plan.kind);
        await preflightCreatorDelegate(publicClient, factory, chain, chainId, plan, wallet.accountAddress);
        const txHash = await simulateAndWriteFactory(
          publicClient,
          wallet.walletClient,
          wallet.account,
          factory,
          buildCreateSovereignErc20Write(plan),
        );
        const { receipt, contract } = await waitForSovereignDeploy(publicClient, factory, txHash, plan.kind, plan.owner);
        const verified = await readSovereignStatus(publicClient, contract);
        verifyCommonDeployState(verified, plan);
        if (verified.maxSupply !== plan.maxSupply) {
          throw new Error(`Sovereign ERC20 deploy verification failed: expected maxSupply ${plan.maxSupply.toString()}, got ${String(verified.maxSupply)}.`);
        }
        return {
          txHash,
          receipt,
          contract,
          factory,
          kind: plan.kind,
          implementation: availability.implementation,
          owner: plan.owner,
          tokenUri: plan.tokenUri,
          name: plan.name,
          symbol: plan.symbol,
          initialSupply: plan.initialSupply,
          maxSupply: plan.maxSupply,
        };
      },

      async sovereignMarket(params): Promise<SovereignErc20MarketDeployResult> {
        const wallet = requireWallet(config);
        const plan = planDeploySovereignErc20Market(params, { accountAddress: wallet.accountAddress });
        const factory = requireErc20Factory(addresses.liquidFactory, chain, chainId, plan.kind);
        const availability = await preflightFactoryAvailability(publicClient, factory, chain, chainId, plan.kind);
        await preflightCreatorDelegate(publicClient, factory, chain, chainId, plan, wallet.accountAddress);
        await validateMarketCurves(publicClient, factory, plan);
        const txHash = await simulateAndWriteFactory(
          publicClient,
          wallet.walletClient,
          wallet.account,
          factory,
          buildCreateSovereignErc20MarketWrite(plan),
        );
        const { receipt, contract } = await waitForSovereignDeploy(publicClient, factory, txHash, plan.kind, plan.owner);
        const verified = await readSovereignStatus(publicClient, contract);
        verifyMarketDeployState(verified, plan);
        return shapeMarketDeployResult(txHash, receipt, factory, availability, plan, contract, verified);
      },

      async sovereignMarketRewards(params): Promise<SovereignErc20MarketRewardsDeployResult> {
        const wallet = requireWallet(config);
        const plan = planDeploySovereignErc20MarketRewards(params, { accountAddress: wallet.accountAddress });
        const factory = requireErc20Factory(addresses.liquidFactory, chain, chainId, plan.kind);
        const availability = await preflightFactoryAvailability(publicClient, factory, chain, chainId, plan.kind);
        await preflightCreatorDelegate(publicClient, factory, chain, chainId, plan, wallet.accountAddress);
        await validateMarketCurves(publicClient, factory, plan);
        const rewardTokenAddress = await resolveRewardToken(publicClient, factory, chain, chainId, plan.kind, plan.rewardToken);
        const txHash = await simulateAndWriteFactory(
          publicClient,
          wallet.walletClient,
          wallet.account,
          factory,
          buildCreateSovereignErc20MarketRewardsWrite(plan, rewardTokenAddress),
        );
        const { receipt, contract } = await waitForSovereignDeploy(publicClient, factory, txHash, plan.kind, plan.owner);
        const verified = await readSovereignStatus(publicClient, contract);
        verifyMarketDeployState(verified, plan);
        if (!verified.rewards) {
          throw new Error('Sovereign ERC20 market rewards deploy verification failed: deployed token does not report rewards capability.');
        }
        const expectedRewardToken = plan.rewardToken === 'self' ? contract : rewardTokenAddress;
        if (!isAddressEqual(verified.rewards.rewardToken, expectedRewardToken)) {
          throw new Error(
            `Sovereign ERC20 market rewards deploy verification failed: expected rewardToken ${expectedRewardToken}, got ${verified.rewards.rewardToken}.`,
          );
        }
        return {
          ...shapeMarketDeployResult(txHash, receipt, factory, availability, plan, contract, verified),
          kind: plan.kind,
          rewardToken: verified.rewards.rewardToken,
          rewardTokenInput: plan.rewardToken,
        };
      },
    },

    delegation: {
      async isDelegate(params): Promise<boolean> {
        const plan = planSovereignErc20IsDelegate(params);
        const factory = requireErc20Factory(addresses.liquidFactory, chain, chainId);
        return publicClient.readContract({
          address: factory,
          abi: liquidFactoryAbi,
          functionName: 'isCreatorDelegate',
          args: [plan.owner, plan.operator],
        });
      },

      async delegate(params): Promise<SovereignErc20DelegateResult> {
        const wallet = requireWallet(config);
        const plan = planSovereignErc20Delegate(params);
        const factory = requireErc20Factory(addresses.liquidFactory, chain, chainId);
        const txHash = await simulateAndWriteFactory(publicClient, wallet.walletClient, wallet.account, factory, {
          functionName: 'delegateTokenCreation',
          args: [plan.operator],
        });
        const receipt = await waitForSuccessfulReceipt(publicClient, txHash, 'erc20 delegate creation');
        await verifyCreatorDelegate(publicClient, factory, wallet.accountAddress, plan.operator, true);
        return { txHash, receipt, factory, owner: wallet.accountAddress, operator: plan.operator, approved: true };
      },

      async revoke(params): Promise<SovereignErc20DelegateResult> {
        const wallet = requireWallet(config);
        const plan = planSovereignErc20Delegate(params);
        const factory = requireErc20Factory(addresses.liquidFactory, chain, chainId);
        const txHash = await simulateAndWriteFactory(publicClient, wallet.walletClient, wallet.account, factory, {
          functionName: 'revokeTokenCreationDelegate',
          args: [plan.operator],
        });
        const receipt = await waitForSuccessfulReceipt(publicClient, txHash, 'erc20 revoke creation delegate');
        await verifyCreatorDelegate(publicClient, factory, wallet.accountAddress, plan.operator, false);
        return { txHash, receipt, factory, owner: wallet.accountAddress, operator: plan.operator, approved: false };
      },
    },

    async mint(params): Promise<SovereignErc20MintResult> {
      const wallet = requireWallet(config);
      const plan = planSovereignErc20Mint(params, { accountAddress: wallet.accountAddress });
      const txHash = await simulateAndWriteSovereign(publicClient, wallet.walletClient, wallet.account, plan.contract, {
        functionName: 'mint',
        args: [plan.to, plan.amount],
      });
      const receipt = await waitForSuccessfulReceipt(publicClient, txHash, 'erc20 mint');
      return { txHash, receipt, contract: plan.contract, to: plan.to, amount: plan.amount };
    },

    async burn(params): Promise<SovereignErc20BurnResult> {
      const wallet = requireWallet(config);
      const plan = planSovereignErc20Burn(params);
      const txHash = await simulateAndWriteSovereign(publicClient, wallet.walletClient, wallet.account, plan.contract, {
        functionName: 'burn',
        args: [plan.amount],
      });
      const receipt = await waitForSuccessfulReceipt(publicClient, txHash, 'erc20 burn');
      return { txHash, receipt, contract: plan.contract, amount: plan.amount };
    },

    async burnFrom(params): Promise<SovereignErc20BurnFromResult> {
      const wallet = requireWallet(config);
      const plan = planSovereignErc20BurnFrom(params);
      const txHash = await simulateAndWriteSovereign(publicClient, wallet.walletClient, wallet.account, plan.contract, {
        functionName: 'burnFrom',
        args: [plan.account, plan.amount],
      });
      const receipt = await waitForSuccessfulReceipt(publicClient, txHash, 'erc20 burnFrom');
      return { txHash, receipt, contract: plan.contract, account: plan.account, amount: plan.amount };
    },

    async updateTokenUri(params): Promise<SovereignErc20UpdateTokenUriResult> {
      const wallet = requireWallet(config);
      const plan = planSovereignErc20UpdateTokenUri(params);
      const txHash = await simulateAndWriteSovereign(publicClient, wallet.walletClient, wallet.account, plan.contract, {
        functionName: 'setTokenURI',
        args: [plan.tokenUri],
      });
      const receipt = await waitForSuccessfulReceipt(publicClient, txHash, 'erc20 updateTokenUri');
      const tokenUri = await publicClient.readContract({
        address: plan.contract,
        abi: sovereignErc20Abi,
        functionName: 'tokenURI',
      });
      if (tokenUri !== plan.tokenUri) {
        throw new Error(`ERC20 token URI verification failed: expected "${plan.tokenUri}", got "${tokenUri}".`);
      }
      return { txHash, receipt, contract: plan.contract, tokenUri };
    },

    rewards: {
      async status(params): Promise<SovereignErc20RewardsStatus> {
        const plan = planSovereignErc20RewardsStatus(params);
        return readRewardsStatus(publicClient, plan.contract, plan.account);
      },

      async notify(params): Promise<SovereignErc20RewardsNotifyResult> {
        const wallet = requireWallet(config);
        const plan = planSovereignErc20RewardsNotify(params);
        const rewardToken = await publicClient.readContract({
          address: plan.contract,
          abi: erc20HolderRewardsAbi,
          functionName: 'rewardToken',
        });
        const approvalTxHash = await ensureTokenAllowance(
          publicClient,
          wallet.walletClient,
          wallet.account,
          wallet.accountAddress,
          rewardToken,
          plan.contract,
          plan.amount,
          plan.autoApprove,
        );
        const { txHash, receipt, notifiedAmount } = await runWithApprovalSideEffectAlert({
          operation: 'erc20 rewards notify',
          approvals: [{ type: 'erc20', approvalTxHash, target: rewardToken, spender: plan.contract }],
          run: async () => {
            const targetTxHash = await simulateAndWriteRewards(publicClient, wallet.walletClient, wallet.account, plan.contract, {
              functionName: 'notifyHolderRewards',
              args: [plan.amount],
            });
            const targetReceipt = await waitForSuccessfulReceipt(publicClient, targetTxHash, 'erc20 rewards notify');
            const [log] = parseEventLogs({
              abi: erc20HolderRewardsAbi,
              logs: targetReceipt.logs,
              eventName: 'HolderRewardsNotified',
            });
            return {
              txHash: targetTxHash,
              receipt: targetReceipt,
              notifiedAmount: log?.args.amount ?? plan.amount,
            };
          },
        });
        return {
          txHash,
          receipt,
          contract: plan.contract,
          rewardToken,
          requestedAmount: plan.amount,
          notifiedAmount,
          approvalTxHash,
        };
      },

      async sync(params): Promise<SovereignErc20RewardsSyncResult> {
        const wallet = requireWallet(config);
        const plan = planSovereignErc20RewardsSync(params);
        const txHash = await simulateAndWriteRewards(publicClient, wallet.walletClient, wallet.account, plan.contract, {
          functionName: 'syncRewards',
          args: [],
        });
        const receipt = await waitForSuccessfulReceipt(publicClient, txHash, 'erc20 rewards sync');
        const [log] = parseEventLogs({
          abi: erc20HolderRewardsAbi,
          logs: receipt.logs,
          eventName: 'HolderRewardsSynced',
        });
        return { txHash, receipt, contract: plan.contract, synced: log?.args.amount ?? ZERO_REWARD_AMOUNT };
      },

      async claim(params): Promise<SovereignErc20RewardsClaimResult> {
        const wallet = requireWallet(config);
        const plan = planSovereignErc20RewardsClaim(params, { accountAddress: wallet.accountAddress });
        const txHash = await simulateAndWriteRewards(publicClient, wallet.walletClient, wallet.account, plan.contract, {
          functionName: 'claimRewards',
          args: [plan.recipient],
        });
        const receipt = await waitForSuccessfulReceipt(publicClient, txHash, 'erc20 rewards claim');
        const [log] = parseEventLogs({
          abi: erc20HolderRewardsAbi,
          logs: receipt.logs,
          eventName: 'HolderRewardsClaimed',
        });
        return {
          txHash,
          receipt,
          contract: plan.contract,
          account: plan.account,
          recipient: plan.recipient,
          claimed: log?.args.amount ?? 0n,
        };
      },

      async exclude(params): Promise<SovereignErc20RewardsExcludeResult> {
        const wallet = requireWallet(config);
        const plan = planSovereignErc20RewardsAccount(params);
        const txHash = await simulateAndWriteRewards(publicClient, wallet.walletClient, wallet.account, plan.contract, {
          functionName: 'addRewardsExcluded',
          args: [plan.account],
        });
        const receipt = await waitForSuccessfulReceipt(publicClient, txHash, 'erc20 rewards exclude');
        await verifyRewardsExclusion(publicClient, plan.contract, plan.account, true);
        return { txHash, receipt, contract: plan.contract, account: plan.account, excluded: true };
      },

      async include(params): Promise<SovereignErc20RewardsExcludeResult> {
        const wallet = requireWallet(config);
        const plan = planSovereignErc20RewardsAccount(params);
        const txHash = await simulateAndWriteRewards(publicClient, wallet.walletClient, wallet.account, plan.contract, {
          functionName: 'removeRewardsExcluded',
          args: [plan.account],
        });
        const receipt = await waitForSuccessfulReceipt(publicClient, txHash, 'erc20 rewards include');
        await verifyRewardsExclusion(publicClient, plan.contract, plan.account, false);
        return { txHash, receipt, contract: plan.contract, account: plan.account, excluded: false };
      },
    },
  };
}

function requireErc20Factory(
  factory: Address | undefined,
  chain: SupportedChain,
  chainId: number,
  kind?: SovereignErc20Kind,
): Address {
  if (!factory) {
    throw new SovereignErc20UnavailableError({ chain, chainId, kind, reason: 'factory-not-configured' });
  }
  return factory;
}

async function readFactoryConfig(publicClient: PublicClient, factory: Address): Promise<SovereignErc20FactoryConfig> {
  const [baseToken, poolManager, poolHooks, poolTickSpacing, selfRewardToken] = await Promise.all([
    publicClient.readContract({ address: factory, abi: liquidFactoryAbi, functionName: 'baseToken' }),
    publicClient.readContract({ address: factory, abi: liquidFactoryAbi, functionName: 'poolManager' }),
    publicClient.readContract({ address: factory, abi: liquidFactoryAbi, functionName: 'poolHooks' }),
    publicClient.readContract({ address: factory, abi: liquidFactoryAbi, functionName: 'poolTickSpacing' }),
    publicClient.readContract({ address: factory, abi: liquidFactoryAbi, functionName: 'SELF_REWARD_TOKEN' }),
  ]);
  return {
    factory,
    baseToken,
    poolManager,
    poolHooks,
    poolTickSpacing: Number(poolTickSpacing),
    selfRewardToken,
  };
}

async function readImplementationStatus(
  publicClient: PublicClient,
  factory: Address,
  chain: SupportedChain,
  chainId: number,
  kind: SovereignErc20Kind,
): Promise<SovereignErc20ImplementationStatus> {
  const kindHash = await readFactoryKindHash(publicClient, factory, chain, chainId, kind);
  const [implementation, enabled] = await publicClient.readContract({
    address: factory,
    abi: liquidFactoryAbi,
    functionName: 'tokenImplementations',
    args: [kindHash],
  });
  return { kind, kindHash, implementation, enabled };
}

async function preflightFactoryAvailability(
  publicClient: PublicClient,
  factory: Address,
  chain: SupportedChain,
  chainId: number,
  kind: SovereignErc20Kind,
): Promise<FactoryAvailability> {
  const status = await readImplementationStatus(publicClient, factory, chain, chainId, kind).catch((error: unknown): never => {
    throw new SovereignErc20UnavailableError({
      chain,
      chainId,
      kind,
      reason: 'factory-unsupported',
      factory,
      cause: error,
    });
  });
  if (isAddressEqual(status.implementation, zeroAddress)) {
    throw new SovereignErc20UnavailableError({
      chain,
      chainId,
      kind,
      reason: 'implementation-not-set',
      factory,
      implementation: status.implementation,
    });
  }
  if (!status.enabled) {
    throw new SovereignErc20UnavailableError({
      chain,
      chainId,
      kind,
      reason: 'implementation-disabled',
      factory,
      implementation: status.implementation,
    });
  }
  return { kindHash: status.kindHash, implementation: status.implementation };
}

async function readFactoryKindHash(
  publicClient: PublicClient,
  factory: Address,
  chain: SupportedChain,
  chainId: number,
  kind: SovereignErc20Kind,
): Promise<Hex> {
  const functionName = sovereignErc20KindReadNames[kind];
  const expectedKindHash = SOVEREIGN_ERC20_KIND_HASHES[kind];
  const observedKindHash = await publicClient.readContract({
    address: factory,
    abi: liquidFactoryAbi,
    functionName,
  });
  if (observedKindHash !== expectedKindHash) {
    throw new SovereignErc20UnavailableError({
      chain,
      chainId,
      kind,
      reason: 'factory-kind-mismatch',
      factory,
      expectedKindHash,
      observedKindHash,
    });
  }
  return observedKindHash;
}

async function preflightCreatorDelegate(
  publicClient: PublicClient,
  factory: Address,
  chain: SupportedChain,
  chainId: number,
  plan: PlannedSovereignErc20DeployAny,
  accountAddress: Address,
): Promise<void> {
  if (!plan.requiresDelegate) return;

  const delegated = await publicClient.readContract({
    address: factory,
    abi: liquidFactoryAbi,
    functionName: 'isCreatorDelegate',
    args: [plan.owner, accountAddress],
  });
  if (!delegated) {
    throw new Error(
      `Wallet ${accountAddress} is not approved to create Sovereign ERC20 tokens for owner ${plan.owner} on ${chain} (${chainId.toString()}). ` +
        'Call rare.erc20.delegation.delegate from the owner account first.',
    );
  }
}

async function validateMarketCurves(
  publicClient: PublicClient,
  factory: Address,
  plan: Extract<PlannedSovereignErc20DeployAny, { kind: 'sovereign-market' | 'sovereign-market-rewards' }>,
): Promise<void> {
  const poolTickSpacing = await publicClient.readContract({
    address: factory,
    abi: liquidFactoryAbi,
    functionName: 'poolTickSpacing',
  });
  const validation = validateCurves(plan.curves, {
    curvePoolSupplyTokens: formatUnits(plan.initialSupply, 18),
    poolTickSpacing: Number(poolTickSpacing),
  });
  if (!validation.isValid) {
    throw new Error(validation.errorMessage ?? 'Invalid Sovereign ERC20 market curves.');
  }
}

async function resolveRewardToken(
  publicClient: PublicClient,
  factory: Address,
  chain: SupportedChain,
  chainId: number,
  kind: SovereignErc20Kind,
  rewardToken: SovereignErc20RewardToken,
): Promise<Address> {
  const address = await resolveRewardTokenAddress(publicClient, factory, chain, rewardToken);
  const allowed = await isRewardTokenAllowed(publicClient, factory, address);
  if (!allowed) {
    throw new SovereignErc20UnavailableError({
      chain,
      chainId,
      kind,
      reason: 'reward-token-not-allowed',
      factory,
      rewardToken,
      rewardTokenAddress: address,
    });
  }
  return address;
}

async function resolveRewardTokenAddress(
  publicClient: PublicClient,
  factory: Address,
  chain: SupportedChain,
  rewardToken: SovereignErc20RewardToken,
): Promise<Address> {
  return rewardToken === 'self'
    ? await publicClient.readContract({ address: factory, abi: liquidFactoryAbi, functionName: 'SELF_REWARD_TOKEN' })
    : resolveCurrency(rewardToken, chain);
}

async function readRewardTokenStatus(
  publicClient: PublicClient,
  factory: Address,
  chain: SupportedChain,
  token: SovereignErc20RewardTokenName,
): Promise<SovereignErc20RewardTokenStatus> {
  const address = await resolveRewardTokenAddress(publicClient, factory, chain, token);
  const allowed = await isRewardTokenAllowed(publicClient, factory, address);
  return { token, address, allowed };
}

async function isRewardTokenAllowed(publicClient: PublicClient, factory: Address, rewardToken: Address): Promise<boolean> {
  return publicClient.readContract({
    address: factory,
    abi: liquidFactoryAbi,
    functionName: 'isSovereignRewardTokenAllowed',
    args: [rewardToken],
  });
}

async function simulateAndWriteFactory(
  publicClient: PublicClient,
  walletClient: NonNullable<RareClientConfig['walletClient']>,
  account: WalletWriteAccount,
  factory: Address,
  write: SovereignFactoryWrite,
): Promise<Hash> {
  switch (write.functionName) {
    case 'createSovereignERC20':
      await publicClient.simulateContract({ address: factory, abi: liquidFactoryAbi, functionName: write.functionName, args: write.args, account });
      return walletClient.writeContract({ address: factory, abi: liquidFactoryAbi, functionName: write.functionName, args: write.args, account, chain: undefined });
    case 'createSovereignERC20Market':
      await publicClient.simulateContract({ address: factory, abi: liquidFactoryAbi, functionName: write.functionName, args: write.args, account });
      return walletClient.writeContract({ address: factory, abi: liquidFactoryAbi, functionName: write.functionName, args: write.args, account, chain: undefined });
    case 'createSovereignERC20MarketRewards':
      await publicClient.simulateContract({ address: factory, abi: liquidFactoryAbi, functionName: write.functionName, args: write.args, account });
      return walletClient.writeContract({ address: factory, abi: liquidFactoryAbi, functionName: write.functionName, args: write.args, account, chain: undefined });
    case 'delegateTokenCreation':
      await publicClient.simulateContract({ address: factory, abi: liquidFactoryAbi, functionName: write.functionName, args: write.args, account });
      return walletClient.writeContract({ address: factory, abi: liquidFactoryAbi, functionName: write.functionName, args: write.args, account, chain: undefined });
    case 'revokeTokenCreationDelegate':
      await publicClient.simulateContract({ address: factory, abi: liquidFactoryAbi, functionName: write.functionName, args: write.args, account });
      return walletClient.writeContract({ address: factory, abi: liquidFactoryAbi, functionName: write.functionName, args: write.args, account, chain: undefined });
  }
}

async function simulateAndWriteSovereign(
  publicClient: PublicClient,
  walletClient: NonNullable<RareClientConfig['walletClient']>,
  account: WalletWriteAccount,
  contract: Address,
  write: SovereignTokenWrite,
): Promise<Hash> {
  switch (write.functionName) {
    case 'mint':
      await publicClient.simulateContract({ address: contract, abi: sovereignErc20Abi, functionName: write.functionName, args: write.args, account });
      return walletClient.writeContract({ address: contract, abi: sovereignErc20Abi, functionName: write.functionName, args: write.args, account, chain: undefined });
    case 'burn':
      await publicClient.simulateContract({ address: contract, abi: sovereignErc20Abi, functionName: write.functionName, args: write.args, account });
      return walletClient.writeContract({ address: contract, abi: sovereignErc20Abi, functionName: write.functionName, args: write.args, account, chain: undefined });
    case 'burnFrom':
      await publicClient.simulateContract({ address: contract, abi: sovereignErc20Abi, functionName: write.functionName, args: write.args, account });
      return walletClient.writeContract({ address: contract, abi: sovereignErc20Abi, functionName: write.functionName, args: write.args, account, chain: undefined });
    case 'setTokenURI':
      await publicClient.simulateContract({ address: contract, abi: sovereignErc20Abi, functionName: write.functionName, args: write.args, account });
      return walletClient.writeContract({ address: contract, abi: sovereignErc20Abi, functionName: write.functionName, args: write.args, account, chain: undefined });
  }
}

async function simulateAndWriteRewards(
  publicClient: PublicClient,
  walletClient: NonNullable<RareClientConfig['walletClient']>,
  account: WalletWriteAccount,
  contract: Address,
  write: HolderRewardsWrite,
): Promise<Hash> {
  switch (write.functionName) {
    case 'notifyHolderRewards':
      await publicClient.simulateContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: write.functionName, args: write.args, account });
      return walletClient.writeContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: write.functionName, args: write.args, account, chain: undefined });
    case 'syncRewards':
      await publicClient.simulateContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: write.functionName, args: write.args, account });
      return walletClient.writeContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: write.functionName, args: write.args, account, chain: undefined });
    case 'claimRewards':
      await publicClient.simulateContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: write.functionName, args: write.args, account });
      return walletClient.writeContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: write.functionName, args: write.args, account, chain: undefined });
    case 'addRewardsExcluded':
      await publicClient.simulateContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: write.functionName, args: write.args, account });
      return walletClient.writeContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: write.functionName, args: write.args, account, chain: undefined });
    case 'removeRewardsExcluded':
      await publicClient.simulateContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: write.functionName, args: write.args, account });
      return walletClient.writeContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: write.functionName, args: write.args, account, chain: undefined });
  }
}

async function waitForSovereignDeploy(
  publicClient: PublicClient,
  factory: Address,
  txHash: Hash,
  kind: SovereignErc20Kind,
  owner: Address,
): Promise<{ receipt: TransactionReceipt; contract: Address }> {
  const receipt = await waitForSuccessfulReceipt(publicClient, txHash, 'erc20 deploy');
  const logs = parseEventLogs({
    abi: liquidFactoryAbi,
    logs: receipt.logs,
    eventName: 'SovereignTokenCreated',
  });
  const expectedKind = SOVEREIGN_ERC20_KIND_HASHES[kind];
  const log = logs.find((entry) =>
    isAddressEqual(entry.address, factory) &&
    entry.args.kind === expectedKind &&
    isAddressEqual(entry.args.owner, owner));
  if (!log) {
    throw new Error(`Sovereign ERC20 deploy transaction ${txHash} did not emit the expected SovereignTokenCreated event.`);
  }
  return { receipt, contract: log.args.token };
}

async function waitForSuccessfulReceipt(
  publicClient: PublicClient,
  txHash: Hash,
  operation: string,
): Promise<TransactionReceipt> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') {
    throw new Error(`${operation} transaction ${txHash} did not succeed.`);
  }
  return receipt;
}

async function readSovereignStatus(
  publicClient: PublicClient,
  contract: Address,
  account?: Address,
  spender?: Address,
): Promise<SovereignErc20Status> {
  const capabilities = await readCapabilities(publicClient, contract);
  const [name, symbol, decimals, totalSupply, owner, tokenUri, maxSupply, accountStatus, market, rewards] = await Promise.all([
    publicClient.readContract({ address: contract, abi: sovereignErc20Abi, functionName: 'name' }),
    publicClient.readContract({ address: contract, abi: sovereignErc20Abi, functionName: 'symbol' }),
    publicClient.readContract({ address: contract, abi: sovereignErc20Abi, functionName: 'decimals' }),
    publicClient.readContract({ address: contract, abi: sovereignErc20Abi, functionName: 'totalSupply' }),
    publicClient.readContract({ address: contract, abi: sovereignErc20Abi, functionName: 'owner' }),
    publicClient.readContract({ address: contract, abi: sovereignErc20Abi, functionName: 'tokenURI' }),
    publicClient.readContract({ address: contract, abi: sovereignErc20Abi, functionName: 'maxSupply' }),
    account === undefined ? Promise.resolve(undefined) : readAccountStatus(publicClient, contract, account, spender),
    capabilities.sovereignErc20Market ? readMarketStatus(publicClient, contract) : Promise.resolve(undefined),
    capabilities.erc20HolderRewards ? readRewardsStatus(publicClient, contract, account) : Promise.resolve(undefined),
  ]);

  return {
    contract,
    kind: capabilities.erc20HolderRewards
      ? 'sovereign-market-rewards'
      : capabilities.sovereignErc20Market
        ? 'sovereign-market'
        : capabilities.sovereignErc20
          ? 'sovereign'
          : 'unknown',
    capabilities,
    name,
    symbol,
    decimals: Number(decimals),
    totalSupply,
    owner,
    tokenUri,
    maxSupply,
    account: accountStatus,
    market,
    rewards,
  };
}

async function readCapabilities(publicClient: PublicClient, contract: Address): Promise<SovereignErc20Capabilities> {
  const [
    erc165,
    erc20,
    erc20Metadata,
    erc20Permit,
    erc1046,
    erc5313,
    sovereignErc20,
    sovereignErc20Market,
    erc20HolderRewards,
  ] = await Promise.all([
    supportsInterface(publicClient, contract, ERC165_INTERFACE_ID),
    supportsInterface(publicClient, contract, ERC20_INTERFACE_ID),
    supportsInterface(publicClient, contract, ERC20_METADATA_INTERFACE_ID),
    supportsInterface(publicClient, contract, ERC20_PERMIT_INTERFACE_ID),
    supportsInterface(publicClient, contract, ERC1046_INTERFACE_ID),
    supportsInterface(publicClient, contract, ERC5313_INTERFACE_ID),
    supportsInterface(publicClient, contract, SOVEREIGN_ERC20_INTERFACE_ID),
    supportsInterface(publicClient, contract, SOVEREIGN_ERC20_MARKET_INTERFACE_ID),
    supportsInterface(publicClient, contract, ERC20_HOLDER_REWARDS_INTERFACE_ID),
  ]);
  return {
    erc165,
    erc20,
    erc20Metadata,
    erc20Permit,
    erc1046,
    erc5313,
    sovereignErc20,
    sovereignErc20Market,
    erc20HolderRewards,
  };
}

async function supportsInterface(publicClient: PublicClient, contract: Address, interfaceId: Hex): Promise<boolean> {
  return publicClient.readContract({
    address: contract,
    abi: sovereignErc20Abi,
    functionName: 'supportsInterface',
    args: [interfaceId],
  });
}

async function readMarketStatus(
  publicClient: PublicClient,
  contract: Address,
): Promise<SovereignErc20MarketStatus> {
  const [factory, baseToken, poolManager, marketSupply, rawPoolKey, poolId] = await Promise.all([
    publicClient.readContract({ address: contract, abi: sovereignErc20MarketAbi, functionName: 'factory' }),
    publicClient.readContract({ address: contract, abi: sovereignErc20MarketAbi, functionName: 'baseToken' }),
    publicClient.readContract({ address: contract, abi: sovereignErc20MarketAbi, functionName: 'poolManager' }),
    publicClient.readContract({ address: contract, abi: sovereignErc20MarketAbi, functionName: 'marketSupply' }),
    publicClient.readContract({ address: contract, abi: sovereignErc20MarketAbi, functionName: 'poolKey' }),
    publicClient.readContract({ address: contract, abi: sovereignErc20MarketAbi, functionName: 'poolId' }),
  ]);
  return {
    factory,
    baseToken,
    poolManager,
    marketSupply,
    poolKey: toSovereignPoolKey(rawPoolKey),
    poolId,
  };
}

async function readRewardsStatus(
  publicClient: PublicClient,
  contract: Address,
  account?: Address,
): Promise<SovereignErc20RewardsStatus> {
  const [
    rewardToken,
    accRewardPerEligibleToken,
    eligibleSupply,
    pendingUndistributedRewards,
    accountedRewardBalance,
    totalHolderRewardsAccrued,
    totalHolderRewardsClaimed,
    accountStatus,
  ] = await Promise.all([
    publicClient.readContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: 'rewardToken' }),
    publicClient.readContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: 'accRewardPerEligibleToken' }),
    publicClient.readContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: 'eligibleSupply' }),
    publicClient.readContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: 'pendingUndistributedRewards' }),
    publicClient.readContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: 'accountedRewardBalance' }),
    publicClient.readContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: 'totalHolderRewardsAccrued' }),
    publicClient.readContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: 'totalHolderRewardsClaimed' }),
    account === undefined ? Promise.resolve(undefined) : readRewardsAccountStatus(publicClient, contract, account),
  ]);
  return {
    contract,
    rewardToken,
    accRewardPerEligibleToken,
    eligibleSupply,
    pendingUndistributedRewards,
    accountedRewardBalance,
    totalHolderRewardsAccrued,
    totalHolderRewardsClaimed,
    account: accountStatus,
  };
}

async function readRewardsAccountStatus(
  publicClient: PublicClient,
  contract: Address,
  account: Address,
): Promise<SovereignErc20RewardsAccountStatus> {
  const [
    rewardsExcluded,
    systemRewardsExcluded,
    ownerRewardsExcluded,
    rewardCorrection,
    claimedRewards,
    claimableRewards,
  ] = await Promise.all([
    publicClient.readContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: 'rewardsExcluded', args: [account] }),
    publicClient.readContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: 'systemRewardsExcluded', args: [account] }),
    publicClient.readContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: 'ownerRewardsExcluded', args: [account] }),
    publicClient.readContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: 'rewardCorrections', args: [account] }),
    publicClient.readContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: 'claimedRewards', args: [account] }),
    publicClient.readContract({ address: contract, abi: erc20HolderRewardsAbi, functionName: 'claimableRewards', args: [account] }),
  ]);
  return {
    account,
    rewardsExcluded,
    systemRewardsExcluded,
    ownerRewardsExcluded,
    rewardCorrection,
    claimedRewards,
    claimableRewards,
  };
}

async function readAccountStatus(
  publicClient: PublicClient,
  contract: Address,
  account: Address,
  spender?: Address,
): Promise<SovereignErc20Status['account']> {
  const [balance, allowance] = await Promise.all([
    publicClient.readContract({ address: contract, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
    spender === undefined
      ? Promise.resolve(undefined)
      : publicClient.readContract({ address: contract, abi: erc20Abi, functionName: 'allowance', args: [account, spender] }),
  ]);
  return { account, balance, ...(spender === undefined ? {} : { spender, allowance }) };
}

function toSovereignPoolKey(poolKey: readonly [Address, Address, number, number, Address]): SovereignErc20PoolKey {
  const [currency0, currency1, fee, tickSpacing, hooks] = poolKey;
  return {
    currency0: getAddress(currency0),
    currency1: getAddress(currency1),
    fee: Number(fee),
    tickSpacing: Number(tickSpacing),
    hooks: getAddress(hooks),
  };
}

function verifyCommonDeployState(
  status: SovereignErc20Status,
  plan: PlannedSovereignErc20DeployAny,
): void {
  if (status.owner === undefined) {
    throw new Error('Sovereign ERC20 deploy verification failed: owner read is unavailable.');
  }
  if (!isAddressEqual(status.owner, plan.owner)) {
    throw new Error(`Sovereign ERC20 deploy verification failed: expected owner ${plan.owner}, got ${status.owner}.`);
  }
  if (status.name !== plan.name) {
    throw new Error(`Sovereign ERC20 deploy verification failed: expected name "${plan.name}", got "${status.name}".`);
  }
  if (status.symbol !== plan.symbol) {
    throw new Error(`Sovereign ERC20 deploy verification failed: expected symbol "${plan.symbol}", got "${status.symbol}".`);
  }
  if (status.tokenUri !== plan.tokenUri) {
    throw new Error(`Sovereign ERC20 deploy verification failed: expected tokenUri "${plan.tokenUri}", got "${status.tokenUri}".`);
  }
}

function verifyMarketDeployState(
  status: SovereignErc20Status,
  plan: Extract<PlannedSovereignErc20DeployAny, { kind: 'sovereign-market' | 'sovereign-market-rewards' }>,
): void {
  verifyCommonDeployState(status, plan);
  if (!status.market) {
    throw new Error('Sovereign ERC20 market deploy verification failed: deployed token does not report market capability.');
  }
  if (status.totalSupply === undefined || status.market.marketSupply === undefined) {
    throw new Error('Sovereign ERC20 market deploy verification failed: totalSupply or marketSupply read is unavailable.');
  }
  if (status.maxSupply !== plan.maxSupply) {
    throw new Error(`Sovereign ERC20 market deploy verification failed: expected maxSupply ${plan.maxSupply.toString()}, got ${String(status.maxSupply)}.`);
  }
  if (status.totalSupply !== status.market.marketSupply) {
    throw new Error(
      `Sovereign ERC20 market deploy verification failed: totalSupply ${status.totalSupply.toString()} does not match marketSupply ${status.market.marketSupply.toString()}.`,
    );
  }
  if (status.totalSupply <= 0n || status.totalSupply > plan.initialSupply) {
    throw new Error(
      `Sovereign ERC20 market deploy verification failed: totalSupply ${status.totalSupply.toString()} is outside expected range 1..${plan.initialSupply.toString()}.`,
    );
  }
}

function shapeMarketDeployResult(
  txHash: Hash,
  receipt: TransactionReceipt,
  factory: Address,
  availability: FactoryAvailability,
  plan: Extract<PlannedSovereignErc20DeployAny, { kind: 'sovereign-market' | 'sovereign-market-rewards' }>,
  contract: Address,
  verified: SovereignErc20Status,
): SovereignErc20MarketDeployResult {
  if (
    !verified.market ||
    verified.totalSupply === undefined ||
    verified.maxSupply === undefined ||
    verified.market.marketSupply === undefined ||
    verified.market.baseToken === undefined ||
    verified.market.poolManager === undefined ||
    verified.market.poolKey === undefined ||
    verified.market.poolId === undefined
  ) {
    throw new Error('unreachable: verified market status is missing required fields.');
  }
  return {
    txHash,
    receipt,
    contract,
    factory,
    kind: 'sovereign-market',
    implementation: availability.implementation,
    owner: plan.owner,
    tokenUri: plan.tokenUri,
    name: plan.name,
    symbol: plan.symbol,
    initialSupply: plan.initialSupply,
    totalSupply: verified.totalSupply,
    maxSupply: verified.maxSupply,
    marketSupply: verified.market.marketSupply,
    baseToken: verified.market.baseToken,
    poolManager: verified.market.poolManager,
    poolKey: verified.market.poolKey,
    poolId: verified.market.poolId,
    curves: plan.curves,
  };
}

async function verifyCreatorDelegate(
  publicClient: PublicClient,
  factory: Address,
  owner: Address,
  operator: Address,
  expected: boolean,
): Promise<void> {
  const approved = await publicClient.readContract({
    address: factory,
    abi: liquidFactoryAbi,
    functionName: 'isCreatorDelegate',
    args: [owner, operator],
  });
  if (approved !== expected) {
    throw new Error(`ERC20 creator delegation verification failed: expected approved=${String(expected)}, got ${String(approved)}.`);
  }
}

async function verifyRewardsExclusion(
  publicClient: PublicClient,
  contract: Address,
  account: Address,
  expected: boolean,
): Promise<void> {
  const excluded = await publicClient.readContract({
    address: contract,
    abi: erc20HolderRewardsAbi,
    functionName: 'rewardsExcluded',
    args: [account],
  });
  if (excluded !== expected) {
    throw new Error(`ERC20 rewards exclusion verification failed: expected excluded=${String(expected)}, got ${String(excluded)}.`);
  }
}
