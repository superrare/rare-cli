import { afterAll, beforeAll, describe, expect, it, type TestContext } from 'vitest';
import { isAddress, isAddressEqual, type Address } from 'viem';
import {
  cleanupLiveFixture,
  createLiveFixture,
  expectTx,
  LiveFixtureRef,
  missingEnv,
  uniqueSymbol,
  uniqueTokenName,
  type LiveFixture,
} from './helpers/live-harness.js';
import {
  assertCommonSovereignErc20State,
  defaultMarketTokenUri,
  deploySovereignErc20,
  expectedRewardToken,
  readSovereignErc20OnchainState,
  type DeploySovereignErc20Params,
} from './helpers/live-erc20.js';

const describeLive = missingEnv.length === 0 ? describe.sequential : describe.skip;
const live = new LiveFixtureRef<LiveFixture>(
  `Live ERC20 environment is not configured: ${missingEnv.join(', ')}`,
);

describeLive('live deploy Sovereign ERC20 CLI write command', () => {
  beforeAll(async () => {
    live.set(await createLiveFixture());
  });

  afterAll(async () => {
    await cleanupLiveFixture(live.optionalValue);
  });

  it('deploys a core Sovereign ERC20 and verifies raw on-chain state', async (ctx) => {
    await requireSepolia(ctx);
    await deployAndAssert({
      kind: 'sovereign',
      name: uniqueTokenName('Rare CLI ERC20 Core E2E'),
      symbol: uniqueSymbol('E2C'),
      initialSupply: '1000',
      maxSupply: '1000000',
    });
  });

  it('deploys a market Sovereign ERC20 and verifies raw on-chain state', async (ctx) => {
    await requireSepolia(ctx);
    await deployAndAssert({
      kind: 'sovereign-market',
      name: uniqueTokenName('Rare CLI ERC20 Market E2E'),
      symbol: uniqueSymbol('E2M'),
      initialSupply: '1000',
      tokenUri: defaultMarketTokenUri('sovereign-market'),
    }, { market: true });
  });

  it('deploys a market rewards Sovereign ERC20 and verifies reward token state', async (ctx) => {
    await requireSepolia(ctx);
    const params = {
      kind: 'sovereign-market-rewards',
      name: uniqueTokenName('Rare CLI ERC20 Rewards E2E'),
      symbol: uniqueSymbol('E2R'),
      initialSupply: '1000',
      tokenUri: defaultMarketTokenUri('sovereign-market-rewards'),
      rewardToken: 'self',
    } satisfies DeploySovereignErc20Params;

    const deployed = await deployAndAssert(params, { rewards: true });
    const state = await readSovereignErc20OnchainState(live.value, deployed.contract, { rewards: true });

    expect(state.rewardToken).toBeDefined();
    expect(isAddressEqual(state.rewardToken!, expectedRewardToken(live.value, params.rewardToken, deployed.contract))).toBe(true);
  });
});

async function deployAndAssert(
  params: DeploySovereignErc20Params,
  options: { market?: boolean; rewards?: boolean } = {},
): Promise<{ contract: Address }> {
  const fixture = live.value;
  const deployed = await deploySovereignErc20(fixture, params);

  expectTx(deployed);
  expect(isAddress(deployed.contract)).toBe(true);
  expect(deployed.chainId).toBe(fixture.chainId);
  expect(deployed.kind).toBe(params.kind);
  expect(deployed.name).toBe(params.name);
  expect(deployed.symbol).toBe(params.symbol);

  const state = await readSovereignErc20OnchainState(fixture, deployed.contract, options);
  assertCommonSovereignErc20State(state, deployed, fixture, params);

  return { contract: deployed.contract };
}

async function requireSepolia(ctx: TestContext): Promise<void> {
  if (live.value.chain !== 'sepolia') {
    ctx.skip(`Sovereign ERC20 deploy E2E is scoped to Ethereum Sepolia; configured live chain is ${live.value.chain}.`);
  }
}
