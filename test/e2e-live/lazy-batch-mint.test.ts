import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isAddress, type Address } from 'viem';
import { getContractAddresses } from '../../src/contracts/addresses.js';
import {
  cleanupLiveFixture,
  createLiveFixture,
  expectTx,
  jsonCommand,
  LiveFixtureRef,
  missingEnv,
  step,
  uniqueSymbol,
  uniqueTokenName,
  type LiveFixture,
  type TxResult,
} from './helpers/live-harness.js';

type LazyBatchMintDeployResult = TxResult & {
  contract: Address;
};

const describeLive = missingEnv.length === 0 ? describe.sequential : describe.skip;
const live = new LiveFixtureRef<LiveFixture>(`Live environment is not configured: ${missingEnv.join(', ')}`);

describeLive('live lazy batch mint CLI write command', () => {
  beforeAll(async () => {
    live.set(await createLiveFixture());
  });

  afterAll(async () => {
    await cleanupLiveFixture(live.optionalValue);
  });

  it('deploys an uncapped Lazy Sovereign Batch Mint collection', async () => {
    const fixture = live.value;
    expect(getContractAddresses(fixture.chain).lazyBatchMintFactory).toBeDefined();

    const deployed = await step(`deploy lazy batch mint collection on ${fixture.chain}`, () =>
      jsonCommand<LazyBatchMintDeployResult>(fixture.sellerHome, [
        'collection',
        'create',
        'lazy-batch-mint',
        uniqueTokenName('Rare CLI Lazy E2E'),
        uniqueSymbol('LZY'),
        '--chain',
        fixture.chain,
        '--chain-id',
        String(fixture.chainId),
      ], 240_000),
    );

    expectTx(deployed);
    expect(isAddress(deployed.contract)).toBe(true);
    const bytecode = await fixture.publicClient.getCode({ address: deployed.contract });
    expect(bytecode).toBeDefined();
    expect(bytecode).not.toBe('0x');
  });
});
