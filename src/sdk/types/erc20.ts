import type { Address, Hash, Hex } from 'viem';
import type { LiquidCurveSegment } from '../../liquid/curve-config.js';
import type { AmountInput, TransactionResult } from './common.js';

export type SovereignErc20Kind = 'sovereign' | 'sovereign-market' | 'sovereign-market-rewards';
export type SovereignErc20RewardTokenName = 'self' | 'rare' | 'usdc';
export type SovereignErc20RewardToken = SovereignErc20RewardTokenName;
export type SovereignErc20RewardTokenInput = SovereignErc20RewardTokenName;

export type DeploySovereignErc20Params = {
  owner?: Address;
  tokenUri?: string;
  name: string;
  symbol: string;
  initialSupply?: AmountInput;
  maxSupply?: AmountInput;
}

export type DeploySovereignErc20MarketParams = {
  owner?: Address;
  tokenUri?: string;
  name: string;
  symbol: string;
  initialSupply: AmountInput;
  curves: LiquidCurveSegment[];
}

export type DeploySovereignErc20MarketRewardsParams = DeploySovereignErc20MarketParams & {
  rewardToken: SovereignErc20RewardTokenInput;
}

export type SovereignErc20ImplementationStatus = {
  kind: SovereignErc20Kind;
  kindHash: Hex;
  implementation: Address;
  enabled: boolean;
}

export type SovereignErc20RewardTokenStatus = {
  token: SovereignErc20RewardTokenName;
  address: Address;
  allowed: boolean;
}

export type SovereignErc20FactoryConfig = {
  factory: Address;
  baseToken: Address;
  poolManager: Address;
  poolHooks: Address;
  poolTickSpacing: number;
  selfRewardToken: Address;
}

export type SovereignErc20FactoryStatus = {
  factory: Address;
  baseToken?: Address;
  poolManager?: Address;
  poolHooks?: Address;
  poolTickSpacing?: number;
  selfRewardToken: Address;
  implementations: Record<SovereignErc20Kind, SovereignErc20ImplementationStatus>;
  rewardTokens: Partial<Record<SovereignErc20RewardTokenName, SovereignErc20RewardTokenStatus>>;
}

export type SovereignErc20PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export type SovereignErc20Capabilities = {
  erc165?: boolean;
  erc20?: boolean;
  erc20Metadata?: boolean;
  erc20Permit?: boolean;
  erc1046?: boolean;
  erc5313?: boolean;
  sovereignErc20?: boolean;
  sovereignErc20Market?: boolean;
  erc20HolderRewards?: boolean;
}

export type SovereignErc20AccountStatus = {
  account: Address;
  balance?: bigint;
  allowance?: bigint;
  spender?: Address;
}

export type SovereignErc20MarketStatus = {
  factory: Address;
  baseToken?: Address;
  poolManager?: Address;
  marketSupply?: bigint;
  poolKey?: SovereignErc20PoolKey;
  poolId?: Hex;
}

export type SovereignErc20RewardsAccountStatus = {
  account: Address;
  rewardsExcluded?: boolean;
  systemRewardsExcluded?: boolean;
  ownerRewardsExcluded?: boolean;
  rewardCorrection?: bigint;
  claimedRewards?: bigint;
  claimableRewards?: bigint;
}

export type SovereignErc20RewardsStatus = {
  contract: Address;
  rewardToken: Address;
  accRewardPerEligibleToken?: bigint;
  eligibleSupply?: bigint;
  pendingUndistributedRewards?: bigint;
  accountedRewardBalance?: bigint;
  totalHolderRewardsAccrued?: bigint;
  totalHolderRewardsClaimed?: bigint;
  account?: SovereignErc20RewardsAccountStatus;
}

export type SovereignErc20Status = {
  contract: Address;
  kind: SovereignErc20Kind | 'unknown';
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: bigint;
  maxSupply?: bigint;
  owner?: Address;
  tokenUri?: string;
  capabilities?: SovereignErc20Capabilities;
  account?: SovereignErc20AccountStatus;
  market?: SovereignErc20MarketStatus;
  rewards?: SovereignErc20RewardsStatus;
}

export type SovereignErc20DeployResult = {
  contract: Address;
  factory: Address;
  kind: 'sovereign';
  implementation: Address;
  owner: Address;
  tokenUri: string;
  name: string;
  symbol: string;
  initialSupply: bigint;
  maxSupply: bigint;
} & TransactionResult

export type SovereignErc20MarketDeployResult = {
  contract: Address;
  factory: Address;
  kind: 'sovereign-market';
  implementation: Address;
  owner: Address;
  tokenUri: string;
  name: string;
  symbol: string;
  initialSupply: bigint;
  totalSupply: bigint;
  maxSupply: bigint;
  marketSupply: bigint;
  baseToken: Address;
  poolManager: Address;
  poolKey: SovereignErc20PoolKey;
  poolId: Hex;
  curves: LiquidCurveSegment[];
} & TransactionResult

export type SovereignErc20MarketRewardsDeployResult =
  Omit<SovereignErc20MarketDeployResult, 'kind'> & {
    kind: 'sovereign-market-rewards';
    rewardToken: Address;
    rewardTokenInput: SovereignErc20RewardTokenInput;
  }

export type SovereignErc20MintParams = {
  contract: Address;
  to?: Address;
  amount: AmountInput;
}

export type SovereignErc20BurnParams = {
  contract: Address;
  amount: AmountInput;
}

export type SovereignErc20BurnFromParams = {
  contract: Address;
  account: Address;
  amount: AmountInput;
}

export type SovereignErc20UpdateTokenUriParams = {
  contract: Address;
  tokenUri: string;
}

export type SovereignErc20MintResult = {
  contract: Address;
  to: Address;
  amount: bigint;
} & TransactionResult

export type SovereignErc20BurnResult = {
  contract: Address;
  amount: bigint;
} & TransactionResult

export type SovereignErc20BurnFromResult = {
  contract: Address;
  account: Address;
  amount: bigint;
} & TransactionResult

export type SovereignErc20UpdateTokenUriResult = {
  contract: Address;
  tokenUri: string;
} & TransactionResult

export type SovereignErc20DelegateParams = {
  operator: Address;
}

export type SovereignErc20RevokeDelegateParams = SovereignErc20DelegateParams;

export type SovereignErc20IsDelegateParams = {
  owner: Address;
  operator: Address;
}

export type SovereignErc20DelegateResult = {
  factory: Address;
  owner: Address;
  operator: Address;
  approved: boolean;
} & TransactionResult

export type SovereignErc20RewardsStatusParams = {
  contract: Address;
  account?: Address;
}

export type SovereignErc20RewardsNotifyParams = {
  contract: Address;
  amount: AmountInput;
  autoApprove?: boolean;
}

export type SovereignErc20RewardsNotifyResult = {
  contract: Address;
  rewardToken: Address;
  requestedAmount: bigint;
  notifiedAmount: bigint;
  approvalTxHash?: Hash;
} & TransactionResult

export type SovereignErc20RewardsSyncParams = {
  contract: Address;
}

export type SovereignErc20RewardsSyncResult = {
  contract: Address;
  synced: bigint;
} & TransactionResult

export type SovereignErc20RewardsClaimParams = {
  contract: Address;
  recipient?: Address;
}

export type SovereignErc20RewardsClaimResult = {
  contract: Address;
  account: Address;
  recipient: Address;
  claimed: bigint;
} & TransactionResult

export type SovereignErc20RewardsAccountParams = {
  contract: Address;
  account: Address;
}

export type SovereignErc20RewardsExcludeResult = {
  contract: Address;
  account: Address;
  excluded: boolean;
} & TransactionResult

export type Erc20Namespace = {
  getFactoryConfig: () => Promise<SovereignErc20FactoryConfig>;
  factoryStatus: () => Promise<SovereignErc20FactoryStatus>;
  status: (params: { contract: Address; account?: Address; spender?: Address }) => Promise<SovereignErc20Status>;
  getTokenUri: (params: { contract: Address }) => Promise<string>;
  getOwner: (params: { contract: Address }) => Promise<Address>;
  getMaxSupply: (params: { contract: Address }) => Promise<bigint>;
  supportsInterface: (params: { contract: Address; interfaceId: Hex }) => Promise<boolean>;
  deploy: {
    sovereign: (params: DeploySovereignErc20Params) => Promise<SovereignErc20DeployResult>;
    sovereignMarket: (params: DeploySovereignErc20MarketParams) => Promise<SovereignErc20MarketDeployResult>;
    sovereignMarketRewards: (
      params: DeploySovereignErc20MarketRewardsParams
    ) => Promise<SovereignErc20MarketRewardsDeployResult>;
  };
  delegation: {
    isDelegate: (params: SovereignErc20IsDelegateParams) => Promise<boolean>;
    delegate: (params: SovereignErc20DelegateParams) => Promise<SovereignErc20DelegateResult>;
    revoke: (params: SovereignErc20RevokeDelegateParams) => Promise<SovereignErc20DelegateResult>;
  };
  mint: (params: SovereignErc20MintParams) => Promise<SovereignErc20MintResult>;
  burn: (params: SovereignErc20BurnParams) => Promise<SovereignErc20BurnResult>;
  burnFrom: (params: SovereignErc20BurnFromParams) => Promise<SovereignErc20BurnFromResult>;
  updateTokenUri: (params: SovereignErc20UpdateTokenUriParams) => Promise<SovereignErc20UpdateTokenUriResult>;
  rewards: {
    status: (params: SovereignErc20RewardsStatusParams) => Promise<SovereignErc20RewardsStatus>;
    notify: (params: SovereignErc20RewardsNotifyParams) => Promise<SovereignErc20RewardsNotifyResult>;
    sync: (params: SovereignErc20RewardsSyncParams) => Promise<SovereignErc20RewardsSyncResult>;
    claim: (params: SovereignErc20RewardsClaimParams) => Promise<SovereignErc20RewardsClaimResult>;
    exclude: (params: SovereignErc20RewardsAccountParams) => Promise<SovereignErc20RewardsExcludeResult>;
    include: (params: SovereignErc20RewardsAccountParams) => Promise<SovereignErc20RewardsExcludeResult>;
  };
}
