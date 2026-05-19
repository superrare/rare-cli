import { Command } from 'commander';
import { formatUnits } from 'viem';
import { getPublicClient, getWalletClient } from '../client.js';
import { getActiveChain } from '../config.js';
import { createRareClient } from '../sdk/client.js';
import { parseAddress } from '../sdk/validation.js';
import { log, output } from '../output.js';
import type { LiquidEditionPoolKey, RareClient } from '../sdk/types.js';
import { deployLiquidEditionCommand } from './deploy.js';

type ChainOptions = {
  chain?: string;
  chainId?: string;
};

type ContractOptions = ChainOptions & {
  contract: string;
};

type SetRenderContractOptions = ContractOptions & {
  renderContract: string;
};

type LiquidEditionTelemetry = Awaited<ReturnType<RareClient['liquidEdition']['status']>>;

export function liquidEditionCommand(): Command {
  const cmd = new Command('liquid-edition');
  cmd.description('Inspect and manage Liquid Edition tokens');

  const deploy = new Command('deploy');
  deploy.description('Deploy Liquid Edition contracts');
  deploy.addCommand(deployLiquidEditionCommand());
  cmd.addCommand(deploy);
  cmd.addCommand(liquidEditionStatusCommand());
  cmd.addCommand(liquidEditionTokenUriCommand());
  cmd.addCommand(liquidEditionSetRenderContractCommand());

  return cmd;
}

function liquidEditionStatusCommand(): Command {
  const cmd = new Command('status');
  cmd.description('Read Liquid Edition metadata, pool, and market telemetry');

  cmd
    .requiredOption('--contract <address>', 'Liquid Edition token contract address')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: ContractOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const contract = parseAddress(opts.contract, '--contract');
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient });
      const telemetry = await rare.liquidEdition.status({ contract });

      output(telemetry, () => {
        printLiquidEditionTelemetry(telemetry);
      });
    });

  return cmd;
}

function liquidEditionTokenUriCommand(): Command {
  const cmd = new Command('token-uri');
  cmd.description('Read the Liquid Edition token URI');

  cmd
    .requiredOption('--contract <address>', 'Liquid Edition token contract address')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: ContractOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const contract = parseAddress(opts.contract, '--contract');
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient });
      const tokenUri = await rare.liquidEdition.getTokenUri({ contract });

      output(
        { contract, tokenUri },
        () => {
          console.log(tokenUri);
        },
      );
    });

  return cmd;
}

function liquidEditionSetRenderContractCommand(): Command {
  const cmd = new Command('set-render-contract');
  cmd.description('Set the render contract for a Liquid Edition token');

  cmd
    .requiredOption('--contract <address>', 'Liquid Edition token contract address')
    .requiredOption('--render-contract <address>', 'render contract address')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (opts: SetRenderContractOptions): Promise<void> => {
      const chain = getActiveChain(opts.chain, opts.chainId);
      const contract = parseAddress(opts.contract, '--contract');
      const renderContract = parseAddress(opts.renderContract, '--render-contract');
      const publicClient = getPublicClient(chain);
      const { client } = getWalletClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Setting Liquid Edition render contract on ${chain}...`);
      log(`  Token:           ${contract}`);
      log(`  Render contract: ${renderContract}`);

      const result = await rare.liquidEdition.setRenderContract({ contract, renderContract });

      output(
        {
          txHash: result.txHash,
          blockNumber: result.receipt.blockNumber.toString(),
          contract: result.contract,
          renderContract: result.renderContract,
        },
        () => {
          console.log(`Transaction sent: ${result.txHash}`);
          console.log(`Confirmed in block ${result.receipt.blockNumber}`);
          console.log(`Render contract set: ${result.renderContract}`);
        },
      );
    });

  return cmd;
}

function printLiquidEditionTelemetry(telemetry: LiquidEditionTelemetry): void {
  console.log('\nLiquid Edition:');
  console.log(`  Address:             ${telemetry.contract}`);
  console.log(`  Name:                ${telemetry.name}`);
  console.log(`  Symbol:              ${telemetry.symbol}`);
  console.log(`  Decimals:            ${telemetry.decimals}`);
  console.log(`  Total Supply:        ${formatUnits(telemetry.totalSupply, telemetry.decimals)}`);
  console.log(`  Max Total Supply:    ${formatUnits(telemetry.maxTotalSupply, telemetry.decimals)}`);
  console.log(`  Pool Launch Supply:  ${formatUnits(telemetry.poolLaunchSupply, telemetry.decimals)}`);
  console.log(`  Creator Reward:      ${formatUnits(telemetry.creatorLaunchReward, telemetry.decimals)}`);
  console.log(`  Creator:             ${telemetry.tokenCreator}`);
  console.log(`  Base Token:          ${telemetry.baseToken}`);
  console.log(`  Token URI:           ${formatLongValue(telemetry.tokenUri)}`);
  console.log(`  Initial Token URI:   ${formatLongValue(telemetry.initialTokenUri)}`);
  console.log(`  Render Contract:     ${telemetry.renderContract}`);

  console.log('\nPool:');
  console.log(`  Pool ID:             ${telemetry.pool.poolId}`);
  console.log(`  Pool Manager:        ${telemetry.poolManager}`);
  printPoolKey(telemetry.pool.poolKey);
  console.log(`  LP Tick Lower:       ${telemetry.lpTickLower}`);
  console.log(`  LP Tick Upper:       ${telemetry.lpTickUpper}`);
  console.log(`  LP Liquidity:        ${telemetry.lpLiquidity}`);
  console.log(`  Total Liquidity:     ${telemetry.totalLiquidity}`);

  console.log('\nMarket:');
  console.log(`  RARE per Token:      ${formatUnits(telemetry.currentPrice.rarePerToken, 18)}`);
  console.log(`  Token per RARE:      ${formatUnits(telemetry.currentPrice.tokenPerRare, telemetry.decimals)}`);
  console.log(`  Sqrt Price X96:      ${telemetry.marketState.sqrtPriceX96}`);
  console.log(`  Current Tick:        ${telemetry.marketState.currentTick}`);
  console.log(`  Market Liquidity:    ${telemetry.marketState.liquidity}`);
  console.log(`  Current Supply:      ${formatUnits(telemetry.marketState.currentSupply, telemetry.decimals)}`);
}

function printPoolKey(poolKey: LiquidEditionPoolKey): void {
  console.log('  Pool Key:');
  console.log(`    Currency 0:        ${poolKey.currency0}`);
  console.log(`    Currency 1:        ${poolKey.currency1}`);
  console.log(`    Fee:               ${poolKey.fee}`);
  console.log(`    Tick Spacing:      ${poolKey.tickSpacing}`);
  console.log(`    Hooks:             ${poolKey.hooks}`);
}

function formatLongValue(value: string, maxLength = 160): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}
