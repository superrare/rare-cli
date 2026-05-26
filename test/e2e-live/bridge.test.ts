import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createRareClient } from '../../src/sdk/client.js';
import { getBridgeInfo } from '../../src/sdk/bridge-core.js';
import { viemChains } from '../../src/contracts/addresses.js';
import {
  approveToken,
  cleanupLiveFixture,
  createLiveFixture,
  expectTokenBalanceAtLeast,
  LiveFixtureRef,
  liveRpcUrl,
  missingEnv,
  parseTokenAmount,
  readTokenAllowance,
  step,
  type LiveFixture,
} from './helpers/live-harness.js';

const describeLive = missingEnv.length === 0 ? describe.sequential : describe.skip;
const live = new LiveFixtureRef<LiveFixture>(`Live environment is not configured: ${missingEnv.join(', ')}`);

describeLive('live RARE bridge SDK write flow', () => {
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

    const account = privateKeyToAccount(fixture.sellerWallet.privateKey);
    const publicClient = createPublicClient({
      chain: viemChains.sepolia,
      transport: http(liveRpcUrl()),
    });
    const walletClient = createWalletClient({
      account,
      chain: viemChains.sepolia,
      transport: http(liveRpcUrl()),
    });
    const rare = createRareClient({ publicClient, walletClient });

    const result = await step('bridge RARE from Sepolia to Base Sepolia', () =>
      rare.bridge.send({
        amount,
        destinationChain: 'base-sepolia',
        recipient: fixture.sellerAddress,
      }),
    );
    console.error(`[live e2e] bridge approval tx: ${result.approvalTxHash ?? 'none'}`);
    console.error(`[live e2e] bridge source tx: ${result.txHash}`);
    console.error(`[live e2e] bridge CCIP explorer: ${result.ccipExplorerUrl}`);

    expect(result.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(result.approvalTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(result.ccipExplorerUrl).toBe(`https://ccip.chain.link/tx/${result.txHash}`);
    expect(result.amount).toBe(amountWei);
    expect(result.sourceChain).toBe('sepolia');
    expect(result.destinationChain).toBe('base-sepolia');
    expect(result.sourceBridgeAddress).toBe(bridgeInfo.rareBridgeAddress);
    expect(result.destinationBridgeAddress).toBe(getBridgeInfo('base-sepolia').rareBridgeAddress);
    expect(result.nativeFee).toBeGreaterThan(0n);
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
