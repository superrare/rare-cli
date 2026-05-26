import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getBridgeInfo } from '../../src/sdk/bridge-core.js';
import {
  approveToken,
  cleanupLiveFixture,
  createLiveFixture,
  expectTokenBalanceAtLeast,
  LiveFixtureRef,
  jsonCommand,
  missingEnv,
  parseTokenAmount,
  readTokenAllowance,
  step,
  type LiveFixture,
} from './helpers/live-harness.js';

const describeLive = missingEnv.length === 0 ? describe.sequential : describe.skip;
const live = new LiveFixtureRef<LiveFixture>(`Live environment is not configured: ${missingEnv.join(', ')}`);

type BridgeCliResult = {
  txHash: string;
  blockNumber: string;
  approvalTxHash: string | null;
  ccipExplorerUrl: string;
  sourceChain: string;
  sourceChainId: number;
  destinationChain: string;
  destinationChainId: number;
  sourceBridgeAddress: string;
  destinationBridgeAddress: string;
  rareTokenAddress: string;
  destinationCcipChainSelector: string;
  amount: string;
  recipient: string;
  nativeFee: string;
  estimatedGas: string | null;
  distributionData: `0x${string}`;
};

describeLive('live RARE bridge CLI write flow', () => {
  beforeAll(async () => {
    live.set(await createLiveFixture());
  });

  afterAll(async () => {
    await cleanupLiveFixture(live.optionalValue);
  });

  it('bridges RARE from Sepolia to Base Sepolia through CCIP', async () => {
    const fixture = live.value;
    if (fixture.chain !== 'sepolia') {
      return;
    }

    const amount = liveBridgeRareAmount();
    const amountWei = await parseTokenAmount(fixture, fixture.rareAddress, amount);
    const bridgeInfo = getBridgeInfo('sepolia');

    await expectTokenBalanceAtLeast(fixture, fixture.sellerAddress, fixture.rareAddress, amount);
    await step('set bridge RARE allowance below transfer amount', () =>
      approveToken(fixture, fixture.rareAddress, bridgeInfo.rareBridgeAddress, 0n, 'seller'),
    );
    expect(await readTokenAllowance(
      fixture,
      fixture.rareAddress,
      fixture.sellerAddress,
      bridgeInfo.rareBridgeAddress,
    )).toBe(0n);

    const result = await step('bridge RARE from Sepolia to Base Sepolia', () =>
      jsonCommand<BridgeCliResult>(fixture.sellerHome, [
        'bridge',
        'send',
        '--amount',
        amount,
        '--destination-chain',
        'base-sepolia',
        '--recipient',
        fixture.sellerAddress,
        '--chain',
        'sepolia',
      ], 360_000),
    );
    console.error(`[live e2e] bridge approval tx: ${result.approvalTxHash ?? 'none'}`);
    console.error(`[live e2e] bridge source tx: ${result.txHash}`);
    console.error(`[live e2e] bridge CCIP explorer: ${result.ccipExplorerUrl}`);

    expect(result.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(result.approvalTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(result.blockNumber).toMatch(/^\d+$/);
    expect(result.ccipExplorerUrl).toBe(`https://ccip.chain.link/tx/${result.txHash}`);
    expect(result.amount).toBe(amountWei.toString());
    expect(result.sourceChain).toBe('sepolia');
    expect(result.sourceChainId).toBe(11155111);
    expect(result.destinationChain).toBe('base-sepolia');
    expect(result.destinationChainId).toBe(84532);
    expect(result.sourceBridgeAddress).toBe(bridgeInfo.rareBridgeAddress);
    expect(result.destinationBridgeAddress).toBe(getBridgeInfo('base-sepolia').rareBridgeAddress);
    expect(BigInt(result.nativeFee)).toBeGreaterThan(0n);
    expect(await readTokenAllowance(
      fixture,
      fixture.rareAddress,
      fixture.sellerAddress,
      bridgeInfo.rareBridgeAddress,
    )).toBeGreaterThan(amountWei);
  }, 360_000);
});

function liveBridgeRareAmount(): string {
  return process.env.E2E_BRIDGE_RARE_AMOUNT ?? '0.000001';
}
