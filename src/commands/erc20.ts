import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import { isAddressEqual, zeroAddress, type Address } from 'viem';
import { getPublicClient, getWalletClient, tryGetWalletClient } from '../client.js';
import { getActiveChain } from '../config.js';
import { parseCurveConfig, type LiquidCurveSegment } from '../liquid/curve-config.js';
import type { LiquidFactoryConfig } from '../liquid/factory-config.js';
import { createRareClient } from '../sdk/client.js';
import type { RareClient } from '../sdk/client.js';
import { parseAddress, parseOptionalAddress } from '../sdk/validation.js';
import { log, output } from '../output.js';
import { runWithPaymentApprovalConsent } from './approval-consent.js';
import {
  collectRepeatedString,
  hasGeneratedTokenMetadataOptions,
  preflightTokenMetadataFiles,
  resolveStandardTokenUri,
  validateGeneratedTokenMetadataOptions,
  type TokenMetadataOptions,
} from './token-metadata.js';

type ChainOptions = {
  chain?: string;
  chainId?: string;
};

type Erc20DeployKind = 'sovereign' | 'sovereign-market' | 'sovereign-market-rewards';
type Erc20RewardToken = 'self' | 'rare' | 'usdc';

type Erc20DeployOptions = ChainOptions & TokenMetadataOptions & {
  kind?: string;
  owner?: string;
  curvesFile?: string;
  initialSupply?: string;
  maxSupply?: string;
  rewardToken?: string;
};

type ContractOptions = ChainOptions & {
  contract: string;
};

type AccountStatusOptions = ContractOptions & {
  account?: string;
};

type AmountOptions = ContractOptions & {
  amount: string;
};

type MintOptions = AmountOptions & {
  to?: string;
};

type BurnFromOptions = AmountOptions & {
  from: string;
};

type UpdateTokenUriOptions = ContractOptions & {
  tokenUri: string;
};

type DelegationOptions = ChainOptions & {
  delegate: string;
};

type DelegationStatusOptions = DelegationOptions & {
  creator: string;
};

type RewardsDepositOptions = AmountOptions & {
  yes?: boolean;
};

type RewardsClaimOptions = ContractOptions & {
  recipient?: string;
};

type RewardsAccountOptions = ContractOptions & {
  account: string;
};

type CurveFactoryConfig = Pick<LiquidFactoryConfig, 'poolTickSpacing'>;

type Erc20TransactionResult = {
  txHash: string;
  receipt: {
    blockNumber: bigint | number | string;
  };
  approvalTxHash?: string;
} & Record<string, unknown>;

type Erc20FactoryStatus = {
  implementations?: Partial<Record<Erc20DeployKind, {
    enabled?: boolean;
    implementation?: Address;
  }>>;
  rewardTokens?: Partial<Record<Erc20RewardToken, {
    allowed?: boolean;
    address?: Address;
  }>>;
};

type Erc20DeployParams = {
  name: string;
  symbol: string;
  tokenUri: string;
  owner?: Address;
  initialSupply?: string;
  maxSupply?: string;
  curves?: LiquidCurveSegment[];
  rewardToken?: Erc20RewardToken;
};

type Erc20Namespace = {
  getFactoryConfig?: () => Promise<CurveFactoryConfig>;
  factoryStatus?: () => Promise<Erc20FactoryStatus>;
  deploy: {
    sovereign: (params: Erc20DeployParams) => Promise<Erc20TransactionResult>;
    sovereignMarket: (params: Erc20DeployParams) => Promise<Erc20TransactionResult>;
    sovereignMarketRewards: (params: Erc20DeployParams) => Promise<Erc20TransactionResult>;
  };
  status: (params: { contract: Address; account?: Address }) => Promise<unknown>;
  mint: (params: { contract: Address; amount: string; to: Address }) => Promise<Erc20TransactionResult>;
  burn: (params: { contract: Address; amount: string }) => Promise<Erc20TransactionResult>;
  burnFrom: (params: { contract: Address; account: Address; amount: string }) => Promise<Erc20TransactionResult>;
  updateTokenUri: (params: { contract: Address; tokenUri: string }) => Promise<Erc20TransactionResult>;
  delegation: {
    delegate: (params: { operator: Address }) => Promise<Erc20TransactionResult>;
    revoke: (params: { operator: Address }) => Promise<Erc20TransactionResult>;
    isDelegate: (params: { owner: Address; operator: Address }) => Promise<boolean>;
  };
  rewards: {
    status: (params: { contract: Address; account?: Address }) => Promise<unknown>;
    notify: (params: { contract: Address; amount: string; autoApprove?: boolean }) => Promise<Erc20TransactionResult>;
    sync: (params: { contract: Address }) => Promise<Erc20TransactionResult>;
    claim: (params: { contract: Address; recipient?: Address }) => Promise<Erc20TransactionResult>;
    exclude: (params: { contract: Address; account: Address }) => Promise<Erc20TransactionResult>;
    include: (params: { contract: Address; account: Address }) => Promise<Erc20TransactionResult>;
  };
};

export function erc20Command(): Command {
  const cmd = new Command('erc20');
  cmd.description('Deploy and manage Sovereign ERC20 tokens');

  cmd.addCommand(erc20DeployCommand());
  cmd.addCommand(erc20StatusCommand());
  cmd.addCommand(erc20MintCommand());
  cmd.addCommand(erc20BurnCommand());
  cmd.addCommand(erc20BurnFromCommand());
  cmd.addCommand(erc20MetadataCommand());
  cmd.addCommand(erc20DelegationCommand());
  cmd.addCommand(erc20RewardsCommand());

  return cmd;
}

function erc20DeployCommand(): Command {
  const cmd = new Command('deploy');
  cmd.description('Deploy a Sovereign ERC20 token');

  cmd
    .argument('<name>', 'name of the ERC20 token')
    .argument('<symbol>', 'symbol of the ERC20 token')
    .option('--kind <kind>', 'sovereign, sovereign-market, or sovereign-market-rewards')
    .option('--owner <address>', 'token owner (defaults to connected wallet)')
    .option('--curves-file <path>', 'path to explicit curve JSON for market deployments')
    .option('--initial-supply <amount>', 'initial token supply')
    .option('--max-supply <amount>', 'maximum token supply for plain sovereign deployments')
    .option('--reward-token <token>', 'reward token for rewards markets: self, rare, or usdc')
    .option('--token-uri <uri>', 'token metadata URI (skip upload if provided)')
    .option('--description <description>', 'description for metadata when uploading')
    .option('--image <path>', 'path to the metadata image')
    .option('--video <path>', 'path to the metadata video')
    .option('--tag <tag>', 'tag (repeatable)', collectRepeatedString, [])
    .option('--attribute <attr>', 'attribute as "trait=value" or JSON (repeatable)', collectRepeatedString, [])
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (name: string, symbol: string, opts: Erc20DeployOptions): Promise<void> => {
      const kind = parseDeployKind(opts.kind);
      const rewardToken = parseRewardTokenOption(opts.rewardToken, kind);
      validateDeployOptionShape(kind, opts);

      const metadataValidation = hasGeneratedTokenMetadataOptions(opts)
        ? validateGeneratedTokenMetadataOptions(opts)
        : undefined;
      if (metadataValidation !== undefined && !metadataValidation.isValid) {
        throw new Error(metadataValidation.errorMessage);
      }
      await preflightTokenMetadataFiles({ ...opts, allowEmptyTokenUri: true });

      const chain = getActiveChain(opts.chain, opts.chainId);
      const publicClient = getPublicClient(chain);
      const readRare = createRareClient({ publicClient });
      const readErc20 = requireErc20Namespace(readRare);
      const curves = isMarketKind(kind)
        ? await readCurveFile(readRare, readErc20, opts.curvesFile, opts.initialSupply)
        : undefined;
      const owner = parseOptionalAddress(opts.owner, '--owner');
      await preflightErc20DeployReadiness(readErc20, kind, rewardToken);

      const { client } = getWalletClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });
      const erc20 = requireErc20Namespace(rare);
      const tokenUri = await resolveStandardTokenUri(rare, name, {
        ...opts,
        allowBlank: true,
        allowEmptyTokenUri: true,
      });
      const params = buildDeployParams({
        kind,
        name,
        symbol,
        tokenUri,
        owner,
        initialSupply: opts.initialSupply,
        maxSupply: opts.maxSupply,
        rewardToken,
        curves,
      });

      log(`Deploying Sovereign ERC20 on ${chain}...`);
      log(`  Kind: ${kind}`);
      log(`  Name: ${name}`);
      log(`  Symbol: ${symbol}`);
      log(`  Token URI: ${tokenUri === '' ? '(blank)' : tokenUri}`);
      if (opts.initialSupply !== undefined || kind === 'sovereign') log(`  Initial supply: ${params.initialSupply ?? '0'}`);
      if (params.maxSupply !== undefined) log(`  Max supply: ${params.maxSupply}`);
      if (owner !== undefined) log(`  Owner: ${owner}`);
      if (curves !== undefined) log(`  Curves: ${curves.length.toString()} segment(s)`);
      if (rewardToken !== undefined) log(`  Reward token: ${rewardToken}`);
      log('Waiting for confirmation...');

      const result = await deployErc20(erc20, kind, params);

      output(
        txOutput(result, {
          kind,
          contract: result.contract ?? null,
          chainId: rare.chainId,
          name,
          symbol,
          tokenUri,
          initialSupply: params.initialSupply ?? null,
          maxSupply: params.maxSupply ?? null,
          rewardToken: rewardToken ?? null,
          curves: curves ?? null,
        }),
        () => {
          printTx(result, 'Sovereign ERC20 deployed');
          if (result.contract !== undefined) {
            console.log(`Contract: ${formatOutputValue(result.contract)}`);
          }
        },
      );
    });

  return cmd;
}

function erc20StatusCommand(): Command {
  const cmd = new Command('status');
  cmd.description('Read Sovereign ERC20 token status');

  cmd
    .requiredOption('--contract <address>', 'ERC20 token contract address')
    .option('--account <address>', 'account to include balance/allowance-related status')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: AccountStatusOptions): Promise<void> => {
      const { erc20 } = createReadErc20Client(opts);
      const status = await erc20.status({
        contract: parseAddress(opts.contract, '--contract'),
        account: parseOptionalAddress(opts.account, '--account'),
      });
      output(status, () => {
        printUnknownRecord('Sovereign ERC20 Status', status);
      });
    });

  return cmd;
}

function erc20MintCommand(): Command {
  const cmd = new Command('mint');
  cmd.description('Mint Sovereign ERC20 tokens');

  cmd
    .requiredOption('--contract <address>', 'ERC20 token contract address')
    .requiredOption('--amount <amount>', 'token amount to mint')
    .option('--to <address>', 'recipient address (defaults to connected wallet)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: MintOptions): Promise<void> => {
      const { erc20, account } = createWriteErc20Client(opts);
      const contract = parseAddress(opts.contract, '--contract');
      const to = parseOptionalAddress(opts.to, '--to') ?? account;
      const result = await erc20.mint({ contract, amount: opts.amount, to });
      output(txOutput(result, { contract, amount: opts.amount, to }), () => {
        printTx(result, 'ERC20 mint confirmed');
      });
    });

  return cmd;
}

function erc20BurnCommand(): Command {
  const cmd = new Command('burn');
  cmd.description('Burn Sovereign ERC20 tokens from the connected wallet');

  cmd
    .requiredOption('--contract <address>', 'ERC20 token contract address')
    .requiredOption('--amount <amount>', 'token amount to burn')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: AmountOptions): Promise<void> => {
      const { erc20 } = createWriteErc20Client(opts);
      const contract = parseAddress(opts.contract, '--contract');
      const result = await erc20.burn({ contract, amount: opts.amount });
      output(txOutput(result, { contract, amount: opts.amount }), () => {
        printTx(result, 'ERC20 burn confirmed');
      });
    });

  return cmd;
}

function erc20BurnFromCommand(): Command {
  const cmd = new Command('burn-from');
  cmd.description('Burn Sovereign ERC20 tokens from another account');

  cmd
    .requiredOption('--contract <address>', 'ERC20 token contract address')
    .requiredOption('--from <address>', 'account to burn from')
    .requiredOption('--amount <amount>', 'token amount to burn')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: BurnFromOptions): Promise<void> => {
      const { erc20 } = createWriteErc20Client(opts);
      const contract = parseAddress(opts.contract, '--contract');
      const from = parseAddress(opts.from, '--from');
      const result = await erc20.burnFrom({ contract, account: from, amount: opts.amount });
      output(txOutput(result, { contract, from, amount: opts.amount }), () => {
        printTx(result, 'ERC20 burn-from confirmed');
      });
    });

  return cmd;
}

function erc20MetadataCommand(): Command {
  const cmd = new Command('metadata');
  cmd.description('Sovereign ERC20 metadata admin subcommands');

  cmd.command('update-token-uri')
    .description('Update a Sovereign ERC20 token URI')
    .requiredOption('--contract <address>', 'ERC20 token contract address')
    .requiredOption('--token-uri <uri>', 'new token metadata URI')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: UpdateTokenUriOptions): Promise<void> => {
      const { erc20 } = createWriteErc20Client(opts);
      const contract = parseAddress(opts.contract, '--contract');
      const result = await erc20.updateTokenUri({ contract, tokenUri: opts.tokenUri });
      output(txOutput(result, { contract, tokenUri: opts.tokenUri }), () => {
        printTx(result, 'ERC20 token URI updated');
      });
    });

  return cmd;
}

function erc20DelegationCommand(): Command {
  const cmd = new Command('delegation');
  cmd.description('Sovereign ERC20 creator delegation subcommands');

  cmd.command('approve')
    .description('Approve a creator delegate for Sovereign ERC20 deployments')
    .requiredOption('--delegate <address>', 'delegate address')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: DelegationOptions): Promise<void> => {
      const { erc20 } = createWriteErc20Client(opts);
      const delegate = parseAddress(opts.delegate, '--delegate');
      const result = await erc20.delegation.delegate({ operator: delegate });
      output(txOutput(result, { delegate }), () => {
        printTx(result, 'ERC20 creator delegate approved');
      });
    });

  cmd.command('revoke')
    .description('Revoke a creator delegate for Sovereign ERC20 deployments')
    .requiredOption('--delegate <address>', 'delegate address')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: DelegationOptions): Promise<void> => {
      const { erc20 } = createWriteErc20Client(opts);
      const delegate = parseAddress(opts.delegate, '--delegate');
      const result = await erc20.delegation.revoke({ operator: delegate });
      output(txOutput(result, { delegate }), () => {
        printTx(result, 'ERC20 creator delegate revoked');
      });
    });

  cmd.command('status')
    .description('Read Sovereign ERC20 creator delegation status')
    .requiredOption('--creator <address>', 'creator address')
    .requiredOption('--delegate <address>', 'delegate address')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: DelegationStatusOptions): Promise<void> => {
      const { erc20 } = createReadErc20Client(opts);
      const owner = parseAddress(opts.creator, '--creator');
      const operator = parseAddress(opts.delegate, '--delegate');
      const approved = await erc20.delegation.isDelegate({
        owner,
        operator,
      });
      const status = { owner, operator, approved };
      output(status, () => {
        printUnknownRecord('ERC20 Creator Delegation', status);
      });
    });

  return cmd;
}

function erc20RewardsCommand(): Command {
  const cmd = new Command('rewards');
  cmd.description('Sovereign ERC20 rewards subcommands');

  cmd.command('status')
    .description('Read Sovereign ERC20 rewards status')
    .requiredOption('--contract <address>', 'ERC20 token contract address')
    .option('--account <address>', 'account to include claimable rewards')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: AccountStatusOptions): Promise<void> => {
      const { erc20 } = createReadErc20Client(opts);
      const status = await erc20.rewards.status({
        contract: parseAddress(opts.contract, '--contract'),
        account: parseOptionalAddress(opts.account, '--account'),
      });
      output(status, () => {
        printUnknownRecord('ERC20 Rewards Status', status);
      });
    });

  cmd.command('notify')
    .alias('deposit')
    .description('Notify a Sovereign ERC20 rewards market of deposited rewards')
    .requiredOption('--contract <address>', 'ERC20 token contract address')
    .requiredOption('--amount <amount>', 'reward token amount to notify')
    .option('--yes', 'yes to approval prompts')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: RewardsDepositOptions): Promise<void> => {
      const { erc20 } = createWriteErc20Client(opts);
      const contract = parseAddress(opts.contract, '--contract');
      const params = { contract, amount: opts.amount };
      const result = await runWithPaymentApprovalConsent({
        commandName: 'rare erc20 rewards notify',
        approvalMessage: 'ERC20 approval is required before notifying rewards.',
        runWithoutApproval: async () => erc20.rewards.notify({ ...params, autoApprove: opts.yes === true }),
        runWithApproval: async () => erc20.rewards.notify({ ...params, autoApprove: true }),
      });
      if (result === undefined) {
        return;
      }
      output(txOutput(result, { contract, amount: opts.amount, approvalTxHash: result.approvalTxHash ?? null }), () => {
        printTx(result, 'ERC20 rewards notified');
      });
    });

  cmd.command('sync')
    .description('Sync pending rewards for a Sovereign ERC20 rewards market')
    .requiredOption('--contract <address>', 'ERC20 token contract address')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: ContractOptions): Promise<void> => {
      const { erc20 } = createWriteErc20Client(opts);
      const contract = parseAddress(opts.contract, '--contract');
      const result = await erc20.rewards.sync({ contract });
      output(txOutput(result, { contract }), () => {
        printTx(result, 'ERC20 rewards synced');
      });
    });

  cmd.command('claim')
    .description('Claim rewards from a Sovereign ERC20 rewards market')
    .requiredOption('--contract <address>', 'ERC20 token contract address')
    .option('--recipient <address>', 'reward recipient (defaults to connected wallet)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: RewardsClaimOptions): Promise<void> => {
      const { erc20 } = createWriteErc20Client(opts);
      const contract = parseAddress(opts.contract, '--contract');
      const recipient = parseOptionalAddress(opts.recipient, '--recipient');
      const result = await erc20.rewards.claim({ contract, recipient });
      output(txOutput(result, { contract, recipient: recipient ?? null }), () => {
        printTx(result, 'ERC20 rewards claimed');
      });
    });

  cmd.command('exclude')
    .description('Exclude an account from Sovereign ERC20 holder rewards')
    .requiredOption('--contract <address>', 'ERC20 token contract address')
    .requiredOption('--account <address>', 'account to exclude')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: RewardsAccountOptions): Promise<void> => {
      const { erc20 } = createWriteErc20Client(opts);
      const contract = parseAddress(opts.contract, '--contract');
      const account = parseAddress(opts.account, '--account');
      const result = await erc20.rewards.exclude({ contract, account });
      output(txOutput(result, { contract, account }), () => {
        printTx(result, 'ERC20 rewards account excluded');
      });
    });

  cmd.command('include')
    .description('Include an account in Sovereign ERC20 holder rewards')
    .requiredOption('--contract <address>', 'ERC20 token contract address')
    .requiredOption('--account <address>', 'account to include')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: RewardsAccountOptions): Promise<void> => {
      const { erc20 } = createWriteErc20Client(opts);
      const contract = parseAddress(opts.contract, '--contract');
      const account = parseAddress(opts.account, '--account');
      const result = await erc20.rewards.include({ contract, account });
      output(txOutput(result, { contract, account }), () => {
        printTx(result, 'ERC20 rewards account included');
      });
    });

  return cmd;
}

async function deployErc20(
  erc20: Erc20Namespace,
  kind: Erc20DeployKind,
  params: Erc20DeployParams,
): Promise<Erc20TransactionResult> {
  if (kind === 'sovereign') {
    return erc20.deploy.sovereign(params);
  }
  if (kind === 'sovereign-market') {
    return erc20.deploy.sovereignMarket(params);
  }
  return erc20.deploy.sovereignMarketRewards(params);
}

function buildDeployParams(params: {
  kind: Erc20DeployKind;
  name: string;
  symbol: string;
  tokenUri: string;
  owner?: Address;
  initialSupply?: string;
  maxSupply?: string;
  rewardToken?: Erc20RewardToken;
  curves?: LiquidCurveSegment[];
}): Erc20DeployParams {
  const ownerParams = params.owner === undefined ? {} : { owner: params.owner };
  const curveParams = params.curves === undefined ? {} : { curves: params.curves };
  const initialSupply = params.initialSupply ?? (params.kind === 'sovereign' ? '0' : undefined);
  const initialSupplyParams = initialSupply === undefined ? {} : { initialSupply };
  const maxSupplyParams = params.maxSupply === undefined ? {} : { maxSupply: params.maxSupply };
  const rewardTokenParams = params.rewardToken === undefined ? {} : { rewardToken: params.rewardToken };

  return {
    name: params.name,
    symbol: params.symbol,
    tokenUri: params.tokenUri,
    ...ownerParams,
    ...initialSupplyParams,
    ...maxSupplyParams,
    ...curveParams,
    ...rewardTokenParams,
  };
}

async function readCurveFile(
  rare: RareClient,
  erc20: Erc20Namespace,
  path: string | undefined,
  initialSupply: string | undefined,
): Promise<LiquidCurveSegment[]> {
  if (path === undefined) {
    throw new Error('--curves-file is required for ERC20 market deploy kinds.');
  }
  if (initialSupply === undefined) {
    throw new Error('--initial-supply is required for ERC20 market deploy kinds.');
  }

  const [raw, factoryConfig] = await Promise.all([
    readFile(path, 'utf-8'),
    resolveCurveFactoryConfig(rare, erc20),
  ]);
  return parseCurveConfig(raw, initialSupply, factoryConfig.poolTickSpacing);
}

async function resolveCurveFactoryConfig(
  rare: RareClient,
  erc20: Erc20Namespace,
): Promise<CurveFactoryConfig> {
  if (erc20.getFactoryConfig !== undefined) {
    return erc20.getFactoryConfig();
  }
  return rare.liquidEdition.getFactoryConfig();
}

async function preflightErc20DeployReadiness(
  erc20: Erc20Namespace,
  kind: Erc20DeployKind,
  rewardToken: Erc20RewardToken | undefined,
): Promise<void> {
  if (erc20.factoryStatus === undefined) {
    return;
  }

  const status = await erc20.factoryStatus();
  const readinessError = getErc20DeployReadinessError(status, kind, rewardToken);
  if (readinessError !== undefined) {
    throw new Error(readinessError);
  }
}

function getErc20DeployReadinessError(
  status: Erc20FactoryStatus,
  kind: Erc20DeployKind,
  rewardToken: Erc20RewardToken | undefined,
): string | undefined {
  const implementation = status.implementations?.[kind];
  if (implementation !== undefined) {
    if (implementation.implementation !== undefined && isAddressEqual(implementation.implementation, zeroAddress)) {
      return `Sovereign ERC20 kind "${kind}" is not configured in the factory.`;
    }
    if (implementation.enabled === false) {
      return `Sovereign ERC20 kind "${kind}" is not enabled in the factory.`;
    }
  }

  if (rewardToken === undefined) {
    return undefined;
  }

  const rewardStatus = status.rewardTokens?.[rewardToken];
  if (rewardStatus?.allowed === false) {
    return `Sovereign ERC20 reward token "${rewardToken}" is not approved by the factory.`;
  }
  return undefined;
}

function validateDeployOptionShape(kind: Erc20DeployKind, opts: Erc20DeployOptions): void {
  if (opts.maxSupply !== undefined && kind !== 'sovereign') {
    throw new Error('--max-supply is only valid with --kind sovereign.');
  }
  if (kind === 'sovereign-market-rewards' && opts.rewardToken === undefined) {
    throw new Error('--reward-token is required with --kind sovereign-market-rewards.');
  }
  if (isMarketKind(kind) && opts.initialSupply === undefined) {
    throw new Error('--initial-supply is required for ERC20 market deploy kinds.');
  }
  if (opts.curvesFile !== undefined && !isMarketKind(kind)) {
    throw new Error('--curves-file is only valid with ERC20 market deploy kinds.');
  }
  if (opts.rewardToken !== undefined && kind !== 'sovereign-market-rewards') {
    throw new Error('--reward-token is only valid with --kind sovereign-market-rewards.');
  }
}

function parseDeployKind(value: string | undefined): Erc20DeployKind {
  if (value === undefined || value === 'sovereign-market') {
    return 'sovereign-market';
  }
  if (value === 'sovereign' || value === 'sovereign-market-rewards') {
    return value;
  }
  throw new Error('--kind must be sovereign, sovereign-market, or sovereign-market-rewards.');
}

function parseRewardTokenOption(value: string | undefined, kind: Erc20DeployKind): Erc20RewardToken | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === 'self' || value === 'rare' || value === 'usdc') {
    return value;
  }
  if (kind === 'sovereign-market-rewards') {
    throw new Error('--reward-token must be self, rare, or usdc.');
  }
  return undefined;
}

function isMarketKind(kind: Erc20DeployKind): boolean {
  return kind === 'sovereign-market' || kind === 'sovereign-market-rewards';
}

function createReadErc20Client(opts: ChainOptions): { rare: RareClient; erc20: Erc20Namespace } {
  const chain = getActiveChain(opts.chain, opts.chainId);
  const publicClient = getPublicClient(chain);
  const wallet = tryGetWalletClient(chain);
  const rare = createRareClient({ publicClient, walletClient: wallet?.client });
  return { rare, erc20: requireErc20Namespace(rare) };
}

function createWriteErc20Client(opts: ChainOptions): { rare: RareClient; erc20: Erc20Namespace; account: Address } {
  const chain = getActiveChain(opts.chain, opts.chainId);
  const publicClient = getPublicClient(chain);
  const { client, account } = getWalletClient(chain);
  const rare = createRareClient({ publicClient, walletClient: client });
  return { rare, erc20: requireErc20Namespace(rare), account: account.address };
}

function requireErc20Namespace(rare: RareClient): Erc20Namespace {
  const candidate: unknown = rare;
  if (!isRecord(candidate) || !isErc20Namespace(candidate.erc20)) {
    throw new Error('The configured SDK client does not expose rare.erc20 yet.');
  }
  return candidate.erc20;
}

function isErc20Namespace(value: unknown): value is Erc20Namespace {
  if (!isRecord(value) || !isRecord(value.deploy)) {
    return false;
  }
  if (
    typeof value.deploy.sovereign !== 'function' ||
    typeof value.deploy.sovereignMarket !== 'function' ||
    typeof value.deploy.sovereignMarketRewards !== 'function'
  ) {
    return false;
  }
  return typeof value.status === 'function' &&
    typeof value.mint === 'function' &&
    typeof value.burn === 'function' &&
    typeof value.burnFrom === 'function' &&
    typeof value.updateTokenUri === 'function' &&
    isRecord(value.delegation) &&
    typeof value.delegation.delegate === 'function' &&
    typeof value.delegation.revoke === 'function' &&
    typeof value.delegation.isDelegate === 'function' &&
    isRecord(value.rewards) &&
    typeof value.rewards.status === 'function' &&
    typeof value.rewards.notify === 'function' &&
    typeof value.rewards.sync === 'function' &&
    typeof value.rewards.claim === 'function' &&
    typeof value.rewards.exclude === 'function' &&
    typeof value.rewards.include === 'function';
}

function txOutput(result: Erc20TransactionResult, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    txHash: result.txHash,
    blockNumber: result.receipt.blockNumber.toString(),
    ...(result.approvalTxHash === undefined ? {} : { approvalTxHash: result.approvalTxHash }),
    ...extra,
  };
}

function printTx(result: Erc20TransactionResult, message: string): void {
  if (result.approvalTxHash !== undefined) {
    console.log(`Approval tx sent: ${result.approvalTxHash}`);
  }
  console.log(`Transaction sent: ${result.txHash}`);
  console.log(`${message}. Block: ${result.receipt.blockNumber.toString()}`);
}

function printUnknownRecord(title: string, value: unknown): void {
  console.log(`\n${title}:`);
  if (!isRecord(value)) {
    console.log(`  ${formatOutputValue(value)}`);
    return;
  }

  for (const [key, fieldValue] of Object.entries(value)) {
    console.log(`  ${key}: ${formatOutputValue(fieldValue)}`);
  }
}

function formatOutputValue(value: unknown): string {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null) {
    return 'null';
  }
  const serialized = JSON.stringify(value, bigintJsonReplacer);
  return serialized;
}

function bigintJsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
